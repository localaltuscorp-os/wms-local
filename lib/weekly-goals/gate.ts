import "server-only";
import { and, asc, eq, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { weeklyGoals } from "@/db/schema";
import type { TaskPriority } from "@/db/enums";
import { currentWeekStart } from "@/lib/weekly-goals/week";
import { gateCheckpoint } from "@/lib/weekly-goals/gate-cadence";
export { gateCheckpoint, isGateDay, istWeekday } from "@/lib/weekly-goals/gate-cadence";

/**
 * Mandatory weekly-goals fill gate (design §6 — Mon/Thu cadence).
 *
 * The team reports progress TWICE a week — every Monday and every Thursday (IST).
 * On those days a user is gated until they (re)record progress for the current
 * checkpoint; on any other day there's no mandatory gate. "Reported for this
 * checkpoint" = `pct_updated_at >= ` today's IST-midnight, so filling on Monday
 * still prompts again on Thursday. A goal is un-reported when `pct_updated_at`
 * is NULL or older than the checkpoint.
 */


/** One un-filled current-week goal, for the fill page's list. */
export interface UnfilledWeekGoal {
  id: string;
  position: number;
  client: string | null;
  subject: string | null;
  targetDone: string | null;
  priority: TaskPriority;
  targetDate: string | null;
  pctDone: number;
  explanation: string | null;
}

function unfilledWhere(employeeId: string, weekStart: string, checkpoint: Date | null) {
  const base = and(
    eq(weeklyGoals.employeeId, employeeId),
    eq(weeklyGoals.weekStart, weekStart),
    eq(weeklyGoals.archived, false),
  );
  // On a gate day, a goal needs re-reporting if it was never filled OR was last
  // filled before this checkpoint. Off a gate day, fall back to "never filled".
  return checkpoint
    ? and(base, or(isNull(weeklyGoals.pctUpdatedAt), lt(weeklyGoals.pctUpdatedAt, checkpoint)))
    : and(base, isNull(weeklyGoals.pctUpdatedAt));
}

/**
 * True when today is a Mon/Thu checkpoint AND the employee has ≥1 current-week
 * goal still un-reported for it — i.e. the gate must show /weekly-goals/fill.
 * Returns false on non-gate days (no mandatory reporting). EXISTS query.
 */
export async function hasUnfilledWeekGoals(
  employeeId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const checkpoint = gateCheckpoint(now);
  if (!checkpoint) return false; // not Monday or Thursday → no mandatory gate
  const weekStart = currentWeekStart(now);
  const rows = await db
    .select({ one: sql<number>`1` })
    .from(weeklyGoals)
    .where(unfilledWhere(employeeId, weekStart, checkpoint))
    .limit(1);
  return rows.length > 0;
}

/** How many current-week goals the employee still needs to report this checkpoint. */
export async function countUnfilledWeekGoals(
  employeeId: string,
  now: Date = new Date(),
): Promise<number> {
  const weekStart = currentWeekStart(now);
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(weeklyGoals)
    .where(unfilledWhere(employeeId, weekStart, gateCheckpoint(now)));
  return row?.n ?? 0;
}

/**
 * The employee's un-filled current-week goals in Sr.-No. order — the rows the
 * fill page renders for inline %-Done + explanation entry.
 */
export async function listUnfilledWeekGoals(
  employeeId: string,
  now: Date = new Date(),
): Promise<UnfilledWeekGoal[]> {
  const weekStart = currentWeekStart(now);
  return db
    .select({
      id: weeklyGoals.id,
      position: weeklyGoals.position,
      client: weeklyGoals.client,
      subject: weeklyGoals.subject,
      targetDone: weeklyGoals.targetDone,
      priority: weeklyGoals.priority,
      targetDate: weeklyGoals.targetDate,
      pctDone: weeklyGoals.pctDone,
      explanation: weeklyGoals.explanation,
    })
    .from(weeklyGoals)
    .where(unfilledWhere(employeeId, weekStart, gateCheckpoint(now)))
    .orderBy(asc(weeklyGoals.position), asc(weeklyGoals.createdAt));
}
