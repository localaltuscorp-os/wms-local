/**
 * PMS Layer 2 — the employee_score_daily projection (mig 0095). The same raw
 * counters as the twin, bucketed by event-day and keyed (day, employee). This is
 * the rebuildable HISTORY that powers the score-trend chart; the twin is the
 * rolled-up CURRENT snapshot.
 *
 * Idempotency (Law 7): each event is applied in the relay's per-event txn that
 * also advances this consumer's cursor → exactly-once increments. Rebuild (Law
 * 4): `rebuildEmployeeScoreDaily()` truncates, resets the cursor, replays.
 *
 * Pure projection — table upserts only, ZERO external effects (Law 8).
 */
import { and, gte, inArray, lte, sql } from "drizzle-orm";
import { db, employeeScoreDaily, eventConsumers } from "@/lib/db";
import { runConsumer } from "@/lib/relay/relay";
import type { Consumer } from "@/lib/relay/relay";
import type { StoredEvent } from "@/lib/events/types";
import { employeeScoreDailyDelta, type DailyScoreDelta } from "./employee-score-daily-rule";

export { employeeScoreDailyDelta, type DailyScoreDelta } from "./employee-score-daily-rule";

export const EMPLOYEE_SCORE_DAILY_CONSUMER = "projection:employee_score_daily";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function applyDelta(tx: Tx, d: DailyScoreDelta, orgId: string | null): Promise<void> {
  const c = employeeScoreDaily;
  await tx
    .insert(employeeScoreDaily)
    .values({
      day: d.day,
      employeeId: d.employeeId,
      orgId,
      presenceDays: d.presenceDays,
      lateCount: d.lateCount,
      punctualDays: d.punctualDays,
      goalEffSumWeighted: String(d.goalEffSumWeighted),
      goalWeightSum: String(d.goalWeightSum),
      goalsCompleted: d.goalsCompleted,
      goalsFilledOnTime: d.goalsFilledOnTime,
      goalProgressEvents: d.goalProgressEvents,
      dccDueCount: d.dccDueCount,
      dccDoneCount: d.dccDoneCount,
      testsPassed: d.testsPassed,
      testsAttempted: d.testsAttempted,
      materialsWatched: d.materialsWatched,
      feedbackCount: d.feedbackCount,
      feedbackRatingSum: String(d.feedbackRatingSum),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [employeeScoreDaily.day, employeeScoreDaily.employeeId],
      set: {
        presenceDays: sql`${c.presenceDays} + ${d.presenceDays}`,
        lateCount: sql`${c.lateCount} + ${d.lateCount}`,
        punctualDays: sql`${c.punctualDays} + ${d.punctualDays}`,
        goalEffSumWeighted: sql`${c.goalEffSumWeighted} + ${d.goalEffSumWeighted}`,
        goalWeightSum: sql`${c.goalWeightSum} + ${d.goalWeightSum}`,
        goalsCompleted: sql`${c.goalsCompleted} + ${d.goalsCompleted}`,
        goalsFilledOnTime: sql`${c.goalsFilledOnTime} + ${d.goalsFilledOnTime}`,
        goalProgressEvents: sql`${c.goalProgressEvents} + ${d.goalProgressEvents}`,
        dccDueCount: sql`${c.dccDueCount} + ${d.dccDueCount}`,
        dccDoneCount: sql`${c.dccDoneCount} + ${d.dccDoneCount}`,
        testsPassed: sql`${c.testsPassed} + ${d.testsPassed}`,
        testsAttempted: sql`${c.testsAttempted} + ${d.testsAttempted}`,
        materialsWatched: sql`${c.materialsWatched} + ${d.materialsWatched}`,
        feedbackCount: sql`${c.feedbackCount} + ${d.feedbackCount}`,
        feedbackRatingSum: sql`${c.feedbackRatingSum} + ${d.feedbackRatingSum}`,
        updatedAt: new Date(),
      },
    });
}

/** The relay consumer. Pure projection — ignores non-employee events. */
export const employeeScoreDailyConsumer: Consumer = {
  name: EMPLOYEE_SCORE_DAILY_CONSUMER,
  async handle(event: StoredEvent, tx: Tx) {
    const delta = employeeScoreDailyDelta(event);
    if (!delta) return;
    await applyDelta(tx, delta, event.orgId ?? null);
  },
};

/** Per-employee daily counters over a date window, straight from the projection
 *  (the score-trend series). Returns [] on an empty id list. */
export async function getEmployeeScoreDaily(opts: {
  employeeIds: string[];
  start: string; // 'YYYY-MM-DD'
  end: string; // 'YYYY-MM-DD'
}) {
  if (opts.employeeIds.length === 0) return [];
  return db
    .select()
    .from(employeeScoreDaily)
    .where(
      and(
        inArray(employeeScoreDaily.employeeId, opts.employeeIds),
        gte(employeeScoreDaily.day, opts.start),
        lte(employeeScoreDaily.day, opts.end),
      ),
    );
}

/** Rebuild the whole projection from the event log (Law 4). */
export async function rebuildEmployeeScoreDaily(): Promise<{ processed: number }> {
  await db.delete(employeeScoreDaily);
  await db
    .insert(eventConsumers)
    .values({ consumer: EMPLOYEE_SCORE_DAILY_CONSUMER, lastSeq: 0, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: eventConsumers.consumer,
      set: { lastSeq: 0, updatedAt: new Date() },
    });
  const res = await runConsumer(employeeScoreDailyConsumer);
  return { processed: res.processed };
}
