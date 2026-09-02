/**
 * Phase B — the relay (ARCHITECTURE.md Laws 4, 7). Reads the immutable event
 * log past each consumer's cursor and dispatches every new event to that
 * consumer, idempotently and in `seq` order. Each consumer has its OWN cursor,
 * so projections and the command channel advance independently and one slow/
 * broken consumer never blocks another.
 *
 * Delivery is at-least-once: a consumer may see an event more than once (we
 * only advance the cursor AFTER a successful handle, and a crash mid-batch
 * replays from the last persisted cursor). Handlers MUST be idempotent
 * (upserts / dedupe keys) — Law 7.
 *
 * Poison handling: if a handler throws on an event, that consumer STOPS at the
 * last good seq (does not skip the event) and reports the error; other
 * consumers continue. The next relay run retries it. A persistently-failing
 * event is surfaced in the relay result for investigation.
 */
import { asc, eq, gt } from "drizzle-orm";
import { db, eventConsumers, eventLog } from "@/lib/db";
import type { EventLogRow } from "@/lib/db";
import { upcast } from "@/lib/events/upcasters";
import type { StoredEvent } from "@/lib/events/types";

const BATCH = 500;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface Consumer {
  name: string;
  /** Handler for a single event. Runs INSIDE a transaction that also advances
   *  this consumer's cursor to the event's `seq` — so the effect (e.g. a
   *  projection +1) and the cursor commit together and the event is applied
   *  EXACTLY once (Law 7). Use `tx` for all writes; never the base `db`. */
  handle: (event: StoredEvent, tx: Tx) => Promise<void>;
}

export interface ConsumerResult {
  consumer: string;
  processed: number;
  lastSeq: number;
  error?: string;
}

function toStored(row: EventLogRow): StoredEvent {
  return {
    seq: row.seq,
    eventId: row.eventId,
    aggregateType: row.aggregateType,
    aggregateId: row.aggregateId,
    eventType: row.eventType,
    eventVersion: row.eventVersion,
    payload: (row.payload ?? {}) as Record<string, unknown>,
    orgId: row.orgId,
    correlationId: row.correlationId,
    causationId: row.causationId,
    actorId: row.actorId,
    occurredAt: row.occurredAt,
  };
}

async function getCursor(name: string): Promise<number> {
  const row = await db.query.eventConsumers.findFirst({
    where: eq(eventConsumers.consumer, name),
  });
  return row?.lastSeq ?? 0;
}

async function setCursor(exec: Tx | typeof db, name: string, seq: number): Promise<void> {
  await exec
    .insert(eventConsumers)
    .values({ consumer: name, lastSeq: seq, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: eventConsumers.consumer,
      set: { lastSeq: seq, updatedAt: new Date() },
    });
}

/** Drive a single consumer forward from its cursor to the head of the log.
 *  Each event is handled in its own transaction together with the cursor
 *  advance, so a crash never double-applies and never skips. */
export async function runConsumer(c: Consumer): Promise<ConsumerResult> {
  let cursor = await getCursor(c.name);
  let processed = 0;
  for (;;) {
    const rows = await db
      .select()
      .from(eventLog)
      .where(gt(eventLog.seq, cursor))
      .orderBy(asc(eventLog.seq))
      .limit(BATCH);
    if (rows.length === 0) break;
    for (const row of rows) {
      try {
        await db.transaction(async (tx) => {
          await c.handle(upcast(toStored(row)), tx);
          await setCursor(tx, c.name, row.seq);
        });
      } catch (err) {
        return {
          consumer: c.name,
          processed,
          lastSeq: cursor,
          error: `seq ${row.seq} (${row.eventType}): ${err instanceof Error ? err.message : String(err)}`,
        };
      }
      cursor = row.seq;
      processed += 1;
    }
    if (rows.length < BATCH) break;
  }
  return { consumer: c.name, processed, lastSeq: cursor };
}

/** Reset a consumer's cursor (e.g. to rebuild a projection from history, Law 4).
 *  Pass 0 to replay the entire log. */
export async function resetConsumer(name: string, toSeq = 0): Promise<void> {
  await setCursor(db, name, toSeq);
}
