import "server-only";
import { and, asc, desc, eq, inArray, notInArray, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { dailyChecklist, dailyPlanDay, goals, weeklyGoals, weeklyGoalActuals, tasks, employees } from "@/db/schema";
import type { TaskStatus, TaskPriority } from "@/db/enums";
import { istYmd } from "@/lib/weekly-goals/week";
import { currentWeekStart } from "@/lib/weekly-goals/week";
import { effectiveDueAtSql, pickEffectiveDue } from "@/lib/tasks/effective-due";

/**
 * Has the employee clicked "Start My Day" for `ymd`? True once
 * `daily_plan_day.started_at` is stamped (via startMyDay).
 *
 * This is the clock-IN half of the daily loop: attendance is not a surface that
 * runs beside the plan, it opens only after the day is started. Read-only over a
 * column that already exists (migration 0134) and is already written on every
 * Start My Day click — nothing here needs a schema change.
 *
 * NOTE the asymmetry with `reopenPlan`, which sets started_at back to NULL. That
 * is deliberate per Sir: re-opening the plan re-locks attendance until the day
 * is started again.
 */
export async function hasStartedDay(employeeId: string, ymd: string = todayYmd()): Promise<boolean> {
  const [day] = await db
    .select({ startedAt: dailyPlanDay.startedAt })
    .from(dailyPlanDay)
    .where(and(eq(dailyPlanDay.employeeId, employeeId), eq(dailyPlanDay.planDate, ymd)))
    .limit(1);
  return !!day?.startedAt;
}

/**
 * Has the employee CLOSED OUT today's commitments (Sir's checkout order)? True
 * once `daily_plan_day.closed_at` is stamped (via closeMyDay). Powers the punch-
 * out close-out gate.
 *
 * NO "nothing planned" ESCAPE. This used to return true when the employee had no
 * checklist rows for the day, so as not to trap clock-out. Under the current rule
 * that is a bypass, not a kindness: clock-IN already requires
 * MIN_ATTENDANCE_ITEMS committed items, so anyone who is clocked in HAS a plan,
 * and an empty plan at clock-out time means it was emptied after the fact —
 * which is exactly the case the gate exists to catch.
 */
export async function isDayClosedOut(employeeId: string, ymd: string = todayYmd()): Promise<boolean> {
  const [day] = await db
    .select({ closedAt: dailyPlanDay.closedAt })
    .from(dailyPlanDay)
    .where(and(eq(dailyPlanDay.employeeId, employeeId), eq(dailyPlanDay.planDate, ymd)))
    .limit(1);
  return !!day?.closedAt;
}

/** Today's plan_date in IST (the team's clock). */
export function todayYmd(now: Date = new Date()): string {
  return istYmd(now);
}

/**
 * The plan_date `offset` IST-days from today (0 = today, 1 = tomorrow, 2 = day
 * after). Powers the 3-day planner. Day math is done on the parsed IST calendar
 * date via UTC so it never shifts across a timezone boundary.
 */
export function ymdForOffset(offset: number, now: Date = new Date()): string {
  const base = todayYmd(now);
  const n = clampDayOffset(offset);
  if (n === 0) return base;
  // UTC day arithmetic handles negatives as cleanly as positives.
  const [y, m, d] = base.split("-").map(Number);
  const dt = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + n));
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${mm}-${dd}`;
}

/** One WEEK of planner days — the width of the day strip, and the length of
 *  the My Day week board. Unchanged: other surfaces count on it being 7. */
export const PLAN_HORIZON_DAYS = 7;

/**
 * How far ahead Plan My Day can actually FILE work: today + four weeks.
 *
 * The strip pages a week at a time (‹ / ›), so "next week" is only useful if a
 * card can be dropped there — the offset cap and the strip have to agree. My Day
 * still asks for PLAN_HORIZON_DAYS and is untouched by this.
 */
export const PLAN_MAX_DAY_OFFSET = 27;

/**
 * How far BACK the planner can look: four weeks (Sir — "allow me to see
 * previous week too"). Negative offsets are real days, so yesterday's column
 * reads its actual plan rather than being clamped silently to today.
 *
 * Moving work onto a past day is allowed too: "I actually did this yesterday"
 * is a legitimate correction, and an unfinished past row is exactly what the
 * Unfinished box already surfaces.
 */
export const PLAN_MIN_DAY_OFFSET = -27;

/**
 * The planner window runs from {@link PLAN_MIN_DAY_OFFSET} to
 * {@link PLAN_MAX_DAY_OFFSET}. Junk clamps to today; an offset past either end
 * clamps to that end rather than snapping home — "push this to tomorrow" from
 * the final day must never silently mean "pull it back to today".
 */
export function clampDayOffset(raw: unknown): number {
  const n = Math.trunc(Number(raw));
  if (!Number.isFinite(n)) return 0;
  return Math.max(PLAN_MIN_DAY_OFFSET, Math.min(n, PLAN_MAX_DAY_OFFSET));
}

/**
 * The UTC instant of IST-tomorrow-midnight for a given `YYYY-MM-DD` (IST) day.
 * A task is "for today" when its effective due date is strictly BEFORE this
 * instant — i.e. due today or overdue. (IST 00:00 = 18:30 UTC the day before.)
 */
function startOfTomorrowIstInstant(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + 1) - 5.5 * 3_600_000);
}

/**
 * A single line in the Daily Checklist. `source` is the ONE source of truth:
 *  - "assigned"  — a manager-assigned Task (live from the `tasks` table, NEVER
 *                  copied). id === the task id; completion writes back to the task.
 *  - "personal"  — the employee's own row in `daily_checklist` (ad-hoc item or a
 *                  pulled Weekly Goal). id === the daily_checklist row id.
 */
export interface DailyItem {
  id: string;
  source: "assigned" | "personal";
  title: string;
  client: string | null;
  subject: string | null;
  origin: "goal_related" | "standalone";
  goalId: string | null;
  taskId: string | null;
  taskNo: number | null;
  dueAt: Date | null;
  status: TaskStatus;
  done: boolean;
  doneNote: string | null;
  movedFromDate: string | null;
  position: number;
}

export interface PullableGoal {
  id: string;
  client: string | null;
  subject: string | null;
  targetDone: string | null;
  weight: number;
}

export interface OverdueItem {
  id: string;
  title: string;
  description: string | null;
  client: string | null;
  subject: string | null;
  origin: "goal_related" | "standalone";
  goalId: string | null;
  taskId: string | null;
  taskNo: number | null;
  planDate: string;
}

/**
 * The manager-ASSIGNED tasks that make up an employee's day — read LIVE from the
 * `tasks` table (one record, one owner; never copied into the checklist). These
 * are the doer's open tasks whose effective due date is today or overdue. When a
 * manager assigns nothing, this is empty (the assigned section simply hides).
 */
export async function assignedTasksForToday(
  employeeId: string,
  ymd: string = todayYmd(),
): Promise<DailyItem[]> {
  const cutoff = startOfTomorrowIstInstant(ymd);
  const rows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      client: tasks.client,
      subject: tasks.subject,
      taskNo: tasks.taskNo,
      status: tasks.status,
      dueAt: effectiveDueAtSql(),
    })
    .from(tasks)
    .where(
      and(
        eq(tasks.doerId, employeeId),
        eq(tasks.archived, false),
        sql`${tasks.status} not in ('done','approved','cancelled')`,
        sql`${effectiveDueAtSql()} < ${cutoff.toISOString()}::timestamptz`,
      ),
    )
    .orderBy(asc(effectiveDueAtSql()), asc(tasks.createdAt));
  return rows.map((r, i) => ({
    id: r.id,
    source: "assigned" as const,
    title: r.title,
    client: r.client,
    subject: r.subject,
    origin: "standalone" as const,
    goalId: null,
    taskId: r.id,
    taskNo: r.taskNo,
    dueAt: r.dueAt,
    status: r.status,
    done: r.status === "done" || r.status === "approved",
    doneNote: null,
    movedFromDate: null,
    position: i,
  }));
}

/** The employee's OWN checklist rows (ad-hoc items + pulled goals). Legacy rows
 *  that merely copied a task (task_id set) are excluded — the live assigned view
 *  is now the single source of truth for task work, so copies never double up. */
async function personalItems(employeeId: string, ymd: string): Promise<DailyItem[]> {
  const rows = await db
    .select({
      id: dailyChecklist.id,
      title: dailyChecklist.title,
      client: dailyChecklist.client,
      subject: dailyChecklist.subject,
      origin: dailyChecklist.origin,
      goalId: dailyChecklist.goalId,
      taskId: dailyChecklist.taskId,
      status: dailyChecklist.status,
      done: dailyChecklist.done,
      doneNote: dailyChecklist.doneNote,
      movedFromDate: dailyChecklist.movedFromDate,
      position: dailyChecklist.position,
    })
    .from(dailyChecklist)
    .where(
      and(
        eq(dailyChecklist.employeeId, employeeId),
        eq(dailyChecklist.planDate, ymd),
        isNull(dailyChecklist.taskId),
      ),
    )
    .orderBy(asc(dailyChecklist.position), asc(dailyChecklist.committedAt));
  return rows.map((r) => ({
    ...r,
    origin: r.origin as "goal_related" | "standalone",
    source: "personal" as const,
    taskNo: null,
    dueAt: null,
  }));
}

/**
 * Today's full checklist for an employee = manager-assigned tasks (live) FOLLOWED
 * BY the employee's personal items. The single merged surface the day view reads.
 */
export async function getTodayItems(
  employeeId: string,
  ymd: string = todayYmd(),
): Promise<DailyItem[]> {
  const [assigned, personal] = await Promise.all([
    assignedTasksForToday(employeeId, ymd),
    personalItems(employeeId, ymd),
  ]);
  return [...assigned, ...personal];
}

/** True when the employee has ANY planned work today — an assigned task OR a
 *  personal item. This is what the attendance gate now checks (plan EXISTS). */
/**
 * How many items the employee has COMMITTED to today's checklist (personal
 * `daily_checklist` rows for `ymd`). This is the strict planning signal — it does
 * NOT count merely-assigned tasks. Drives the compulsory login checklist gate,
 * which requires ≥ MIN_DAILY_ITEMS before the app opens.
 */
export async function countPlannedItems(
  employeeId: string,
  ymd: string = todayYmd(),
): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(dailyChecklist)
    .where(and(eq(dailyChecklist.employeeId, employeeId), eq(dailyChecklist.planDate, ymd)));
  return row?.n ?? 0;
}

/**
 * HOW MANY things the employee has lined up for `ymd` — the number the
 * clock-in gate measures against.
 *
 * Same two sources as `hasPlannedWork` below, summed rather than short-circuited
 * at the first hit:
 *
 *  1. `daily_checklist` rows for the day. One row covers every flavour of
 *     planned item — a pulled weekly goal (`goal_id`), a pulled Y/Q/M goal
 *     (`cascade_goal_id`), a pulled WMS task (`task_id`), or a typed daily
 *     commitment (none of them set). Yesterday's unfinished work arrives here
 *     too, by having its `plan_date` moved onto today.
 *  2. Open ASSIGNED tasks due by end of day IST. `<` start-of-tomorrow also
 *     sweeps in anything overdue, which is the WMS half of "unfinished from
 *     yesterday".
 *
 * DEDUPLICATED, and that is the whole subtlety. A task the employee pulled onto
 * the plan exists in BOTH sets — as a `tasks` row and as a `daily_checklist`
 * row carrying its `task_id`. Adding the two counts blind would let three
 * pulled tasks read as six and open the gate on half a plan, so assigned tasks
 * already represented on the checklist are excluded.
 */
export async function countPlannedWork(
  employeeId: string,
  ymd: string = todayYmd(),
): Promise<number> {
  const cutoff = startOfTomorrowIstInstant(ymd);

  // Everything on the plan, plus the task ids among them, in one read.
  const planned = await db
    .select({ taskId: dailyChecklist.taskId })
    .from(dailyChecklist)
    .where(and(eq(dailyChecklist.employeeId, employeeId), eq(dailyChecklist.planDate, ymd)));

  const pulledTaskIds = planned
    .map((r) => r.taskId)
    .filter((id): id is string => Boolean(id));

  const [assigned] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(tasks)
    .where(
      and(
        eq(tasks.doerId, employeeId),
        eq(tasks.archived, false),
        sql`${tasks.status} not in ('done','approved','cancelled')`,
        sql`${effectiveDueAtSql()} < ${cutoff.toISOString()}::timestamptz`,
        // The dedupe. `notInArray` on an EMPTY list generates invalid SQL,
        // so the clause is added only when something was actually pulled.
        ...(pulledTaskIds.length > 0 ? [notInArray(tasks.id, pulledTaskIds)] : []),
      ),
    );

  return planned.length + (assigned?.n ?? 0);
}

export async function hasPlannedWork(
  employeeId: string,
  ymd: string = todayYmd(),
): Promise<boolean> {
  const cutoff = startOfTomorrowIstInstant(ymd);
  const [assigned] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(tasks)
    .where(
      and(
        eq(tasks.doerId, employeeId),
        eq(tasks.archived, false),
        sql`${tasks.status} not in ('done','approved','cancelled')`,
        sql`${effectiveDueAtSql()} < ${cutoff.toISOString()}::timestamptz`,
      ),
    );
  if ((assigned?.n ?? 0) > 0) return true;
  const [personal] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(dailyChecklist)
    .where(and(eq(dailyChecklist.employeeId, employeeId), eq(dailyChecklist.planDate, ymd)));
  return (personal?.n ?? 0) > 0;
}

/**
 * Active goals the employee has NOT yet pulled into today — the "Pull from your
 * Weekly Goals" list. Prefers THIS week's goals; if the employee hasn't set any
 * for the current week yet, it FALLS BACK to their most recent week with active
 * goals so unfinished goals carry forward into today's plan (otherwise someone
 * who set goals last week but not this week sees an empty pull list).
 */
async function pullableForWeek(
  employeeId: string,
  weekStart: string,
  ymd: string,
): Promise<PullableGoal[]> {
  return db
    .select({
      id: weeklyGoals.id,
      client: weeklyGoals.client,
      subject: weeklyGoals.subject,
      targetDone: weeklyGoals.targetDone,
      weight: weeklyGoals.weight,
    })
    .from(weeklyGoals)
    .where(
      and(
        eq(weeklyGoals.employeeId, employeeId),
        eq(weeklyGoals.weekStart, weekStart),
        eq(weeklyGoals.archived, false),
        sql`not exists (
          select 1 from ${dailyChecklist} dc
          where dc.goal_id = ${weeklyGoals.id}
            and dc.employee_id = ${employeeId}
            and dc.plan_date = ${ymd}
        )`,
      ),
    )
    .orderBy(asc(weeklyGoals.position), asc(weeklyGoals.createdAt));
}

export async function listPullableGoals(
  employeeId: string,
  now: Date = new Date(),
): Promise<PullableGoal[]> {
  const ymd = todayYmd(now);
  const thisWeek = currentWeekStart(now);
  const current = await pullableForWeek(employeeId, thisWeek, ymd);
  if (current.length > 0) return current;

  // No current-week goals → fall back to the most recent week the employee has
  // active goals in (carry forward last week's unfinished goals).
  const [recent] = await db
    .select({ ws: weeklyGoals.weekStart })
    .from(weeklyGoals)
    .where(and(eq(weeklyGoals.employeeId, employeeId), eq(weeklyGoals.archived, false)))
    .orderBy(desc(weeklyGoals.weekStart))
    .limit(1);
  if (recent && recent.ws !== thisWeek) {
    return pullableForWeek(employeeId, recent.ws, ymd);
  }
  return current;
}

/**
 * The employee's OPEN (not done/approved, not archived) tasks — the right-hand
 * "Tasks" drag source on the Plan-Your-Day page. Excludes tasks already pulled
 * into today's checklist. Newest first, capped.
 */
export interface OpenTaskOption {
  id: string;
  taskNo: number | null;
  title: string;
  description: string | null;
  client: string | null;
  subject: string | null;
  status: TaskStatus;
  /** Priority quadrant — powers the "important" badge + sort tiebreaker. */
  priority: TaskPriority;
  /** EFFECTIVE due date (revised ?? due_at) as an IST ymd, or null if unset. */
  dueAt: string | null;
  /** Effective due is strictly before today. */
  overdue: boolean;
  /** Effective due is today. */
  dueToday: boolean;
  /** Who assigned/created the task (name) — shown in the hover + detail pop-out. */
  assigner: string | null;
  /** Scheduled block on the task (tasks.starts_at / ends_at), when one exists. */
  startsAt: Date | null;
  endsAt: Date | null;
  allDay: boolean;
  /** Planned effort in minutes (tasks.estimated_minutes), when recorded. */
  estimatedMinutes: number | null;
}

/** Eisenhower rank: important-first, then urgent (0 = most important). */
function importanceRank(p: TaskPriority): number {
  switch (p) {
    case "imp_urgent":
      return 0;
    case "imp_not_urgent":
      return 1;
    case "not_imp_urgent":
      return 2;
    default:
      return 3;
  }
}

export async function listOpenTasksForChecklist(
  employeeId: string,
  now: Date = new Date(),
  opts: { horizonDays?: number; limit?: number; excludePlannedAnyDay?: boolean } = {},
): Promise<OpenTaskOption[]> {
  const ymd = todayYmd(now);
  // Sir's To-Do rule: on the planner, only surface OVERDUE + due-within-N-days
  // tasks (hide far-future "kachra"). `horizonDays` unset ⇒ no horizon (the login
  // gate + mobile keep every open task).
  const horizonCutoff =
    opts.horizonDays == null
      ? null
      : new Date(new Date(`${ymd}T00:00:00+05:30`).getTime() + (opts.horizonDays + 1) * 86_400_000);
  const rows = await db
    .select({
      id: tasks.id,
      taskNo: tasks.taskNo,
      title: tasks.title,
      description: tasks.description,
      client: tasks.client,
      subject: tasks.subject,
      status: tasks.status,
      priority: tasks.priority,
      dueAt: tasks.dueAt,
      revisedTargetDate: tasks.revisedTargetDate,
      assigner: employees.name,
      // Real scheduling metadata (tier-4 `starts_at`/`ends_at` + mig 0176
      // `estimated_minutes`) — the planner SHOWS these when set and shows
      // nothing when they aren't. No time is ever invented.
      startsAt: tasks.startsAt,
      endsAt: tasks.endsAt,
      allDay: tasks.allDay,
      estimatedMinutes: tasks.estimatedMinutes,
    })
    .from(tasks)
    .leftJoin(employees, eq(tasks.createdById, employees.id))
    .where(
      and(
        eq(tasks.doerId, employeeId),
        eq(tasks.archived, false),
        isNull(tasks.abandonedAt),
        sql`${tasks.status} not in ('done','approved','cancelled')`,
        horizonCutoff
          ? sql`${effectiveDueAtSql()} < ${horizonCutoff.toISOString()}::timestamptz`
          : sql`true`,
        // A task already filed on a planner day is OFF the pull list. With
        // `excludePlannedAnyDay` (the Plan My Day board) that means ANY day, not
        // just today: one item lives on exactly one day, so a task you filed on
        // Thursday must not still look pullable on the Tomorrow column.
        opts.excludePlannedAnyDay
          ? sql`not exists (
              select 1 from ${dailyChecklist} dc
              where dc.task_id = ${tasks.id}
                and dc.employee_id = ${employeeId}
            )`
          : sql`not exists (
              select 1 from ${dailyChecklist} dc
              where dc.task_id = ${tasks.id}
                and dc.employee_id = ${employeeId}
                and dc.plan_date = ${ymd}
            )`,
      ),
    )
    // Order BEFORE the cap so the rows kept are the most urgent — an unordered
    // LIMIT hands back an arbitrary slice, and the attention-first sort below
    // could then only re-order whatever it happened to get. Postgres sorts
    // NULLs last on ASC, so undated tasks land at the end where they belong.
    .orderBy(asc(effectiveDueAtSql()), asc(tasks.createdAt))
    .limit(opts.limit ?? 50);

  // Enrich each open task with its EFFECTIVE due (revised ?? due_at, per the
  // app-wide overdue rule) as an IST ymd + overdue/dueToday flags, so the
  // planner can surface unfinished work and pull-by-due-date/importance.
  const enriched: OpenTaskOption[] = rows.map((r) => {
    const eff = pickEffectiveDue(r);
    const dueYmd = eff ? istYmd(eff) : null;
    return {
      id: r.id,
      taskNo: r.taskNo,
      title: r.title,
      description: r.description,
      client: r.client,
      subject: r.subject,
      status: r.status,
      priority: r.priority,
      dueAt: dueYmd,
      overdue: dueYmd != null && dueYmd < ymd,
      dueToday: dueYmd === ymd,
      assigner: r.assigner ?? null,
      startsAt: r.startsAt,
      endsAt: r.endsAt,
      allDay: r.allDay,
      estimatedMinutes: r.estimatedMinutes,
    };
  });

  // Smart default sort: overdue → due-today → due-soon → no-date, with
  // importance as the tiebreaker inside each bucket, and earlier due first.
  const bucket = (t: OpenTaskOption) => (t.overdue ? 0 : t.dueToday ? 1 : t.dueAt ? 2 : 3);
  enriched.sort(
    (a, b) =>
      bucket(a) - bucket(b) ||
      (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999") ||
      importanceRank(a.priority) - importanceRank(b.priority),
  );
  return enriched;
}

/**
 * All active current-week weekly goals with their target, cumulative %, today's
 * logged actual, and whether they've been pulled into today's plan. Powers the
 * right-hand "Weekly Goals" panel — which is BOTH a drag source AND where the
 * employee logs today's progress (the daily actuals). Falls back to the most
 * recent week with goals (same carry-forward rule as listPullableGoals).
 */
export interface PlannerGoal {
  id: string;
  client: string | null;
  subject: string | null;
  targetDone: string | null;
  weight: number;
  pctDone: number;
  todayPct: number | null;
  todayNote: string | null;
  pulledToday: boolean;
}

async function plannerGoalsForWeek(employeeId: string, weekStart: string, ymd: string): Promise<PlannerGoal[]> {
  const rows = await db
    .select({
      id: weeklyGoals.id,
      client: weeklyGoals.client,
      subject: weeklyGoals.subject,
      targetDone: weeklyGoals.targetDone,
      weight: weeklyGoals.weight,
      pctDone: weeklyGoals.pctDone,
      todayPct: weeklyGoalActuals.pct,
      todayNote: weeklyGoalActuals.note,
      pulled: sql<boolean>`exists (
        select 1 from ${dailyChecklist} dc
        where dc.goal_id = ${weeklyGoals.id} and dc.employee_id = ${employeeId} and dc.plan_date = ${ymd}
      )`,
    })
    .from(weeklyGoals)
    .leftJoin(
      weeklyGoalActuals,
      and(eq(weeklyGoalActuals.goalId, weeklyGoals.id), eq(weeklyGoalActuals.entryDate, ymd)),
    )
    .where(
      and(
        eq(weeklyGoals.employeeId, employeeId),
        eq(weeklyGoals.weekStart, weekStart),
        eq(weeklyGoals.archived, false),
      ),
    )
    .orderBy(asc(weeklyGoals.position), asc(weeklyGoals.createdAt));
  return rows.map((r) => ({
    id: r.id,
    client: r.client,
    subject: r.subject,
    targetDone: r.targetDone,
    weight: r.weight,
    pctDone: r.pctDone,
    todayPct: r.todayPct,
    todayNote: r.todayNote,
    pulledToday: r.pulled,
  }));
}

export async function listGoalsForPlanner(employeeId: string, now: Date = new Date()): Promise<PlannerGoal[]> {
  const ymd = todayYmd(now);
  const thisWeek = currentWeekStart(now);
  const current = await plannerGoalsForWeek(employeeId, thisWeek, ymd);
  if (current.length > 0) return current;
  const [recent] = await db
    .select({ ws: weeklyGoals.weekStart })
    .from(weeklyGoals)
    .where(and(eq(weeklyGoals.employeeId, employeeId), eq(weeklyGoals.archived, false)))
    .orderBy(desc(weeklyGoals.weekStart))
    .limit(1);
  if (recent && recent.ws !== thisWeek) return plannerGoalsForWeek(employeeId, recent.ws, ymd);
  return current;
}

/**
 * Best-effort map of `daily_checklist.id` → the cascade level of the GOAL it
 * was pulled from ("yearly" | "quarterly" | "monthly").
 *
 * WHY: a plan row only stores `goal_id` (weekly goals) and `task_id`, so a
 * cascade goal pulled onto today is otherwise indistinguishable from a typed
 * ad-hoc commitment — it would carry a COMMITMENT tag instead of GOAL, which
 * is exactly the "where did this come from?" confusion the tags exist to kill.
 * Migration 0141 added `cascade_goal_id` to carry that provenance.
 *
 * GUARDED, deliberately: 0141 may be UNAPPLIED in prod (see db/schema.ts and
 * the plan actions' identical guard). Reading the column then throws, we
 * swallow it and return an empty map, and every caller falls back to the legacy
 * derivation. Provenance degrades to the old behaviour; nothing breaks.
 */
export async function cascadeGoalLevels(
  rowIds: string[],
): Promise<Map<string, "yearly" | "quarterly" | "monthly">> {
  const out = new Map<string, "yearly" | "quarterly" | "monthly">();
  if (rowIds.length === 0) return out;
  try {
    const rows = await db
      .select({ id: dailyChecklist.id, period: goals.period })
      .from(dailyChecklist)
      .innerJoin(goals, eq(goals.id, dailyChecklist.cascadeGoalId))
      .where(inArray(dailyChecklist.id, rowIds));
    for (const r of rows) {
      if (r.period === "year") out.set(r.id, "yearly");
      else if (r.period === "quarter") out.set(r.id, "quarterly");
      else if (r.period === "month") out.set(r.id, "monthly");
    }
  } catch {
    // 0141 unapplied — provenance unavailable, never fatal.
  }
  return out;
}

/**
 * Unfinished items from earlier days (plan_date < today, done = false) — the
 * "rolled over from yesterday" strip. Most recent first.
 */
export async function getOverdueItems(
  employeeId: string,
  ymd: string = todayYmd(),
): Promise<OverdueItem[]> {
  const rows = await db
    .select({
      id: dailyChecklist.id,
      title: dailyChecklist.title,
      description: tasks.description,
      client: dailyChecklist.client,
      subject: dailyChecklist.subject,
      origin: dailyChecklist.origin,
      goalId: dailyChecklist.goalId,
      taskId: dailyChecklist.taskId,
      taskNo: tasks.taskNo,
      planDate: dailyChecklist.planDate,
    })
    .from(dailyChecklist)
    // Carry the source task's number for display + drop rows whose task was
    // abandoned into the Recycle Bin (they shouldn't resurface as "unfinished").
    .leftJoin(tasks, eq(tasks.id, dailyChecklist.taskId))
    .where(
      and(
        eq(dailyChecklist.employeeId, employeeId),
        lt(dailyChecklist.planDate, ymd),
        eq(dailyChecklist.done, false),
        // Cancelled into the Recycle Bin (0186) — not "unfinished", gone.
        isNull(dailyChecklist.abandonedAt),
        sql`(${dailyChecklist.taskId} is null or ${tasks.abandonedAt} is null)`,
      ),
    )
    .orderBy(desc(dailyChecklist.planDate));
  return rows as OverdueItem[];
}
