import "server-only";

import { and, asc, eq, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { dailyChecklist, dailyPlanDay, employees, tasks, weeklyGoals } from "@/db/schema";
import { getPeriodGoals } from "@/lib/goals/queries";
import { MIN_ATTENDANCE_ITEMS } from "@/lib/daily-checklist/constants";
import {
  ymdForOffset,
  clampDayOffset,
  todayYmd,
  cascadeGoalLevels,
  listGoalsForPlanner,
  listOpenTasksForChecklist,
  getOverdueItems,
  PLAN_HORIZON_DAYS,
  PLAN_MAX_DAY_OFFSET,
  PLAN_MIN_DAY_OFFSET,
  type OverdueItem,
} from "@/lib/queries/daily-checklist";
import { effectiveDueAtSql, pickEffectiveDue } from "@/lib/tasks/effective-due";
import { istYmd } from "@/lib/weekly-goals/week";
import { blockLabel, effectiveTime, timeColumnToMin } from "@/lib/goals/plan-time";
import { carryForwardUnreviewed } from "@/lib/goals/carry-forward";
import { yearKey, quarterKey, monthKey } from "@/lib/goals/types";
import { isManagerWithReports } from "@/lib/manager-gates";
import { PLAN_DEFAULT_SPAN } from "@/components/goals/plan/types";
import type {
  PlanDayColumn,
  PlanDayPayload,
  PlanDayTab,
  PlanHierarchy,
  PlanItem,
  PlanKind,
  PlanPhase,
  SourceItem,
} from "@/components/goals/plan/types";
import type { Goal } from "@/lib/goals/types";

/**
 * Plan-Your-Day payload assembler — the ONE place the person-window data set is
 * built. Consumed by BOTH surfaces so they can never drift:
 *   · app/(app)/goals/plan/page.tsx        — the full-page route (production)
 *   · loadPlanDay (plan/actions.ts)        — the canvas Day zoom stage.
 *
 * It now assembles a WINDOW of days (the 3-column daily kanban), not a single
 * day, so "Today | Tomorrow | Day After" is one server read and the Next /
 * Previous controls just slide the window.
 *
 * ⚠ Runs on the PRODUCTION path regardless of the canvas flag — it must never
 * reference `daily_checklist.cascade_goal_id` (migration 0141 may be
 * unapplied). Every select below uses an explicit column list.
 */

/** How many day columns the kanban shows by default. Re-exported from the
 *  shared types so the server and the board read the SAME number. */
export const PLAN_WINDOW_DAYS = PLAN_DEFAULT_SPAN;

/** The spans the view dropdown offers: 1, 2, 3, 4 days or a week (Sir).
 *
 *  There is deliberately NO zero-column span. "—" in the dropdown is a RESET —
 *  it puts the board back to the default view — because a board with no columns
 *  is just an empty screen, which is what it gave (Sir). Anything unrecognised,
 *  including 0, falls back to the 3-day default here. */
export const PLAN_WINDOW_CHOICES = [1, 2, 3, 4, 7] as const;

/** Only the offered spans are honoured — a hand-crafted ?v= can't ask for 40
 *  columns. Anything else falls back to the familiar 3-day board. */
export function clampWindowDays(raw: unknown): number {
  const n = Math.trunc(Number(raw));
  return (PLAN_WINDOW_CHOICES as readonly number[]).includes(n) ? n : PLAN_WINDOW_DAYS;
}

/** Every day the planner can file work on — today through +27. */
export const PLAN_PLANNING_DAYS = PLAN_MAX_DAY_OFFSET + 1;

/** How many day tabs the strip shows at once — one week, paged by ‹ / ›. */
export const PLAN_STRIP_DAYS = PLAN_HORIZON_DAYS;

/** The furthest-left offset a window of `days` columns may start at, so its
 *  last column still fits inside the planning horizon. */
export function maxWindowStartFor(days: number): number {
  return Math.max(0, PLAN_MAX_DAY_OFFSET + 1 - days);
}

/** The furthest BACK the window may start — four weeks of history. */
export const MIN_WINDOW_START = PLAN_MIN_DAY_OFFSET;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Window start is clamped to [0, maxWindowStartFor(days)] — Previous stops at
 *  today (you plan forward, you don't re-plan the past) and Next stops at the
 *  horizon, whichever span is on screen. */
export function clampWindowStart(raw: unknown, days: number = PLAN_WINDOW_DAYS): number {
  const n = Math.trunc(Number(raw));
  if (!Number.isFinite(n)) return 0;
  return Math.max(MIN_WINDOW_START, Math.min(n, maxWindowStartFor(days)));
}

/** Whole calendar-days from `from` to `to` (both IST ymd); +ve when to > from. */
function ymdDiffDays(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const a = Date.UTC(fy ?? 1970, (fm ?? 1) - 1, fd ?? 1);
  const b = Date.UTC(ty ?? 1970, (tm ?? 1) - 1, td ?? 1);
  return Math.round((b - a) / 86_400_000);
}

/**
 * The labels for one planner day.
 *
 * "Today" / "Tomorrow" / "Day After" read well but don't say WHICH day they are,
 * while every later tab is named by its weekday already. So the first three
 * carry the weekday on their DATE line (Sir) — "Today / Mon 18 Aug" — and the
 * rest stay "Fri / 21 Aug" rather than repeating themselves as "Fri / Fri 21".
 */
function dayLabels(ymd: string, offset: number): { word: string; date: string; weekday: string } {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  const weekday = WEEKDAYS[dt.getUTCDay()] ?? "";
  const named =
    offset === 0
      ? "Today"
      : offset === 1
        ? "Tomorrow"
        : offset === 2
          ? "Day After"
          : offset === -1
            ? "Yesterday"
            : null;
  const dayMonth = `${Number(d)} ${MONTH_ABBR[(m ?? 1) - 1]}`;
  return {
    word: named ?? weekday,
    date: named ? `${weekday} ${dayMonth}` : dayMonth,
    weekday,
  };
}

/**
 * The day-tab strip: ONE WEEK of planner days starting at `from`, so ‹ / › can
 * page it forward and back across the four-week planning range (Sir).
 *
 * Built here rather than in the browser on purpose — the tabs both name a day
 * and are drop targets that file work onto it, so their label and their effect
 * must come from the same IST calendar the server plans against. Deriving them
 * from `new Date()` in the client re-opens the midnight/timezone gap between
 * what a tab says and where a dropped card actually lands.
 */
function buildTabs(now: Date, from: number): PlanDayTab[] {
  return Array.from({ length: PLAN_STRIP_DAYS }, (_, i) => {
    const offset = Math.max(PLAN_MIN_DAY_OFFSET, Math.min(from + i, PLAN_MAX_DAY_OFFSET));
    const ymd = ymdForOffset(offset, now);
    const [, m, d] = ymd.split("-");
    const { word, weekday } = dayLabels(ymd, offset);
    const dayMonth = `${d} ${(MONTH_ABBR[Number(m) - 1] ?? "").toUpperCase()}`;
    return {
      offset,
      ymd,
      word,
      // Same rule as the column headers: the three named days show which
      // weekday they actually are; the rest are already named by theirs.
      date: word === weekday ? dayMonth : `${weekday} ${dayMonth}`,
    };
  });
}

/** The most descriptive label for a task card: its real description first, then
 *  the title — many WMS tasks store the CLIENT in `title`, so the description is
 *  what the user actually wants to read. Falls back to the client / "Untitled".
 *
 *  EXPORTED because `addTaskToPlan` must label a pulled task with the SAME
 *  string the source card showed. It did not, and that was the bug: the card in
 *  the pull list read the description while the row it inserted carried the raw
 *  `tasks.title` — which for most WMS tasks is just the client name. So "+"
 *  appeared to drop half the task. One helper, both paths, no drift. */
export function displayTitle(title: string | null, description: string | null, client: string | null): string {
  const desc = description?.trim();
  if (desc) return desc;
  const t = title?.trim();
  if (t) return t;
  return client?.trim() || "Untitled";
}

/**
 * The title to render for a row ALREADY on a plan.
 *
 * Normally that is simply the stored title — it is what the person typed, or
 * what they renamed the card to, and it must win.
 *
 * The exception repairs a bug: `addTaskToPlan` used to copy `tasks.title`
 * verbatim, and many WMS tasks keep the CLIENT in that column, so pulling one in
 * produced a card reading "Altus Corp" while the rail beside it showed the real
 * sentence. The write path is fixed, but rows saved before that keep the bad
 * title, and there is no honest way to tell a stored title from a renamed one.
 *
 * So the fallback is deliberately narrow: only when the row came from a task AND
 * its title is EXACTLY its client does it defer to the task's description. That
 * is the broken case precisely, and it cannot swallow a real rename — renaming a
 * card to the bare client name says nothing the client chip does not already.
 */
function plannedTitle(r: {
  title: string;
  client: string | null;
  taskId: string | null;
  taskDescription: string | null;
}): string {
  const title = r.title?.trim() ?? "";
  const client = r.client?.trim() ?? "";
  if (r.taskId && client && title === client) {
    const desc = r.taskDescription?.trim();
    if (desc) return desc;
  }
  return r.title;
}

/**
 * Previously-unfinished commitments → the "Unfinished" pull box. Dedupe by
 * origin (goal/task/title), drop anything already re-planned, and cap so a long
 * tail can't flood the column.
 */
function buildUnfinished(
  rows: OverdueItem[],
  plannedGoalIds: Set<string>,
  plannedTaskIds: Set<string>,
): SourceItem[] {
  const seen = new Set<string>();
  const out: SourceItem[] = [];
  for (const r of rows) {
    if (r.goalId && plannedGoalIds.has(r.goalId)) continue;
    if (r.taskId && plannedTaskIds.has(r.taskId)) continue;
    const key = r.goalId ?? r.taskId ?? `t:${r.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const label = displayTitle(r.title, r.description, r.client);
    out.push({
      id: r.id,
      kind: "unfinished",
      title: label,
      subtitle: null,
      meta: null,
      added: false,
      overdue: true,
      // Provenance — a carried-over row shows what it originally was and the
      // day it was first committed. Re-adding it REUSES that goal_id/task_id
      // (addUnfinishedToPlan), so nothing is duplicated.
      originKind: r.goalId ? "weekly" : r.taskId ? "task" : "adhoc",
      fromYmd: r.planDate,
      taskId: r.taskId,
    });
  }
  return out.slice(0, 40);
}

/** A WMS task's own calendar block, as the label its source card shows. */
function taskBlockLabel(t: Parameters<typeof effectiveTime>[0]): string | null {
  const { startMin, durationMin } = effectiveTime(t);
  return blockLabel(startMin, durationMin);
}

/** Cascade goal → source card. subtitle = its Area; meta = self-% when logged. */
function goalToSource(g: Goal, kind: SourceItem["kind"]): SourceItem {
  return {
    id: g.id,
    kind,
    title: g.title,
    subtitle: g.area ?? g.uom ?? null,
    meta: g.pctDone > 0 ? `${g.pctDone}%` : null,
    added: false,
  };
}

/**
 * DEADLINE → DAY (Sir): a weekly goal with a target date of the 15th must appear
 * on the 15th's plan by itself — you should not have to remember to drag it over.
 *
 * The "not already planned on ANY day" test is the important half. It respects a
 * deliberate move — if you pushed the goal to the 17th, it stays on the 17th
 * instead of springing back every time you open the 15th — and it upholds the
 * one-item-one-day rule. Best-effort: a failure here must never stop the board
 * from rendering, so the caller swallows it.
 */
async function materialiseGoalsDueOn(employeeId: string, ymd: string): Promise<void> {
  const due = await db
    .select({
      id: weeklyGoals.id,
      subject: weeklyGoals.subject,
      client: weeklyGoals.client,
      targetDone: weeklyGoals.targetDone,
    })
    .from(weeklyGoals)
    .where(
      and(
        eq(weeklyGoals.employeeId, employeeId),
        eq(weeklyGoals.archived, false),
        eq(weeklyGoals.targetDate, ymd),
        ne(weeklyGoals.pctDone, 100),
        // Not planned on ANY day already (a manual move wins over the deadline).
        sql`not exists (
          select 1 from daily_checklist dc
           where dc.goal_id = ${weeklyGoals.id}
             and dc.employee_id = ${employeeId}
        )`,
      ),
    );
  if (due.length === 0) return;
  await appendToDay(
    employeeId,
    ymd,
    due.map((g) => ({
      employeeId,
      planDate: ymd,
      goalId: g.id,
      origin: "goal_related" as const,
      title: g.targetDone?.trim() || g.subject?.trim() || "Weekly goal",
      client: g.client,
      subject: g.subject,
    })),
  );
}

/**
 * WMS DUE DATE → PLAN MY DAY (Sir's rule 12). A WMS task whose EFFECTIVE due
 * (revised ?? due_at) falls on this planner day is filed onto that day by
 * itself — "if a task is due on 18 August it appears under Tuesday, 18 August",
 * with nobody re-typing it.
 *
 * Identical shape to the weekly-goal materialiser above, and identical guard:
 * only tasks not planned on ANY day are pulled in, so dragging a task to another
 * day is respected forever and no task is ever duplicated across days (bug 11).
 * Best-effort — a failure here must never stop the board from rendering.
 */
async function materialiseTasksDueOn(employeeId: string, ymd: string): Promise<void> {
  const due = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      description: tasks.description,
      client: tasks.client,
      subject: tasks.subject,
    })
    .from(tasks)
    .where(
      and(
        eq(tasks.doerId, employeeId),
        eq(tasks.archived, false),
        isNull(tasks.abandonedAt),
        sql`${tasks.status} not in ('done','approved','cancelled')`,
        // Effective due lands on THIS IST day.
        sql`(${effectiveDueAtSql()} at time zone 'Asia/Kolkata')::date = ${ymd}::date`,
        sql`not exists (
          select 1 from daily_checklist dc
           where dc.task_id = ${tasks.id}
             and dc.employee_id = ${employeeId}
        )`,
      ),
    )
    .orderBy(asc(effectiveDueAtSql()));
  if (due.length === 0) return;
  await appendToDay(
    employeeId,
    ymd,
    due.map((t) => ({
      employeeId,
      planDate: ymd,
      taskId: t.id,
      origin: "standalone" as const,
      title: displayTitle(t.title, t.description, t.client),
      client: t.client,
      subject: t.subject,
    })),
  );
}

/** Hard cap per day — mirrors MAX_ITEMS_PER_DAY in the plan actions, so an
 *  auto-materialised day can never blow past what a hand-planned one allows. */
const MAX_ITEMS_PER_DAY = 50;

type NewPlanRow = Omit<typeof dailyChecklist.$inferInsert, "position">;

/** Append rows to a day at the end of its order, respecting the per-day cap. */
async function appendToDay(employeeId: string, ymd: string, rows: NewPlanRow[]): Promise<void> {
  const [agg] = await db
    .select({
      count: sql<number>`count(*)::int`,
      max: sql<number>`coalesce(max(${dailyChecklist.position}), 0)::int`,
    })
    .from(dailyChecklist)
    .where(and(eq(dailyChecklist.employeeId, employeeId), eq(dailyChecklist.planDate, ymd)));
  const room = MAX_ITEMS_PER_DAY - (agg?.count ?? 0);
  if (room <= 0) return;
  let next = (agg?.max ?? 0) + 1;
  await db
    .insert(dailyChecklist)
    .values(rows.slice(0, room).map((r) => ({ ...r, position: next++ })))
    .onConflictDoNothing();
}

/** The plan rows on one day, in order, with any linked WMS task's real schedule. */
async function planRowsForDays(employeeId: string, ymds: string[]) {
  if (ymds.length === 0) return [];
  return db
    .select({
      // Explicit list on purpose — see the module header (no bare select()).
      id: dailyChecklist.id,
      planDate: dailyChecklist.planDate,
      title: dailyChecklist.title,
      client: dailyChecklist.client,
      subject: dailyChecklist.subject,
      origin: dailyChecklist.origin,
      goalId: dailyChecklist.goalId,
      taskId: dailyChecklist.taskId,
      done: dailyChecklist.done,
      donePct: dailyChecklist.donePct,
      doneNote: dailyChecklist.doneNote,
      closedAt: dailyChecklist.closedAt,
      carriedForwardAt: dailyChecklist.carriedForwardAt,
      movedFromDate: dailyChecklist.movedFromDate,
      // WHEN this was committed to the plan — the key the board's
      // Oldest ↔ Newest control orders on (lib/goals/plan-sort.ts).
      createdAt: dailyChecklist.createdAt,
      // The commitment's OWN time (0185) — beats the linked task's schedule.
      startMin: dailyChecklist.startMin,
      durationMin: dailyChecklist.durationMin,
      // Time / priority / due come LIVE off the linked task — the plan row is a
      // reference, so a rescheduled task shows its new time here immediately.
      startsAt: tasks.startsAt,
      endsAt: tasks.endsAt,
      allDay: tasks.allDay,
      estimatedMinutes: tasks.estimatedMinutes,
      priority: tasks.priority,
      taskDueAt: tasks.dueAt,
      taskRevisedTargetDate: tasks.revisedTargetDate,
      // Only for repairing rows saved before the title bug was fixed — see
      // `plannedTitle`. Never shown as the card's own text.
      taskDescription: tasks.description,
    })
    .from(dailyChecklist)
    .leftJoin(tasks, eq(tasks.id, dailyChecklist.taskId))

    .where(
      and(
        eq(dailyChecklist.employeeId, employeeId),
        inArray(dailyChecklist.planDate, ymds),
        // Cancelled work lives in the Recycle Bin, not on the board (0186).
        isNull(dailyChecklist.abandonedAt),
      ),
    )
    // Timed work reads in clock order; untimed work keeps its manual order and
    // sinks below it (Postgres sorts NULLs last on ASC).
    .orderBy(
      asc(dailyChecklist.startMin),
      asc(dailyChecklist.position),
      asc(dailyChecklist.committedAt),
    );
}

/**
 * Commitments the user explicitly marked PENDING at review time. They stay on
 * the day they were planned (that is the honest record of what was committed)
 * and ALSO surface in Unfinished so they can be re-planned — see rule 6.
 * `getOverdueItems` only looks at strictly-earlier days, so today's pending rows
 * need this second read.
 */
async function pendingTodayItems(employeeId: string, ymd: string): Promise<OverdueItem[]> {
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
    .leftJoin(tasks, eq(tasks.id, dailyChecklist.taskId))
    .where(
      and(
        eq(dailyChecklist.employeeId, employeeId),
        eq(dailyChecklist.planDate, ymd),
        eq(dailyChecklist.done, false),
        isNotNull(dailyChecklist.closedAt),
        isNull(dailyChecklist.abandonedAt),
        sql`(${dailyChecklist.taskId} is null or ${tasks.abandonedAt} is null)`,
      ),
    );
  return rows as OverdueItem[];
}

/**
 * Build the complete PlanBoard payload for one employee's planning window.
 * `windowStart` is the offset of the LEFT column (0 = today). Period goals stay
 * anchored to the real `now` (weekly/monthly/… are period-scoped, not per-day);
 * only the plan rows, unfinished carry-over and the day lifecycle move.
 */
export async function getPlanDayPayload(
  employeeId: string,
  now: Date = new Date(),
  windowStart: number = 0,
  hierarchy: PlanHierarchy = { manager: null, managerManager: null },
  windowDays: number = PLAN_WINDOW_DAYS,
): Promise<PlanDayPayload> {
  const days_ = clampWindowDays(windowDays);
  const start = clampWindowStart(windowStart, days_);
  const today = todayYmd(now);
  const offsets = Array.from({ length: days_ }, (_, i) => clampDayOffset(start + i));
  const ymds = offsets.map((o) => ymdForOffset(o, now));

  // END-OF-DAY CARRY FORWARD (Sir) — anything left unreviewed on a day that has
  // already ended lands on today before we read the plan, so opening the page is
  // enough to see it even if the nightly cron never ran. Idempotent, so doing it
  // here AND on a schedule is safe. Never blocks the board.
  await carryForwardUnreviewed(employeeId, now).catch(() => {});

  // Pull in anything whose DEADLINE is one of the visible days before reading
  // the plan, so the very first render already shows it. Never blocks the board.
  //
  // TODAY ONWARDS ONLY. A past column is a record of what was planned then —
  // auto-filing today's overdue work onto last Tuesday would rewrite history and
  // make an old day sprout tasks nobody planned there.
  await Promise.all(
    ymds
      .filter((_, i) => (offsets[i] ?? 0) >= 0)
      .flatMap((ymd) => [
        materialiseGoalsDueOn(employeeId, ymd).catch(() => {}),
        materialiseTasksDueOn(employeeId, ymd).catch(() => {}),
      ]),
  );

  const [rows, weekly, monthG, quarterG, yearG, openTasks, unfinishedRows, pendingRows, isManager, hoursRow, dayRow] =
    await Promise.all([
      planRowsForDays(employeeId, ymds),
      listGoalsForPlanner(employeeId, now),
      getPeriodGoals(employeeId, "month", monthKey(now)),
      getPeriodGoals(employeeId, "quarter", quarterKey(now)),
      getPeriodGoals(employeeId, "year", yearKey(now)),
      // WMS To-Do source. The column filters by OVERDUE BUCKET itself, so it
      // needs the whole open set to filter over — a horizon here would make
      // "All" quietly mean "the next N days". Anything already filed on a
      // planner day is excluded server-side (one item, one day).
      listOpenTasksForChecklist(employeeId, now, { limit: 200, excludePlannedAnyDay: true }),
      // TODAY's date, never a viewed day: "unfinished" means genuinely BEFORE
      // today, whichever day you happen to be planning.
      getOverdueItems(employeeId, today),
      pendingTodayItems(employeeId, today),
      isManagerWithReports(employeeId),
      db
        .select({ start: employees.workingHoursStart, end: employees.workingHoursEnd })
        .from(employees)
        .where(eq(employees.id, employeeId))
        .limit(1),
      db
        .select({ startedAt: dailyPlanDay.startedAt, closedAt: dailyPlanDay.closedAt })
        .from(dailyPlanDay)
        .where(and(eq(dailyPlanDay.employeeId, employeeId), eq(dailyPlanDay.planDate, today)))
        .limit(1),
    ]);

  // Phase: no started stamp → PLAN (morning) · started, not closed → ACTIVE ·
  // closed → CLOSED. It always describes TODAY — future columns are plan-only.
  const day = dayRow[0];
  const initialPhase: PlanPhase = day?.closedAt ? "closed" : day?.startedAt ? "active" : "plan";

  // Cascade provenance (0141, guarded) — without it a GOAL pulled onto a day
  // is indistinguishable from a typed commitment and would wear the wrong tag.
  const cascadeLevels = await cascadeGoalLevels(rows.map((r) => r.id));

  const days: PlanDayColumn[] = offsets.map((offset, i) => {
    const ymd = ymds[i]!;
    const { word, date } = dayLabels(ymd, offset);
    const items: PlanItem[] = rows
      .filter((r) => r.planDate === ymd)
      .map((r) => {
        const effDue = r.taskId
          ? pickEffectiveDue({ dueAt: r.taskDueAt, revisedTargetDate: r.taskRevisedTargetDate })
          : null;
        const dueYmd = effDue ? istYmd(effDue) : null;
        const late = dueYmd && dueYmd < today ? ymdDiffDays(dueYmd, today) : null;
        const time = effectiveTime(r);
        return {
          id: r.id,
          title: plannedTitle(r),
          subtitle: null,
          origin: r.origin === "goal_related" ? ("goal_related" as const) : ("standalone" as const),
          kind: (r.goalId
            ? "weekly"
            : r.taskId
              ? "task"
              : (cascadeLevels.get(r.id) ?? "adhoc")) as PlanKind,
          done: r.done,
          // Reviewed and explicitly parked — not done, but not untouched either.
          pending: !r.done && r.closedAt != null,
          carriedForward: r.carriedForwardAt != null,
          fromYmd: r.movedFromDate,
          donePct: r.donePct,
          doneNote: r.doneNote,
          timeLabel: blockLabel(time.startMin, time.durationMin),
          startMin: time.startMin,
          durationMin: time.durationMin,
          priority: r.priority ?? null,
          overdueDays: late,
          dueYmd,
          taskId: r.taskId,
          createdAtMs: r.createdAt ? r.createdAt.getTime() : null,
          // The doer, not the creator: "who is responsible for this".
          assignee: hierarchy.owner ?? null,
        };
      });
    return { offset, ymd, word, date, items };
  });

  // Everything already filed on ANY of the visible days, so a source card can't
  // be offered twice.
  const plannedGoalIds = new Set(rows.map((r) => r.goalId).filter(Boolean) as string[]);
  const plannedTaskIds = new Set(rows.map((r) => r.taskId).filter(Boolean) as string[]);

  const sources = {
    weekly: weekly.map<SourceItem>((g) => ({
      id: g.id,
      kind: "weekly",
      title: g.targetDone?.trim() || g.subject?.trim() || "Weekly goal",
      subtitle: g.client ?? g.subject ?? null,
      meta: g.pctDone > 0 ? `${g.pctDone}%` : null,
      added: plannedGoalIds.has(g.id) || g.pulledToday,
    })),
    monthly: monthG.filter((g) => g.adopted).map((g) => goalToSource(g, "monthly")),
    quarterly: quarterG.filter((g) => g.adopted).map((g) => goalToSource(g, "quarterly")),
    yearly: yearG.filter((g) => g.adopted).map((g) => goalToSource(g, "yearly")),
    task: openTasks.map<SourceItem>((t) => {
      const overdue = t.dueAt != null && t.dueAt < today;
      return {
        // `id` IS the tasks.id — adding this card calls addTaskToPlan(id), which
        // stores the reference on daily_checklist.task_id. No WMS task is created.
        id: t.id,
        kind: "task",
        title: displayTitle(t.title, t.description, t.client),
        subtitle: null,
        meta: null,
        added: false,
        overdue,
        // Everything the card + the two filters actually read. No task_no, no
        // company, no WMS status — see the SourceItem doc comment.
        priority: t.priority,
        dueYmd: t.dueAt,
        taskId: t.id,
        description: t.description,
        overdueDays: overdue && t.dueAt ? ymdDiffDays(t.dueAt, today) : null,
        timeLabel: taskBlockLabel(t),
      };
    }),
    unfinished: buildUnfinished([...pendingRows, ...unfinishedRows], plannedGoalIds, plannedTaskIds),
  };

  // THE TIMELINE AXIS — the person's OWN working hours (employees.working_hours_*),
  // widened to cover anything already scheduled outside them so a 9 PM block can
  // never fall off the grid. The fallback only fires if the column is unreadable.
  const workStart = timeColumnToMin(hoursRow[0]?.start) ?? 10 * 60;
  const workEnd = timeColumnToMin(hoursRow[0]?.end) ?? 19 * 60;
  const timed = (days.find((d) => d.offset === 0)?.items ?? []).filter((i) => i.startMin != null);
  const earliest = timed.reduce((m, i) => Math.min(m, i.startMin!), workStart);
  const latest = timed.reduce(
    (m, i) => Math.max(m, i.startMin! + (i.durationMin ?? 30)),
    Math.max(workEnd, workStart + 60),
  );
  const workday = {
    startMin: Math.max(0, Math.floor(earliest / 60) * 60),
    endMin: Math.min(24 * 60, Math.ceil(latest / 60) * 60),
  };

  return {
    days,
    // The strip starts on the board's leftmost day, so the week you are looking
    // at and the days you can drop onto are always the same week.
    tabs: buildTabs(now, start),
    windowStart: start,
    windowDays: days_,
    maxWindowStart: maxWindowStartFor(days_),
    minWindowStart: MIN_WINDOW_START,
    stripDays: PLAN_STRIP_DAYS,
    sources,
    // 5 for EVERYONE, not 5-for-managers / 3-for-ICs (Sir). This is the same
    // constant the attendance gate and the startMyDay guard read: if the button
    // enabled at 3 for an IC, they would start their day and then be refused at
    // the clock — the worst of both. One number, one source of truth.
    minItems: MIN_ATTENDANCE_ITEMS,
    isManager,
    initialPhase,
    todayYmd: today,
    hierarchy,
    workday,
  };
}

