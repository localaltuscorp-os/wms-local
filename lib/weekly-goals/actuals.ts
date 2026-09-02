import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { weeklyGoals, weeklyGoalActuals } from "@/db/schema";
import { currentWeekStart, istYmd } from "@/lib/weekly-goals/week";

/**
 * Daily weekly-goal actuals — the per-day progress log that lives on the Daily
 * Checklist "Plan Your Day" page. Feeds the clock-in planning gate: an employee
 * must log today's progress on each OPEN (pct_done < 100) current-week goal
 * before clocking in.
 */

/**
 * True if the employee has ≥1 OPEN current-week goal with NO actuals row logged
 * for today. FAIL-SAFE: callers wrap in `.catch(() => false)` so a DB hiccup
 * never traps a punch / gate.
 */
export async function needsGoalActuals(employeeId: string, now: Date = new Date()): Promise<boolean> {
  const week = currentWeekStart(now);
  const today = istYmd(now);
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(weeklyGoals)
    .leftJoin(
      weeklyGoalActuals,
      and(eq(weeklyGoalActuals.goalId, weeklyGoals.id), eq(weeklyGoalActuals.entryDate, today)),
    )
    .where(
      and(
        eq(weeklyGoals.employeeId, employeeId),
        eq(weeklyGoals.weekStart, week),
        eq(weeklyGoals.archived, false),
        sql`${weeklyGoals.pctDone} < 100`,
        sql`${weeklyGoalActuals.id} is null`,
      ),
    );
  return (rows[0]?.n ?? 0) > 0;
}

/**
 * Labels of the OPEN current-week goals an employee still hasn't logged today —
 * used to make the clock-in block message specific ("log progress on X, Y, Z")
 * instead of a vague "log your goal progress". Same predicate as
 * needsGoalActuals. FAIL-SAFE: callers wrap in `.catch(() => [])`.
 */
export async function unloggedGoalLabels(employeeId: string, now: Date = new Date()): Promise<string[]> {
  const week = currentWeekStart(now);
  const today = istYmd(now);
  const rows = await db
    .select({
      label: sql<string>`coalesce(nullif(trim(${weeklyGoals.targetDone}), ''), nullif(trim(${weeklyGoals.subject}), ''), nullif(trim(${weeklyGoals.client}), ''), 'Weekly goal')`,
    })
    .from(weeklyGoals)
    .leftJoin(
      weeklyGoalActuals,
      and(eq(weeklyGoalActuals.goalId, weeklyGoals.id), eq(weeklyGoalActuals.entryDate, today)),
    )
    .where(
      and(
        eq(weeklyGoals.employeeId, employeeId),
        eq(weeklyGoals.weekStart, week),
        eq(weeklyGoals.archived, false),
        sql`${weeklyGoals.pctDone} < 100`,
        sql`${weeklyGoalActuals.id} is null`,
      ),
    );
  return rows.map((r) => r.label);
}

export interface GoalActualToday {
  goalId: string;
  pct: number | null;
  note: string | null;
}

/** Today's logged actuals for an employee's current-week goals, keyed by goalId. */
export async function todaysActuals(employeeId: string, now: Date = new Date()): Promise<Map<string, GoalActualToday>> {
  const today = istYmd(now);
  const rows = await db
    .select({ goalId: weeklyGoalActuals.goalId, pct: weeklyGoalActuals.pct, note: weeklyGoalActuals.note })
    .from(weeklyGoalActuals)
    .where(and(eq(weeklyGoalActuals.employeeId, employeeId), eq(weeklyGoalActuals.entryDate, today)));
  return new Map(rows.map((r) => [r.goalId, { goalId: r.goalId, pct: r.pct, note: r.note }]));
}
