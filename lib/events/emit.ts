/**
 * Phase B — the transactional emit (ARCHITECTURE.md Law 2).
 *
 * `emit(tx, event)` appends an event to the immutable log INSIDE the caller's
 * transaction, so the operational row and its event commit or roll back
 * together. NEVER emit a truth event in `after()` / post-response — a drop
 * there corrupts the log forever (Law 2). Pass the `tx` from the surrounding
 * `db.transaction(async (tx) => …)`.
 *
 * Kill-switch: set OUTBOX_EMIT_OFF=true to skip all emits (operational writes
 * proceed exactly as before Phase B). The first line of defence if an emit ever
 * destabilises a write path.
 */
import { db, eventLog } from "@/lib/db";
import type { EventEnvelope } from "./types";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
/** Anything that can run an insert — a transaction (preferred) or the base db. */
export type EventExecutor = Tx | typeof db;

function emitDisabled(): boolean {
  return process.env.OUTBOX_EMIT_OFF === "true";
}

/** New correlation id for a workflow that doesn't already carry one (Law 9). */
export function newCorrelationId(): string {
  return crypto.randomUUID();
}

/** Append one event in the given executor's transaction. */
export async function emit(exec: EventExecutor, ev: EventEnvelope): Promise<void> {
  if (emitDisabled()) return;
  await exec.insert(eventLog).values({
    aggregateType: ev.aggregateType,
    aggregateId: ev.aggregateId,
    eventType: ev.eventType,
    eventVersion: ev.eventVersion ?? 1,
    payload: ev.payload,
    orgId: ev.orgId ?? null,
    correlationId: ev.correlationId ?? newCorrelationId(),
    causationId: ev.causationId ?? null,
    actorId: ev.actorId ?? null,
    ...(ev.occurredAt ? { occurredAt: ev.occurredAt } : {}),
  });
}

/** Append several events atomically in one executor. They share a correlation
 *  id when the caller doesn't set per-event ids (one workflow → one story). */
export async function emitMany(exec: EventExecutor, events: EventEnvelope[]): Promise<void> {
  if (emitDisabled() || events.length === 0) return;
  const correlationId = events[0]?.correlationId ?? newCorrelationId();
  await exec.insert(eventLog).values(
    events.map((ev) => ({
      aggregateType: ev.aggregateType,
      aggregateId: ev.aggregateId,
      eventType: ev.eventType,
      eventVersion: ev.eventVersion ?? 1,
      payload: ev.payload,
      orgId: ev.orgId ?? null,
      correlationId: ev.correlationId ?? correlationId,
      causationId: ev.causationId ?? null,
      actorId: ev.actorId ?? null,
      ...(ev.occurredAt ? { occurredAt: ev.occurredAt } : {}),
    })),
  );
}
