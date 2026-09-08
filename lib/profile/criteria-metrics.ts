import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { tasks, weeklyGoals, attendanceLogs } from "@/db/schema";

/**
 * Live numbers behind a person's performance criteria. Each criterion is matched
 * (by keyword, client-side) to one of these measures so an "achievement" shows a
 * real, auto-computed figure (e.g. "project completion on time → 12 / 15 on
 * time") instead of a static badge.
 */
export interface CriteriaMetrics {
  tasksCompleted: number; // lifetime tasks marked done
  tasksOnTime: number; // of those, finished on/before the due date
  tasksWithDue: number; // of those, how many had a due date (the on-time denominator)
  goalsCompleted: number; // weekly goals at 100%
  goalsTotal: number; // weekly goals logged
  attendanceDays: number; // distinct check-in days this month
}

export async function getCriteriaMetrics(employeeId: string): Promise<CriteriaMetrics> {
  const [taskRow, goalRow, attRow] = await Promise.all([
    db
      .select({
        completed: sql<number>`count(*)::int`,
        onTime: sql<number>`sum(case when ${tasks.completedAt} <= ${tasks.dueAt} then 1 else 0 end)::int`,
        withDue: sql<number>`sum(case when ${tasks.dueAt} is not null then 1 else 0 end)::int`,
      })
      .from(tasks)
      .where(and(eq(tasks.doerId, employeeId), eq(tasks.status, "done"))),
    db
      .select({
        total: sql<number>`count(*)::int`,
        completed: sql<number>`count(*) filter (where ${weeklyGoals.pctDone} >= 100)::int`,
      })
      .from(weeklyGoals)
      .where(eq(weeklyGoals.employeeId, employeeId)),
    db
      .select({ days: sql<number>`count(distinct ${attendanceLogs.logDate})::int` })
      .from(attendanceLogs)
      .where(
        and(
          eq(attendanceLogs.employeeId, employeeId),
          eq(attendanceLogs.kind, "in"),
          sql`${attendanceLogs.logDate} >= date_trunc('month', now())::date`,
        ),
      ),
  ]);

  return {
    tasksCompleted: taskRow[0]?.completed ?? 0,
    tasksOnTime: taskRow[0]?.onTime ?? 0,
    tasksWithDue: taskRow[0]?.withDue ?? 0,
    goalsCompleted: goalRow[0]?.completed ?? 0,
    goalsTotal: goalRow[0]?.total ?? 0,
    attendanceDays: attRow[0]?.days ?? 0,
  };
}
