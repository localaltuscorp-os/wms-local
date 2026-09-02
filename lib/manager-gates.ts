/**
 * #11 — Compulsory MANAGER gates.
 *
 * DAILY: every manager (someone is their direct report) must CREATE at least
 * `daily_task_quota` (default 3) tasks for EACH direct report each working day,
 * before they can enter any workspace.
 *
 * WEEKLY (Wed & Sat, IST): each direct report must currently have ≥5 OPEN weekly
 * goals (pct_done < 100) for the current week — satisfied no matter who created
 * them (Manan's count too). The manager is blocked only when a report is short.
 *
 * Every query here is read-only; the layout calls them with `.catch()` so a DB
 * hiccup NEVER locks anyone out (fail-open).
 */
import { db } from "@/lib/db";
import { employees, tasks, weeklyGoals } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { currentWeekStart, TZ } from "@/lib/weekly-goals/week";

export const WEEKLY_MIN_OPEN_GOALS = 5;

export interface ReportDaily {
  id: string;
  name: string;
  given: number;
  quota: number;
}
export interface DailyGateState {
  satisfied: boolean;
  reports: ReportDaily[];
}

async function activeDirectReports(managerId: string) {
  return db
    .select({ id: employees.id, name: employees.name, quota: employees.dailyTaskQuota })
    .from(employees)
    .where(and(eq(employees.managerId, managerId), eq(employees.isActive, true)));
}

/** Does this person have any active direct reports (i.e. are they a manager)? */
export async function isManagerWithReports(managerId: string): Promise<boolean> {
  const reports = await activeDirectReports(managerId);
  return reports.length > 0;
}

/** Daily task gate: has the manager created today's quota of tasks for each report? */
export async function managerDailyTaskGate(managerId: string): Promise<DailyGateState> {
  const reports = await activeDirectReports(managerId);
  if (reports.length === 0) return { satisfied: true, reports: [] };

  // Tasks the manager CREATED today (IST), grouped by the doer they gave it to.
  const rows = await db
    .select({ doerId: tasks.doerId, n: sql<number>`count(*)::int` })
    .from(tasks)
    .where(
      and(
        eq(tasks.createdById, managerId),
        sql`(${tasks.createdAt} AT TIME ZONE ${TZ})::date = (now() AT TIME ZONE ${TZ})::date`,
      ),
    )
    .groupBy(tasks.doerId);
  const givenByDoer = new Map(rows.map((r) => [r.doerId, r.n]));

  const out: ReportDaily[] = reports.map((r) => ({
    id: r.id,
    name: r.name,
    given: givenByDoer.get(r.id) ?? 0,
    quota: r.quota ?? 3,
  }));
  return { satisfied: out.every((r) => r.given >= r.quota), reports: out };
}

export interface ReportWeekly {
  id: string;
  name: string;
  open: number;
  need: number;
}
export interface WeeklyGateState {
  satisfied: boolean;
  reports: ReportWeekly[];
}

/** Weekly goal gate: does each report have ≥5 OPEN (<100%) goals this week? */
export async function managerWeeklyGoalGate(managerId: string): Promise<WeeklyGateState> {
  const reports = await activeDirectReports(managerId);
  if (reports.length === 0) return { satisfied: true, reports: [] };

  const week = currentWeekStart();
  const rows = await db
    .select({ employeeId: weeklyGoals.employeeId, n: sql<number>`count(*)::int` })
    .from(weeklyGoals)
    .where(
      and(
        eq(weeklyGoals.weekStart, week),
        eq(weeklyGoals.archived, false),
        sql`${weeklyGoals.pctDone} < 100`,
      ),
    )
    .groupBy(weeklyGoals.employeeId);
  const openByEmp = new Map(rows.map((r) => [r.employeeId, r.n]));

  const out: ReportWeekly[] = reports.map((r) => ({
    id: r.id,
    name: r.name,
    open: openByEmp.get(r.id) ?? 0,
    need: WEEKLY_MIN_OPEN_GOALS,
  }));
  return { satisfied: out.every((r) => r.open >= WEEKLY_MIN_OPEN_GOALS), reports: out };
}

/** True on Wednesday or Saturday in IST — the days the weekly-goal gate is active. */
export function isWeeklyGoalGateDay(now: Date = new Date()): boolean {
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(now);
  return wd === "Wed" || wd === "Sat";
}

/** True on Monday in IST — the day the manager weekly-goal attendance gate fires. */
export function isMondayIST(now: Date = new Date()): boolean {
  return new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(now) === "Mon";
}

export interface ReportGoalSet {
  id: string;
  name: string;
  goals: number;
  weightSum: number;
  ok: boolean;
}
export interface MondayGoalState {
  satisfied: boolean;
  reports: ReportGoalSet[];
}

/**
 * Monday attendance gate: has the manager set THIS week's goals for every active
 * report, with each report's weights summing to exactly 100? On Monday,
 * `currentWeekStart` is today's Monday — the week being planned — so goals the
 * manager set over the prior weekend (week_start = this Monday) already count.
 * A report with 0 goals (weightSum 0) or weights ≠ 100 fails. Read-only;
 * callers fail-open.
 */
export async function managerMondayGoalState(managerId: string, now: Date = new Date()): Promise<MondayGoalState> {
  const reports = await activeDirectReports(managerId);
  if (reports.length === 0) return { satisfied: true, reports: [] };

  const week = currentWeekStart(now);
  const rows = await db
    .select({
      employeeId: weeklyGoals.employeeId,
      n: sql<number>`count(*)::int`,
      wsum: sql<number>`coalesce(sum(${weeklyGoals.weight}), 0)::int`,
    })
    .from(weeklyGoals)
    .where(and(eq(weeklyGoals.weekStart, week), eq(weeklyGoals.archived, false)))
    .groupBy(weeklyGoals.employeeId);
  const byEmp = new Map(rows.map((r) => [r.employeeId, r]));

  const out: ReportGoalSet[] = reports.map((r) => {
    const x = byEmp.get(r.id);
    const goals = x?.n ?? 0;
    const weightSum = x?.wsum ?? 0;
    return { id: r.id, name: r.name, goals, weightSum, ok: goals > 0 && weightSum === 100 };
  });
  return { satisfied: out.every((r) => r.ok), reports: out };
}
