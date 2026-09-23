import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { activityLogs } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { classifyRoute } from "@/lib/logs/module-map";
import { sanitizeForLog } from "@/lib/logs/sanitize";
import { isLogEventType } from "@/lib/logs/events";
import { ensureDailySession, touchDailySession } from "@/lib/logs/sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/logs/ingest — the client activity tracker's single door.
 *
 * Accepts a batch of low-risk browsing events (PAGE_VISIT, MODULE_VISIT,
 * VIEW_RECORD, SEARCH, FILTER_APPLIED) buffered in IndexedDB. The server is
 * authoritative for everything here:
 *   · `module`/`page` are RE-DERIVED from `route` (client strings are hints);
 *   · the event type is whitelisted — a client cannot inject a fake CREATE or
 *     APPROVE (mutations are written only by lib/logs/audit.ts);
 *   · the acting employee is the signed-in session, never the payload;
 *   · each event's original `occurredAt` is preserved, so a buffered event
 *     lands at the moment it happened, not when the batch finally flushed.
 *
 * Idempotent: `client_event_id` is unique, so a replayed batch is a no-op.
 */

const CLIENT_EVENT_TYPES = new Set([
  "PAGE_VISIT",
  "MODULE_VISIT",
  "VIEW_RECORD",
  "SEARCH",
  "FILTER_APPLIED",
]);

const MAX_BATCH = 200;

interface IngestEvent {
  clientEventId?: string;
  type?: string;
  route?: string;
  occurredAt?: string;
  resourceType?: string | null;
  resourceId?: string | null;
  resourceName?: string | null;
  query?: string | null;
  estimatedMs?: number | null;
}

export async function POST(req: Request): Promise<Response> {
  let me;
  try {
    me = await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { events?: IngestEvent[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const events = Array.isArray(body.events) ? body.events.slice(0, MAX_BATCH) : [];
  if (events.length === 0) return NextResponse.json({ ok: true, accepted: 0 });

  const now = new Date();
  const session = await ensureDailySession(me.id, now);

  const rows = events
    .filter((e): e is Required<Pick<IngestEvent, "type" | "route">> & IngestEvent => {
      if (!e || typeof e.type !== "string" || !CLIENT_EVENT_TYPES.has(e.type)) return false;
      if (typeof e.route !== "string" || e.route.length > 500) return false;
      return true;
    })
    .map((e) => {
      const cls = classifyRoute(e.route);
      const eventAt = e.occurredAt ? new Date(e.occurredAt) : now;
      const occurred = Number.isNaN(eventAt.getTime()) ? now : eventAt;
      const metadata = sanitizeForLog({
        ...(e.query ? { query: e.query } : {}),
        ...(e.estimatedMs ? { estimatedMs: e.estimatedMs } : {}),
      });
      return {
        employeeId: me.id,
        dailySessionId: session.id,
        eventType: e.type as string,
        route: e.route,
        module: cls.module,
        page: cls.page,
        resourceType: e.resourceType ?? null,
        resourceId: e.resourceId ?? null,
        resourceName: e.resourceName ?? null,
        action: e.type === "SEARCH" ? (e.query ?? null) : null,
        metadata,
        clientEventId: e.clientEventId ?? null,
        actorType: "employee",
        eventAt: occurred,
      };
    });

  if (rows.length === 0) return NextResponse.json({ ok: true, accepted: 0 });

  // Insert; duplicates (replayed batch) are skipped by the unique index.
  await db.insert(activityLogs).values(rows).onConflictDoNothing();

  // Roll the batch up onto today's daily session in ONE write.
  let modules = 0;
  let pages = 0;
  let records = 0;
  let estimatedMs = 0;
  for (const e of events) {
    if (e.type === "MODULE_VISIT") modules += 1;
    else if (e.type === "PAGE_VISIT") pages += 1;
    else if (e.type === "VIEW_RECORD") records += 1;
    if (e.type === "PAGE_VISIT" && typeof e.estimatedMs === "number") {
      estimatedMs += e.estimatedMs;
    }
  }
  await touchDailySession(session.id, {
    events: rows.length,
    modules,
    pages,
    records,
    estimatedMinutes: Math.round(estimatedMs / 60_000),
  }, now);

  return NextResponse.json({ ok: true, accepted: rows.length });
}
