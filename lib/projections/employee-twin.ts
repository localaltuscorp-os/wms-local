/**
 * PMS Layer 2 — the employee_twin projection (mig 0095). A rolled-up CURRENT
 * intelligence snapshot per employee, derived ONLY from the five employee-domain
 * events. It is the "materialize, don't scan" seam for the Score/Promotion/
 * Recognition engines: a cheap point-read of per-person activity, with NO scan
 * of attendance_logs / weekly_goals / dcc_entries / … .
 *
 * Idempotency (Law 7): the relay applies each event inside a transaction that
 * also advances this consumer's cursor, so an event's increment commits exactly
 * once. To rebuild from scratch (Law 4), `rebuildEmployeeTwin()` truncates the
 * table, resets the cursor, and replays the whole log.
 *
 * Pure projection — table upserts only, ZERO external effects (Law 8) — so it
 * runs by default with no command gating.
 */
import { inArray, sql } from "drizzle-orm";
import { db, employeeTwin, eventConsumers } from "@/lib/db";
import { runConsumer } from "@/lib/relay/relay";
import type { Consumer } from "@/lib/relay/relay";
import type { StoredEvent } from "@/lib/events/types";
import { employeeTwinDelta, type TwinDelta } from "./employee-twin-rule";

export { employeeTwinDelta, type TwinDelta } from "./employee-twin-rule";

export const EMPLOYEE_TWIN_CONSUMER = "projection:employee_twin";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Apply one delta into employee_twin, inside the relay's transaction. The
 *  insert seeds the row at the delta's values; the conflict path adds each
 *  counter onto the existing total (integer + numeric increments). */
async function applyDelta(
  tx: Tx,
  delta: TwinDelta,
  orgId: string | null,
  occurredAt: Date,
): Promise<void> {
  const c = employeeTwin;
  await tx
    .insert(employeeTwin)
    .values({
      employeeId: delta.employeeId,
      orgId,
      presenceDays: delta.presenceDays,
      lateCount: delta.lateCount,
      punctualDays: delta.punctualDays,
      goalEffSumWeighted: String(delta.goalEffSumWeighted),
      goalWeightSum: String(delta.goalWeightSum),
      goalsCompleted: delta.goalsCompleted,
      goalsFilledOnTime: delta.goalsFilledOnTime,
      goalProgressEvents: delta.goalProgressEvents,
      dccDueCount: delta.dccDueCount,
      dccDoneCount: delta.dccDoneCount,
      testsPassed: delta.testsPassed,
      testsAttempted: delta.testsAttempted,
      materialsWatched: delta.materialsWatched,
      feedbackCount: delta.feedbackCount,
      feedbackRatingSum: String(delta.feedbackRatingSum),
      lastEventAt: occurredAt,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: employeeTwin.employeeId,
      set: {
        presenceDays: sql`${c.presenceDays} + ${delta.presenceDays}`,
        lateCount: sql`${c.lateCount} + ${delta.lateCount}`,
        punctualDays: sql`${c.punctualDays} + ${delta.punctualDays}`,
        goalEffSumWeighted: sql`${c.goalEffSumWeighted} + ${delta.goalEffSumWeighted}`,
        goalWeightSum: sql`${c.goalWeightSum} + ${delta.goalWeightSum}`,
        goalsCompleted: sql`${c.goalsCompleted} + ${delta.goalsCompleted}`,
        goalsFilledOnTime: sql`${c.goalsFilledOnTime} + ${delta.goalsFilledOnTime}`,
        goalProgressEvents: sql`${c.goalProgressEvents} + ${delta.goalProgressEvents}`,
        dccDueCount: sql`${c.dccDueCount} + ${delta.dccDueCount}`,
        dccDoneCount: sql`${c.dccDoneCount} + ${delta.dccDoneCount}`,
        testsPassed: sql`${c.testsPassed} + ${delta.testsPassed}`,
        testsAttempted: sql`${c.testsAttempted} + ${delta.testsAttempted}`,
        materialsWatched: sql`${c.materialsWatched} + ${delta.materialsWatched}`,
        feedbackCount: sql`${c.feedbackCount} + ${delta.feedbackCount}`,
        feedbackRatingSum: sql`${c.feedbackRatingSum} + ${delta.feedbackRatingSum}`,
        // last_event_at moves monotonically forward (replays stay in seq order).
        lastEventAt: sql`greatest(${c.lastEventAt}, ${occurredAt.toISOString()}::timestamptz)`,
        updatedAt: new Date(),
      },
    });
}

/** The relay consumer. Pure projection — ignores non-employee events. */
export const employeeTwinConsumer: Consumer = {
  name: EMPLOYEE_TWIN_CONSUMER,
  async handle(event: StoredEvent, tx: Tx) {
    const delta = employeeTwinDelta(event);
    if (!delta) return; // foreign / non-counting event
    await applyDelta(tx, delta, event.orgId ?? null, event.occurredAt);
  },
};

/** Point-read the current twin for one or more employees (Law 5 stable read).
 *  Returns [] on an empty id list (never a full-table scan). */
export async function getEmployeeTwin(employeeIds: string[]) {
  if (employeeIds.length === 0) return [];
  return db.select().from(employeeTwin).where(inArray(employeeTwin.employeeId, employeeIds));
}

/** Rebuild the whole projection from the event log (Law 4): truncate, reset the
 *  cursor, replay. Safe to run anytime — the projection is disposable. */
export async function rebuildEmployeeTwin(): Promise<{ processed: number }> {
  await db.delete(employeeTwin);
  await db
    .insert(eventConsumers)
    .values({ consumer: EMPLOYEE_TWIN_CONSUMER, lastSeq: 0, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: eventConsumers.consumer,
      set: { lastSeq: 0, updatedAt: new Date() },
    });
  const res = await runConsumer(employeeTwinConsumer);
  return { processed: res.processed };
}
