import "server-only";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, weeklyGoals } from "@/db/schema";
import type { TaskPriority, TaskStatus } from "@/db/enums";
import { currentWeekStart, weekEnd } from "@/lib/weekly-goals/week";
import { effectivePct } from "@/lib/weekly-goals/effective";
import type { WeeklyGoal } from "@/db/schema";

/**
 * Surface weekly goals INSIDE the Tasks views (design §10) without duplicating
 * data: goals stay in `weekly_goals`; this maps a `WeeklyGoal` into a
 * read-only "virtual" task row the Tasks list / kanban / My Day can render
 * with a "Weekly Goal" badge. Clicking one links back to the Weekly Goals
 * workspace — the single edit/review surface (no in-Tasks editing).
 */

/** Stable virtual-id prefix so callers can detect + route weekly-goal rows. */
export const WEEKLY_GOAL_ROW_PREFIX = "wg:";

/** Build the virtual row id (`wg:<uuid>`) from a goal id. */
export function weeklyGoalRowId(goalId: string): string {
  return `${WEEKLY_GOAL_ROW_PREFIX}${goalId}`;
}

/** True for a virtual-task id produced by this module. */
export function isWeeklyGoalRowId(id: string): boolean {
  return id.startsWith(WEEKLY_GOAL_ROW_PREFIX);
}

/** Strip the prefix back to the underlying weekly-goal uuid. */
export function weeklyGoalIdFromRowId(rowId: string): string {
  return rowId.slice(WEEKLY_GOAL_ROW_PREFIX.length);
}

/**
 * A weekly goal projected onto the shape the Tasks surfaces consume. It is
 * deliberately a SUPERSET-tagged value (`kind: "weekly_goal"`) and is never
 * mixed into task stat-card / dashboard counts.
 */
export interface VirtualTaskRow {
  kind: "weekly_goal";
  /** `wg:<goal-uuid>` — globally distinct from numeric task ids. */
  id: string;
  /** Underlying weekly-goal uuid (for the deep link / focus param). */
  goalId: string;
  title: string;
  client: string | null;
  subject: string | null;
  priority: TaskPriority;
  /** Already a task_status — maps straight into the kanban columns. */
  status: TaskStatus;
  /** target_date ?? week end (Sunday) as yyyy-mm-dd. */
  dueAt: string;
  doerId: string;
  doerName: string | null;
  /** Effective % (accept_pct ?? pct_done), 0..100. */
  pct: number;
  weekStart: string;
  /** Deep link into the Weekly Goals workspace, focused on this goal. */
  href: string;
}

/** Goal title for the Tasks surfaces: Goal text, else "Client · Subject". */
export function weeklyGoalTitle(goal: {
  targetDone: string | null;
  client: string | null;
  subject: string | null;
}): string {
  const target = goal.targetDone?.trim();
  if (target) return target;
  const parts = [goal.client?.trim(), goal.subject?.trim()].filter(
    (p): p is string => !!p,
  );
  if (parts.length > 0) return parts.join(" · ");
  return "Weekly goal";
}

/** Deep link to the Weekly Goals workspace, focused on a goal in its week. */
export function weeklyGoalHref(weekStart: string, goalId: string): string {
  return `/weekly-goals?week=${weekStart}&focus=${goalId}`;
}

/** Map a full `WeeklyGoal` (+ doer name) to a `VirtualTaskRow`. Pure. */
export function weeklyGoalToTaskRow(
  goal: WeeklyGoal,
  doerName: string | null,
): VirtualTaskRow {
  return {
    kind: "weekly_goal",
    id: weeklyGoalRowId(goal.id),
    goalId: goal.id,
    title: weeklyGoalTitle(goal),
    client: goal.client,
    subject: goal.subject,
    priority: goal.priority,
    status: goal.status,
    dueAt: goal.targetDate ?? weekEnd(goal.weekStart),
    doerId: goal.employeeId,
    doerName,
    pct: effectivePct(goal),
    weekStart: goal.weekStart,
    href: weeklyGoalHref(goal.weekStart, goal.id),
  };
}

/** Shared subset of the Tasks list filters that weekly goals honour. */
export interface WeekGoalTaskFilters {
  priorities?: TaskPriority[];
  subjects?: string[];
  clients?: string[];
}

/**
 * Current-week, non-archived goals for the view's employee scope, projected to
 * virtual task rows. `scope.employeeIds` empty/undefined = all employees (admin
 * "all" view); otherwise restricted to those ids (default-to-me / specific).
 * Honours the shared client/subject/priority filters. Sorted doer-then-Sr.No.
 */
export async function listWeekGoalsAsTasks(opts: {
  scope?: { employeeIds?: string[] };
  weekStart?: string;
  filters?: WeekGoalTaskFilters;
  now?: Date;
}): Promise<VirtualTaskRow[]> {
  const weekStart = opts.weekStart ?? currentWeekStart(opts.now ?? new Date());
  const employeeIds = opts.scope?.employeeIds;
  const f = opts.filters ?? {};

  const conditions = [
    eq(weeklyGoals.weekStart, weekStart),
    eq(weeklyGoals.archived, false),
    // Phase 2 — a goal with a real linked task is already in the Tasks list as
    // that task; don't also surface its read-only virtual row (no duplicates).
    isNull(weeklyGoals.taskId),
  ];
  if (employeeIds && employeeIds.length > 0) {
    conditions.push(inArray(weeklyGoals.employeeId, employeeIds));
  } else if (employeeIds && employeeIds.length === 0) {
    // An explicit empty scope means "nobody" only when the caller passes a
    // non-undefined empty array AND intends specific scoping; we treat
    // undefined/[] as "all" per the doc, so do nothing here.
  }
  if (f.priorities && f.priorities.length > 0) {
    conditions.push(inArray(weeklyGoals.priority, f.priorities));
  }
  if (f.subjects && f.subjects.length > 0) {
    conditions.push(inArray(weeklyGoals.subject, f.subjects));
  }
  if (f.clients && f.clients.length > 0) {
    conditions.push(inArray(weeklyGoals.client, f.clients));
  }

  const rows = await db
    .select({
      goal: weeklyGoals,
      doerName: employees.name,
    })
    .from(weeklyGoals)
    .innerJoin(employees, eq(weeklyGoals.employeeId, employees.id))
    .where(and(...conditions))
    .orderBy(
      asc(employees.name),
      asc(weeklyGoals.position),
      asc(weeklyGoals.createdAt),
    );

  return rows.map((r) => weeklyGoalToTaskRow(r.goal, r.doerName));
}

/** Count of current-week non-archived goals in scope (for group headers). */
export async function countWeekGoalsInScope(opts: {
  scope?: { employeeIds?: string[] };
  weekStart?: string;
  now?: Date;
}): Promise<number> {
  const weekStart = opts.weekStart ?? currentWeekStart(opts.now ?? new Date());
  const employeeIds = opts.scope?.employeeIds;
  const conditions = [
    eq(weeklyGoals.weekStart, weekStart),
    eq(weeklyGoals.archived, false),
    isNull(weeklyGoals.taskId),
  ];
  if (employeeIds && employeeIds.length > 0) {
    conditions.push(inArray(weeklyGoals.employeeId, employeeIds));
  }
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(weeklyGoals)
    .where(and(...conditions));
  return row?.n ?? 0;
}
