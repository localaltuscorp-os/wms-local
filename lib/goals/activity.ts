import "server-only";
import { db } from "@/lib/db";
import { emit } from "@/lib/events/emit";
import { GOAL_AGGREGATE, type GoalActivityV1 } from "@/lib/events/types";

/**
 * Goals canvas Phase 7 (design §4.4 item 6) — BEST-EFFORT activity emission to
 * the existing event_log/event_consumers outbox, powering the LEFT panel's
 * real Activity feed (read back in goalDetailBundle).
 *
 * Deliberately NOT the Law-2 transactional emit: these are DERIVED activity
 * facts (the operational goal row remains the source of truth), so a dropped
 * event only loses a feed line — it must NEVER fail or slow the mutation that
 * produced it. Hence fire-with-catch on the base `db` executor. Truth events
 * that projections score from (GoalProgressLogged via the weekly engine) keep
 * their own paths; this helper only carries the new GoalCascade… / GoalCommented
 * activity family, which every existing consumer default-ignores.
 *
 * OUTBOX_EMIT_OFF (the outbox kill-switch) is honoured inside emit().
 */
export async function logGoalActivity(
  aggregateId: string,
  eventType: string,
  payload: GoalActivityV1 & Record<string, unknown>,
  actorId: string,
): Promise<void> {
  try {
    await emit(db, {
      aggregateType: GOAL_AGGREGATE,
      aggregateId,
      eventType,
      eventVersion: 1,
      payload: payload as unknown as Record<string, unknown>,
      actorId,
    });
  } catch {
    // Best-effort: the feed loses one line; the mutation already succeeded.
  }
}
