import "server-only";
import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, weeklyGoals, tasks, attendanceLogs, incentiveRequests } from "@/db/schema";
import type { TaskPriority } from "@/db/enums";
import {
  periodStart,
  recentWeekStarts,
  type PerformerPeriod,
} from "@/lib/weekly-goals/week";

export interface WeeklyGoalRow {
  id: string;
  employeeId: string;
  employeeName: string;
  weekStart: string;
  position: number;
  client: string | null;
  subject: string | null;
  priority: TaskPriority;
  incentive: boolean;
  incentiveAmount: number;
  kpi: boolean;
  targetDone: string | null;
  pctDone: number;
  pctUpdatedAt: Date | null;
  explanation: string | null;
  linkUrl: string | null;
  carriedFromId: string | null;
  updatedAt: Date;
}

const ROW_SELECT = {
  id: weeklyGoals.id,
  employeeId: weeklyGoals.employeeId,
  employeeName: employees.name,
  weekStart: weeklyGoals.weekStart,
  position: weeklyGoals.position,
  client: weeklyGoals.client,
  subject: weeklyGoals.subject,
  priority: weeklyGoals.priority,
  incentive: weeklyGoals.incentive,
  incentiveAmount: weeklyGoals.incentiveAmount,
  kpi: weeklyGoals.kpi,
  targetDone: weeklyGoals.targetDone,
  pctDone: weeklyGoals.pctDone,
  pctUpdatedAt: weeklyGoals.pctUpdatedAt,
  explanation: weeklyGoals.explanation,
  linkUrl: weeklyGoals.linkUrl,
  carriedFromId: weeklyGoals.carriedFromId,
  updatedAt: weeklyGoals.updatedAt,
} as const;

/**
 * Goals for one employee in one week, in Sr.-No. order. This is the per-person
 * planner view (a doer editing their own week, or an admin scoped to one).
 */
export async function listWeeklyGoals(opts: {
  employeeId: string;
  weekStart: string;
}): Promise<WeeklyGoalRow[]> {
  return db
    .select(ROW_SELECT)
    .from(weeklyGoals)
    .innerJoin(employees, eq(weeklyGoals.employeeId, employees.id))
    .where(
      and(
        eq(weeklyGoals.employeeId, opts.employeeId),
        eq(weeklyGoals.weekStart, opts.weekStart),
      ),
    )
    .orderBy(asc(weeklyGoals.position), asc(weeklyGoals.createdAt));
}

/**
 * Every goal across all employees for one week — the admin's bird's-eye view.
 * Sorted by employee then Sr. No.
 */
export async function listGoalsForWeek(weekStart: string): Promise<WeeklyGoalRow[]> {
  return db
    .select(ROW_SELECT)
    .from(weeklyGoals)
    .innerJoin(employees, eq(weeklyGoals.employeeId, employees.id))
    .where(eq(weeklyGoals.weekStart, weekStart))
    .orderBy(asc(employees.name), asc(weeklyGoals.position));
}

export interface EmployeeRanking {
  employeeId: string;
  employeeName: string;
  goals: number;
  completed: number;
  avgPct: number;
}

/**
 * Leaderboard for a period (this week / this month / YTD). Averages % done over
 * every goal whose week falls in the window, ranked best-first. Only employees
 * with ≥1 goal in the window appear.
 */
export async function employeeRankings(
  period: PerformerPeriod,
  now: Date = new Date(),
): Promise<EmployeeRanking[]> {
  const start = periodStart(period, now);
  const rows = await db
    .select({
      employeeId: weeklyGoals.employeeId,
      employeeName: employees.name,
      goals: sql<number>`count(*)::int`,
      completed: sql<number>`count(*) filter (where ${weeklyGoals.pctDone} >= 100)::int`,
      avgPct: sql<number>`coalesce(round(avg(${weeklyGoals.pctDone}))::int, 0)`,
    })
    .from(weeklyGoals)
    .innerJoin(employees, eq(weeklyGoals.employeeId, employees.id))
    .where(gte(weeklyGoals.weekStart, start))
    .groupBy(weeklyGoals.employeeId, employees.name)
    .orderBy(
      desc(sql`avg(${weeklyGoals.pctDone})`),
      desc(sql`count(*) filter (where ${weeklyGoals.pctDone} >= 100)`),
    );
  return rows;
}

/** Single top performer for a period, or null if nobody set a goal. */
export async function performerOf(
  period: PerformerPeriod,
  now: Date = new Date(),
): Promise<EmployeeRanking | null> {
  const ranked = await employeeRankings(period, now);
  return ranked[0] ?? null;
}

/* ------------------------------------------------------------------ */
/* Star of the Month — GLOBAL (tasks + goals, whole org)               */
/* ------------------------------------------------------------------ */

export interface GlobalRanking {
  employeeId: string;
  employeeName: string;
  tasksDone: number;
  goalsDone: number;
  onTimePct: number; // 0..100, share of dated tasks finished on/before due
  goalsAvgPct: number; // 0..100, avg % done across the period's goals
  presentDays: number; // distinct days checked in during the period
  incentivesWon: number; // approved incentives in the period
  score: number; // composite, higher is better
}

/**
 * Org-wide "Star" ranking for a period — the whole-app version, mapped to the
 * Star of the Month KRAs (not just weekly goals). Blends, per person:
 *   • Tasks      → productivity, timeliness & quality (on-time weighted)
 *   • Weekly goals → achievement of individual targets/goals
 *   • Attendance → attendance & punctuality (days present)
 *   • Incentives → revenue / target wins (approved incentives)
 * Tasks and goals dominate; attendance and incentives are modest boosts. Anyone
 * who did nothing in the window is dropped. Best-first.
 */
export async function globalRankings(
  period: PerformerPeriod,
  now: Date = new Date(),
): Promise<GlobalRanking[]> {
  const tsStart =
    period === "year"
      ? sql`date_trunc('year', now())`
      : period === "month"
        ? sql`date_trunc('month', now())`
        : sql`date_trunc('week', now())`;
  const dateStart =
    period === "year"
      ? sql`date_trunc('year', now())::date`
      : period === "month"
        ? sql`date_trunc('month', now())::date`
        : sql`date_trunc('week', now())::date`;
  const goalStart = periodStart(period, now);

  const [taskRows, goalRows, attRows, incRows, emps] = await Promise.all([
    db
      .select({
        employeeId: tasks.doerId,
        done: sql<number>`count(*)::int`,
        onTime: sql<number>`sum(case when ${tasks.completedAt} <= ${tasks.dueAt} then 1 else 0 end)::int`,
        withDue: sql<number>`sum(case when ${tasks.dueAt} is not null then 1 else 0 end)::int`,
      })
      .from(tasks)
      .where(and(eq(tasks.status, "done"), sql`${tasks.completedAt} >= ${tsStart}`))
      .groupBy(tasks.doerId),
    db
      .select({
        employeeId: weeklyGoals.employeeId,
        completed: sql<number>`count(*) filter (where ${weeklyGoals.pctDone} >= 100)::int`,
        avgPct: sql<number>`coalesce(round(avg(${weeklyGoals.pctDone}))::int, 0)`,
      })
      .from(weeklyGoals)
      .where(gte(weeklyGoals.weekStart, goalStart))
      .groupBy(weeklyGoals.employeeId),
    db
      .select({
        employeeId: attendanceLogs.employeeId,
        days: sql<number>`count(distinct ${attendanceLogs.logDate})::int`,
      })
      .from(attendanceLogs)
      .where(and(eq(attendanceLogs.kind, "in"), sql`${attendanceLogs.logDate} >= ${dateStart}`))
      .groupBy(attendanceLogs.employeeId),
    db
      .select({
        employeeId: incentiveRequests.employeeId,
        won: sql<number>`count(*)::int`,
      })
      .from(incentiveRequests)
      .where(
        and(
          eq(incentiveRequests.status, "approved"),
          eq(incentiveRequests.archived, false),
          sql`${incentiveRequests.createdAt} >= ${tsStart}`,
        ),
      )
      .groupBy(incentiveRequests.employeeId),
    db
      .select({ id: employees.id, name: employees.name })
      .from(employees)
      .where(eq(employees.isActive, true)),
  ]);

  const taskBy = new Map(taskRows.map((r) => [r.employeeId, r]));
  const goalBy = new Map(goalRows.map((r) => [r.employeeId, r]));
  const attBy = new Map(attRows.map((r) => [r.employeeId, r]));
  const incBy = new Map(incRows.map((r) => [r.employeeId, r]));

  const ranked: GlobalRanking[] = emps.map((e) => {
    const t = taskBy.get(e.id);
    const g = goalBy.get(e.id);
    const tasksDone = t?.done ?? 0;
    const withDue = t?.withDue ?? 0;
    const onTime = t?.onTime ?? 0;
    const onTimeRate = withDue > 0 ? onTime / withDue : 1; // no deadline ⇒ not penalised
    const goalsDone = g?.completed ?? 0;
    const goalsAvgPct = g?.avgPct ?? 0;
    const presentDays = attBy.get(e.id)?.days ?? 0;
    const incentivesWon = incBy.get(e.id)?.won ?? 0;

    // KRA-weighted composite. Tasks (productivity + on-time quality) and goals
    // (target achievement) dominate; attendance/punctuality and incentive wins
    // add a modest boost so they can't outweigh actual delivery.
    const score =
      tasksDone * (0.6 + 0.4 * onTimeRate) +
      goalsDone * 3 +
      goalsAvgPct / 20 +
      presentDays * 0.3 +
      incentivesWon * 2;

    return {
      employeeId: e.id,
      employeeName: e.name,
      tasksDone,
      goalsDone,
      onTimePct: withDue > 0 ? Math.round(onTimeRate * 100) : 100,
      goalsAvgPct,
      presentDays,
      incentivesWon,
      score: Math.round(score * 10) / 10,
    };
  });

  return ranked
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || b.tasksDone - a.tasksDone);
}

/** Single global Star for a period (tasks + goals), or null if nobody acted. */
export async function globalStarOf(
  period: PerformerPeriod,
  now: Date = new Date(),
): Promise<GlobalRanking | null> {
  const ranked = await globalRankings(period, now);
  return ranked[0] ?? null;
}

export interface WeekTrendPoint {
  weekStart: string;
  avgPct: number;
  goals: number;
}

/**
 * Per-week average % done over the last `weeks` weeks. When `employeeId` is
 * given, scoped to that person; otherwise org-wide. Weeks with no goals are
 * emitted as 0 so the chart shows a continuous timeline.
 */
export async function weekWiseTrend(opts: {
  weeks: number;
  employeeId?: string;
  now?: Date;
}): Promise<WeekTrendPoint[]> {
  const now = opts.now ?? new Date();
  const span = recentWeekStarts(Math.max(1, opts.weeks), now);
  const earliest = span[0]!;

  const where = opts.employeeId
    ? and(gte(weeklyGoals.weekStart, earliest), eq(weeklyGoals.employeeId, opts.employeeId))
    : gte(weeklyGoals.weekStart, earliest);

  const rows = await db
    .select({
      weekStart: weeklyGoals.weekStart,
      avgPct: sql<number>`coalesce(round(avg(${weeklyGoals.pctDone}))::int, 0)`,
      goals: sql<number>`count(*)::int`,
    })
    .from(weeklyGoals)
    .where(where)
    .groupBy(weeklyGoals.weekStart);

  const byWeek = new Map(rows.map((r) => [r.weekStart, r]));
  return span.map((weekStart) => {
    const hit = byWeek.get(weekStart);
    return {
      weekStart,
      avgPct: hit?.avgPct ?? 0,
      goals: hit?.goals ?? 0,
    };
  });
}

/** Active employees (incl. interns) for the person selector. */
export async function listGoalEmployees(): Promise<{ id: string; name: string }[]> {
  return db
    .select({ id: employees.id, name: employees.name })
    .from(employees)
    .where(eq(employees.isActive, true))
    .orderBy(asc(employees.name));
}

/** An employee's name + KRA + criteria (for the Weekly Goals header). */
export async function getEmployeeCriteria(
  employeeId: string,
): Promise<{ name: string; criteria: string | null; kra: string | null } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(employeeId)) return null;
  const [row] = await db
    .select({ name: employees.name, criteria: employees.performanceCriteria, kra: employees.kra })
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);
  return row ?? null;
}
