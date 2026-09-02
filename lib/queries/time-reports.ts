import "server-only";

/**
 * Task Time Intelligence — reporting read-model.
 *
 * Aggregate queries powering the `/tasks/time` reports + dashboard. These read
 * the pre-aggregated per-task projection (`task_time_rollup`) wherever possible
 * — one row per task, recomputed in-transaction by the engine — so the reports
 * stay fast without folding the raw event log. Only the "most productive day"
 * widget touches the session ledger (`task_work_sessions`), because that's the
 * one metric that needs per-day grouping of individual session durations.
 *
 * All durations are stored in SECONDS. Every derived average / rate is computed
 * in JS after the SUM/COUNT are fetched, so there's no SQL divide-by-zero to
 * guard — the JS guards `count > 0` explicitly.
 */
import { and, asc, desc, eq, gte, ilike, isNotNull, lte, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  tasks,
  employees,
  taskTimeRollup,
  taskWorkSessions,
  weeklyGoals,
} from "@/db/schema";
import type { TaskPriority } from "@/db/enums";

/**
 * Coerce a DB timestamp to ISO — the time-intel tables can read back as strings
 * (not Date) depending on column/driver, so never assume `.toISOString()` exists.
 */
function toIsoOrNull(v: Date | string | null | undefined): string | null {
  return v == null ? null : v instanceof Date ? v.toISOString() : String(v);
}

/** Filters shared by every report. All optional — omit for an unfiltered view. */
export interface TimeReportFilters {
  /** tasks.doer_id */
  employeeId?: string;
  /** employees.department (exact, as picked from the roster) */
  department?: string;
  /** tasks.client (exact) */
  client?: string;
  /** tasks.subject (exact) */
  subject?: string;
  /** tasks.priority */
  priority?: TaskPriority;
  /** weekly_goals.id → tasks.origin_goal_id */
  goalId?: string;
  /** tasks.id */
  taskId?: string;
  /** inclusive IST date (YYYY-MM-DD) applied to first_started_at */
  from?: string;
  /** inclusive IST date (YYYY-MM-DD) applied to first_started_at */
  to?: string;
}

/** IST day boundaries so a `?from=&to=` range means whole calendar days here. */
function istStart(d: string): Date {
  return new Date(`${d}T00:00:00+05:30`);
}
function istEnd(d: string): Date {
  return new Date(`${d}T23:59:59.999+05:30`);
}

/**
 * WHERE conditions applied to the common join
 * `tasks ⋈ task_time_rollup ⋈ employees(doer)`. Every report uses this join so
 * the department filter (which lives on the doer's employee row) always works.
 */
function baseConditions(f: TimeReportFilters): SQL[] {
  const c: SQL[] = [];
  if (f.employeeId) c.push(eq(tasks.doerId, f.employeeId));
  if (f.department) c.push(eq(employees.department, f.department));
  if (f.client) c.push(eq(tasks.client, f.client));
  if (f.subject) c.push(eq(tasks.subject, f.subject));
  if (f.priority) c.push(eq(tasks.priority, f.priority));
  if (f.goalId) c.push(eq(tasks.originGoalId, f.goalId));
  if (f.taskId) c.push(eq(tasks.id, f.taskId));
  if (f.from) c.push(gte(taskTimeRollup.firstStartedAt, istStart(f.from)));
  if (f.to) c.push(lte(taskTimeRollup.firstStartedAt, istEnd(f.to)));
  return c;
}

function whereOf(conds: SQL[]): SQL | undefined {
  return conds.length ? and(...conds) : undefined;
}

/** Canonical weekly-goal label — matches lib/goals/actuals.ts. */
const GOAL_TITLE_SQL = sql<string>`coalesce(nullif(trim(${weeklyGoals.targetDone}), ''), nullif(trim(${weeklyGoals.subject}), ''), nullif(trim(${weeklyGoals.client}), ''), 'Weekly goal')`;

// ─────────────────────────────────────────────────────────────────────────────
// Employee report
// ─────────────────────────────────────────────────────────────────────────────

export interface EmployeeTimeRow {
  employeeId: string;
  name: string;
  department: string | null;
  taskCount: number;
  tasksCompleted: number;
  totalActiveSeconds: number;
  avgPerTaskSeconds: number;
  avgPerGoalSeconds: number;
  avgRevisionSeconds: number;
  /** 0..1 — approved tasks / tracked tasks. */
  approvalRate: number;
  /** 0..1 — tasks that ever hit a rejection / tracked tasks. */
  rejectionRate: number;
}

export async function employeeTimeReport(
  f: TimeReportFilters = {},
): Promise<EmployeeTimeRow[]> {
  const where = whereOf(baseConditions(f));
  const rows = await db
    .select({
      employeeId: employees.id,
      name: employees.name,
      department: employees.department,
      taskCount: sql<number>`count(${tasks.id})`.mapWith(Number),
      tasksCompleted: sql<number>`coalesce(sum(case when ${taskTimeRollup.lastDoneAt} is not null then 1 else 0 end), 0)`.mapWith(Number),
      totalActiveSeconds: sql<number>`coalesce(sum(${taskTimeRollup.totalActiveSeconds}), 0)`.mapWith(Number),
      revisionSeconds: sql<number>`coalesce(sum(${taskTimeRollup.revisionSeconds}), 0)`.mapWith(Number),
      revisionTaskCount: sql<number>`coalesce(sum(case when ${taskTimeRollup.rejectionCount} > 0 then 1 else 0 end), 0)`.mapWith(Number),
      approvedCount: sql<number>`coalesce(sum(case when ${taskTimeRollup.approvedAt} is not null then 1 else 0 end), 0)`.mapWith(Number),
      goalSeconds: sql<number>`coalesce(sum(case when ${tasks.originGoalId} is not null then ${taskTimeRollup.totalActiveSeconds} else 0 end), 0)`.mapWith(Number),
      distinctGoals: sql<number>`count(distinct ${tasks.originGoalId})`.mapWith(Number),
    })
    .from(tasks)
    .innerJoin(taskTimeRollup, eq(taskTimeRollup.taskId, tasks.id))
    .innerJoin(employees, eq(employees.id, tasks.doerId))
    .where(where)
    .groupBy(employees.id, employees.name, employees.department)
    .orderBy(desc(sql`coalesce(sum(${taskTimeRollup.totalActiveSeconds}), 0)`));

  return rows.map((r) => ({
    employeeId: r.employeeId,
    name: r.name,
    department: r.department,
    taskCount: r.taskCount,
    tasksCompleted: r.tasksCompleted,
    totalActiveSeconds: r.totalActiveSeconds,
    avgPerTaskSeconds: r.taskCount > 0 ? Math.round(r.totalActiveSeconds / r.taskCount) : 0,
    avgPerGoalSeconds: r.distinctGoals > 0 ? Math.round(r.goalSeconds / r.distinctGoals) : 0,
    avgRevisionSeconds: r.revisionTaskCount > 0 ? Math.round(r.revisionSeconds / r.revisionTaskCount) : 0,
    approvalRate: r.taskCount > 0 ? r.approvedCount / r.taskCount : 0,
    rejectionRate: r.taskCount > 0 ? r.revisionTaskCount / r.taskCount : 0,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Task report
// ─────────────────────────────────────────────────────────────────────────────

export interface TaskTimeRow {
  taskId: string;
  taskNo: number | null;
  title: string;
  doerName: string;
  client: string | null;
  subject: string | null;
  priority: TaskPriority;
  createdAt: string;
  firstStartedAt: string | null;
  lastDoneAt: string | null;
  approvedAt: string | null;
  sessionCount: number;
  /** Number of rejection→revision cycles this task went through. */
  rejectionCount: number;
  totalActiveSeconds: number;
}

export async function taskTimeReport(
  search: string | undefined,
  f: TimeReportFilters = {},
  limit = 200,
): Promise<TaskTimeRow[]> {
  const conds = baseConditions(f);
  const q = (search ?? "").trim();
  if (q) {
    const pat = `%${q}%`;
    const match = or(
      ilike(tasks.title, pat),
      ilike(tasks.client, pat),
      ilike(tasks.subject, pat),
      sql`cast(${tasks.taskNo} as text) ilike ${pat}`,
    );
    if (match) conds.push(match);
  }

  const rows = await db
    .select({
      taskId: tasks.id,
      taskNo: tasks.taskNo,
      title: tasks.title,
      doerName: employees.name,
      client: tasks.client,
      subject: tasks.subject,
      priority: tasks.priority,
      createdAt: tasks.createdAt,
      firstStartedAt: taskTimeRollup.firstStartedAt,
      lastDoneAt: taskTimeRollup.lastDoneAt,
      approvedAt: taskTimeRollup.approvedAt,
      sessionCount: taskTimeRollup.sessionCount,
      rejectionCount: taskTimeRollup.rejectionCount,
      totalActiveSeconds: taskTimeRollup.totalActiveSeconds,
    })
    .from(tasks)
    .innerJoin(taskTimeRollup, eq(taskTimeRollup.taskId, tasks.id))
    .innerJoin(employees, eq(employees.id, tasks.doerId))
    .where(whereOf(conds))
    .orderBy(desc(taskTimeRollup.totalActiveSeconds))
    .limit(limit);

  return rows.map((r) => ({
    taskId: r.taskId,
    taskNo: r.taskNo,
    title: r.title,
    doerName: r.doerName,
    client: r.client,
    subject: r.subject,
    priority: r.priority,
    createdAt: toIsoOrNull(r.createdAt) ?? "",
    firstStartedAt: toIsoOrNull(r.firstStartedAt),
    lastDoneAt: toIsoOrNull(r.lastDoneAt),
    approvedAt: toIsoOrNull(r.approvedAt),
    sessionCount: r.sessionCount,
    rejectionCount: r.rejectionCount,
    totalActiveSeconds: r.totalActiveSeconds,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Goal report
// ─────────────────────────────────────────────────────────────────────────────

export interface GoalTimeRow {
  goalId: string;
  goalTitle: string;
  taskCount: number;
  totalActiveSeconds: number;
  avgPerTaskSeconds: number;
}

export async function goalTimeReport(
  f: TimeReportFilters = {},
): Promise<GoalTimeRow[]> {
  const conds = baseConditions(f);
  conds.push(isNotNull(tasks.originGoalId));

  const rows = await db
    .select({
      goalId: tasks.originGoalId,
      goalTitle: GOAL_TITLE_SQL,
      taskCount: sql<number>`count(${tasks.id})`.mapWith(Number),
      totalActiveSeconds: sql<number>`coalesce(sum(${taskTimeRollup.totalActiveSeconds}), 0)`.mapWith(Number),
    })
    .from(tasks)
    .innerJoin(taskTimeRollup, eq(taskTimeRollup.taskId, tasks.id))
    .innerJoin(employees, eq(employees.id, tasks.doerId))
    .leftJoin(weeklyGoals, eq(weeklyGoals.id, tasks.originGoalId))
    .where(whereOf(conds))
    .groupBy(tasks.originGoalId, weeklyGoals.targetDone, weeklyGoals.subject, weeklyGoals.client)
    .orderBy(desc(sql`coalesce(sum(${taskTimeRollup.totalActiveSeconds}), 0)`));

  return rows.map((r) => ({
    goalId: r.goalId as string,
    goalTitle: r.goalTitle,
    taskCount: r.taskCount,
    totalActiveSeconds: r.totalActiveSeconds,
    avgPerTaskSeconds: r.taskCount > 0 ? Math.round(r.totalActiveSeconds / r.taskCount) : 0,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Manager report
// ─────────────────────────────────────────────────────────────────────────────

export interface ManagerTimeReport {
  totalActiveSeconds: number;
  taskCount: number;
  avgSeconds: number;
  approvedCount: number;
  rejectedCount: number;
  revisionSeconds: number;
  topTasks: TaskTimeRow[];
}

export async function managerTimeReport(
  f: TimeReportFilters = {},
): Promise<ManagerTimeReport> {
  const where = whereOf(baseConditions(f));

  const [aggP, topTasks] = await Promise.all([
    db
      .select({
        totalActiveSeconds: sql<number>`coalesce(sum(${taskTimeRollup.totalActiveSeconds}), 0)`.mapWith(Number),
        taskCount: sql<number>`count(${tasks.id})`.mapWith(Number),
        approvedCount: sql<number>`coalesce(sum(case when ${taskTimeRollup.approvedAt} is not null then 1 else 0 end), 0)`.mapWith(Number),
        rejectedCount: sql<number>`coalesce(sum(case when ${taskTimeRollup.rejectionCount} > 0 then 1 else 0 end), 0)`.mapWith(Number),
        revisionSeconds: sql<number>`coalesce(sum(${taskTimeRollup.revisionSeconds}), 0)`.mapWith(Number),
      })
      .from(tasks)
      .innerJoin(taskTimeRollup, eq(taskTimeRollup.taskId, tasks.id))
      .innerJoin(employees, eq(employees.id, tasks.doerId))
      .where(where),
    taskTimeReport(undefined, f, 10),
  ]);

  const agg = aggP[0];
  const taskCount = agg?.taskCount ?? 0;
  const totalActiveSeconds = agg?.totalActiveSeconds ?? 0;

  return {
    totalActiveSeconds,
    taskCount,
    avgSeconds: taskCount > 0 ? Math.round(totalActiveSeconds / taskCount) : 0,
    approvedCount: agg?.approvedCount ?? 0,
    rejectedCount: agg?.rejectedCount ?? 0,
    revisionSeconds: agg?.revisionSeconds ?? 0,
    topTasks,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard widgets (global — no filters)
// ─────────────────────────────────────────────────────────────────────────────

export interface TimeDashboardWidgets {
  totalActiveSeconds: number;
  taskCount: number;
  avgPerTaskSeconds: number;
  revisionSeconds: number;
  approvedCount: number;
  avgApprovalCycleSeconds: number;
  highestEffortTasks: TaskTimeRow[];
  mostTimeConsumingGoal: GoalTimeRow | null;
  mostProductiveDay: { date: string; totalActiveSeconds: number } | null;
}

export async function timeDashboardWidgets(): Promise<TimeDashboardWidgets> {
  const [aggP, highestEffortTasks, goals, dayP] = await Promise.all([
    db
      .select({
        totalActiveSeconds: sql<number>`coalesce(sum(${taskTimeRollup.totalActiveSeconds}), 0)`.mapWith(Number),
        taskCount: sql<number>`count(${taskTimeRollup.taskId})`.mapWith(Number),
        revisionSeconds: sql<number>`coalesce(sum(${taskTimeRollup.revisionSeconds}), 0)`.mapWith(Number),
        approvedCount: sql<number>`coalesce(sum(case when ${taskTimeRollup.approvedAt} is not null then 1 else 0 end), 0)`.mapWith(Number),
        avgApprovalCycleSeconds: sql<number>`coalesce(avg(extract(epoch from (${taskTimeRollup.approvedAt} - ${taskTimeRollup.firstStartedAt}))) filter (where ${taskTimeRollup.approvedAt} is not null and ${taskTimeRollup.firstStartedAt} is not null and ${taskTimeRollup.approvedAt} > ${taskTimeRollup.firstStartedAt}), 0)`.mapWith(Number),
      })
      .from(taskTimeRollup),
    // HIGHEST-EFFORT means what it says: only tasks with tracked effort belong
    // here. The list used to be padded to 6 rows with 0m tasks (Sir: "balance is
    // empty"), which also dragged in throwaway rows like "Raj - Test". Ask for
    // more than we show, then keep only the ones with real time on them.
    taskTimeReport(undefined, {}, 24).then((rows) =>
      rows.filter((r) => (r.totalActiveSeconds ?? 0) > 0).slice(0, 6),
    ),
    goalTimeReport({}),
    db
      .select({
        date: sql<string>`to_char(${taskWorkSessions.startedAt} at time zone 'Asia/Kolkata', 'YYYY-MM-DD')`,
        totalActiveSeconds: sql<number>`coalesce(sum(${taskWorkSessions.durationSeconds}), 0)`.mapWith(Number),
      })
      .from(taskWorkSessions)
      .where(isNotNull(taskWorkSessions.durationSeconds))
      .groupBy(sql`to_char(${taskWorkSessions.startedAt} at time zone 'Asia/Kolkata', 'YYYY-MM-DD')`)
      .orderBy(desc(sql`coalesce(sum(${taskWorkSessions.durationSeconds}), 0)`))
      .limit(1),
  ]);

  const agg = aggP[0];
  const taskCount = agg?.taskCount ?? 0;
  const totalActiveSeconds = agg?.totalActiveSeconds ?? 0;
  const day = dayP[0];

  return {
    totalActiveSeconds,
    taskCount,
    avgPerTaskSeconds: taskCount > 0 ? Math.round(totalActiveSeconds / taskCount) : 0,
    revisionSeconds: agg?.revisionSeconds ?? 0,
    approvedCount: agg?.approvedCount ?? 0,
    avgApprovalCycleSeconds: Math.round(agg?.avgApprovalCycleSeconds ?? 0),
    highestEffortTasks,
    mostTimeConsumingGoal: goals[0] ?? null,
    mostProductiveDay: day ? { date: day.date, totalActiveSeconds: day.totalActiveSeconds } : null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Filter option rosters (for the report filter bars)
// ─────────────────────────────────────────────────────────────────────────────

export interface TimeReportFilterOptions {
  employees: { id: string; name: string }[];
  departments: string[];
  clients: string[];
  subjects: string[];
  goals: { id: string; name: string }[];
}

/** Distinct filter values — but only over tasks that actually have tracked time,
 *  so the pickers never offer a value that yields an empty report. */
export async function timeReportFilterOptions(): Promise<TimeReportFilterOptions> {
  const [emps, depts, clients, subjects, goals] = await Promise.all([
    db
      .selectDistinct({ id: employees.id, name: employees.name })
      .from(tasks)
      .innerJoin(taskTimeRollup, eq(taskTimeRollup.taskId, tasks.id))
      .innerJoin(employees, eq(employees.id, tasks.doerId))
      .orderBy(asc(employees.name)),
    db
      .selectDistinct({ department: employees.department })
      .from(tasks)
      .innerJoin(taskTimeRollup, eq(taskTimeRollup.taskId, tasks.id))
      .innerJoin(employees, eq(employees.id, tasks.doerId))
      .where(isNotNull(employees.department)),
    db
      .selectDistinct({ client: tasks.client })
      .from(tasks)
      .innerJoin(taskTimeRollup, eq(taskTimeRollup.taskId, tasks.id))
      .where(isNotNull(tasks.client)),
    db
      .selectDistinct({ subject: tasks.subject })
      .from(tasks)
      .innerJoin(taskTimeRollup, eq(taskTimeRollup.taskId, tasks.id))
      .where(isNotNull(tasks.subject)),
    db
      .selectDistinct({ id: tasks.originGoalId, name: GOAL_TITLE_SQL })
      .from(tasks)
      .innerJoin(taskTimeRollup, eq(taskTimeRollup.taskId, tasks.id))
      .leftJoin(weeklyGoals, eq(weeklyGoals.id, tasks.originGoalId))
      .where(isNotNull(tasks.originGoalId)),
  ]);

  return {
    employees: emps,
    departments: depts
      .map((d) => d.department)
      .filter((d): d is string => !!d && d.trim().length > 0)
      .sort((a, b) => a.localeCompare(b)),
    clients: clients
      .map((c) => c.client)
      .filter((c): c is string => !!c && c.trim().length > 0)
      .sort((a, b) => a.localeCompare(b)),
    subjects: subjects
      .map((s) => s.subject)
      .filter((s): s is string => !!s && s.trim().length > 0)
      .sort((a, b) => a.localeCompare(b)),
    goals: goals
      .filter((g): g is { id: string; name: string } => !!g.id)
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}
