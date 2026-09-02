import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { tasks } from "@/db/schema";

export interface PerfStats {
  thisWeek: { completed: number; onTimeRate: number; avgResponseMinutes: number };
  thisMonth: { completed: number; onTimeRate: number; avgResponseMinutes: number };
  lifetime: { completed: number; avgCycleHours: number; overdueRate: number };
  weeklyTrend: Array<{ weekStart: string; me: number; teamAvg: number }>;
}

/**
 * Build the perf-card payload for one user. Six rolled-up windows +
 * a 12-week weekly trend for "tasks completed" (mine vs team average).
 */
export async function getPerfStats(employeeId: string): Promise<PerfStats> {
  const meCompleted = eq(tasks.status, "done");

  // Helpers — predicates compose cleanly without a CTE.
  const inLastWeek = sql`${tasks.completedAt} >= date_trunc('week', now())`;
  const inLastMonth = sql`${tasks.completedAt} >= date_trunc('month', now())`;
  const completedNotNull = sql`${tasks.completedAt} is not null and ${tasks.dueAt} is not null`;

  const [thisWeekRows, thisMonthRows, lifetimeRows, trendRows] =
    await Promise.all([
      db
        .select({
          c: sql<number>`count(*)::int`,
          onTime: sql<number>`sum(case when ${tasks.completedAt} <= ${tasks.dueAt} then 1 else 0 end)::int`,
        })
        .from(tasks)
        .where(and(eq(tasks.doerId, employeeId), meCompleted, inLastWeek, completedNotNull)),
      db
        .select({
          c: sql<number>`count(*)::int`,
          onTime: sql<number>`sum(case when ${tasks.completedAt} <= ${tasks.dueAt} then 1 else 0 end)::int`,
        })
        .from(tasks)
        .where(and(eq(tasks.doerId, employeeId), meCompleted, inLastMonth, completedNotNull)),
      db
        .select({
          c: sql<number>`count(*)::int`,
          avgCycleHours: sql<number | null>`avg(extract(epoch from (${tasks.completedAt} - ${tasks.createdAt})) / 3600)::float`,
          overdue: sql<number>`sum(case when ${tasks.completedAt} > ${tasks.dueAt} then 1 else 0 end)::int`,
        })
        .from(tasks)
        .where(and(eq(tasks.doerId, employeeId), meCompleted, completedNotNull)),
      db
        .select({
          weekStart: sql<string>`(date_trunc('week', ${tasks.completedAt}))::date::text`,
          me: sql<number>`sum(case when ${tasks.doerId} = ${employeeId} then 1 else 0 end)::int`,
          totalAll: sql<number>`count(*)::int`,
          distinctDoers: sql<number>`count(distinct ${tasks.doerId})::int`,
        })
        .from(tasks)
        .where(
          and(
            meCompleted,
            sql`${tasks.completedAt} >= now() - interval '12 weeks'`,
          ),
        )
        .groupBy(sql`date_trunc('week', ${tasks.completedAt})`)
        .orderBy(sql`date_trunc('week', ${tasks.completedAt}) asc`),
    ]);

  const week = thisWeekRows[0] ?? { c: 0, onTime: 0 };
  const month = thisMonthRows[0] ?? { c: 0, onTime: 0 };
  const lt = lifetimeRows[0] ?? { c: 0, avgCycleHours: 0, overdue: 0 };

  const weeklyTrend = trendRows.map((r) => ({
    weekStart: r.weekStart,
    me: r.me,
    teamAvg: r.distinctDoers > 0 ? Math.round(r.totalAll / r.distinctDoers) : 0,
  }));

  return {
    thisWeek: {
      completed: week.c,
      onTimeRate: week.c > 0 ? week.onTime / week.c : 0,
      avgResponseMinutes: 0, // TODO: derive from comments
    },
    thisMonth: {
      completed: month.c,
      onTimeRate: month.c > 0 ? month.onTime / month.c : 0,
      avgResponseMinutes: 0,
    },
    lifetime: {
      completed: lt.c,
      avgCycleHours: lt.avgCycleHours ?? 0,
      overdueRate: lt.c > 0 ? lt.overdue / lt.c : 0,
    },
    weeklyTrend,
  };
}
