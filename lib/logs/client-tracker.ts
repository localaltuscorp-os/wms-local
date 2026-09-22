/**
 * THE CLIENT ACTIVITY TRACKER — buffer events, flush in batches over HTTP.
 *
 * Flow: browser → queueEvent → IndexedDB → batched POST /api/logs/ingest.
 * Rows leave IndexedDB only after the server acknowledges them. A failed flush
 * keeps the rows and retries later; nothing is silently dropped. On page hide
 * the buffer is flushed with `keepalive` so a normal logout, an inactivity
 * timeout or a closing tab cannot strand buffered events.
 *
 * Low-risk events only (PAGE_VISIT, VIEW_RECORD, SEARCH, FILTER_APPLIED,
 * MODULE_VISIT). Mutations are never trusted to this path — the server writes
 * those itself (lib/logs/audit.ts).
 *
 * No WebSockets, no multi-tab identity, no clientInstanceId.
 */

import { idbAll, idbCount, idbDeleteMany, idbPut, type PendingEvent } from "./idb";

export type TrackedEventType =
  | "PAGE_VISIT"
  | "MODULE_VISIT"
  | "VIEW_RECORD"
  | "SEARCH"
  | "FILTER_APPLIED";

export interface TrackInput {
  type: TrackedEventType;
  route: string;
  resourceType?: string | null;
  resourceId?: string | null;
  resourceName?: string | null;
  query?: string | null;
  estimatedMs?: number | null;
  metadata?: Record<string, unknown> | null;
}

const FLUSH_THRESHOLD = 20;
const FLUSH_INTERVAL_MS = 30_000;
const MAX_RETRY_MS = 5 * 60_000;

let timer: ReturnType<typeof setTimeout> | null = null;
let retryDelay = 2_000;
let flushing = false;

function eventId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Buffer one activity event and flush when the batch is full. */
export async function queueEvent(input: TrackInput): Promise<void> {
  const event: PendingEvent = {
    clientEventId: eventId(),
    type: input.type,
    route: input.route,
    occurredAt: new Date().toISOString(),
    resourceType: input.resourceType ?? null,
    resourceId: input.resourceId ?? null,
    resourceName: input.resourceName ?? null,
    query: input.query ?? null,
    estimatedMs: input.estimatedMs ?? null,
    metadata: input.metadata ?? null,
  };
  try {
    await idbPut(event);
  } catch {
    return; // IndexedDB unavailable — never throw into a page render
  }
  const count = await idbCount();
  if (count >= FLUSH_THRESHOLD) {
    scheduleFlush(0);
  }
}

function scheduleFlush(delay: number): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void flush(), delay);
}

/** Exposed to sign-out paths so they can flush before the session dies. */
export async function flushActivityNow(): Promise<void> {
  await flush();
}

async function flush(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    const rows = await idbAll();
    if (rows.length === 0) {
      retryDelay = 2_000;
      return;
    }
    const keepalive = typeof document !== "undefined" && document.visibilityState === "hidden";
    const res = await fetch("/api/logs/ingest", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ events: rows }),
      keepalive,
    });
    if (res.ok) {
      await idbDeleteMany(rows.map((r) => r.id!).filter((n) => typeof n === "number"));
      retryDelay = 2_000;
      return;
    }
    scheduleFlush(retryDelay);
    retryDelay = Math.min(retryDelay * 2, MAX_RETRY_MS);
  } catch {
    // Offline or transient — keep the rows and try again, backing off.
    scheduleFlush(retryDelay);
    retryDelay = Math.min(retryDelay * 2, MAX_RETRY_MS);
  } finally {
    flushing = false;
  }
}

/** Start the interval flush and page-hide flush. Called once by the tracker. */
export function startActivityTracker(): () => void {
  if (typeof window === "undefined") return () => {};

  const interval = setInterval(() => void flush(), FLUSH_INTERVAL_MS);
  const onHide = () => void flush();
  window.addEventListener("pagehide", onHide);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void flush();
  });

  // A global hook so page code can record meaningful searches / record views
  // without importing this module everywhere.
  const w = window as unknown as {
    __wmsActivity?: { record: (input: TrackInput) => void };
  };
  w.__wmsActivity = { record: (input) => void queueEvent(input) };

  return () => {
    clearInterval(interval);
    window.removeEventListener("pagehide", onHide);
  };
}
