import "server-only";

import { and, asc, eq, gte, inArray, isNull, lte, ne, sql } from "drizzle-orm";
import { alias, type AnyPgColumn } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import { dailyChecklist, departments, employees } from "@/db/schema";
import { goalScopeFor } from "@/lib/weekly-goals/hierarchy";
import { istYmd } from "@/lib/weekly-goals/week";
import {
  emptyScorecard,
  addScorecard,
  mondayOfYmd,
  parseThreshold,
  resolveRange,
  type ScoreStream,
  type Scorecard,
} from "@/lib/daily-goals/score";
import type {
  DashFilters,
  DashOptions,
  DashPayload,
  DashPerson,
  PersonRow,
} from "@/lib/daily-goals/types";

/**
 * DAILY GOALS -> DASHBOARD — the server-side payload assembler.
 *
 * Reads ONLY `daily_checklist` (plus `employees`/`departments` for the org
 * filters). It writes nothing and it is not wired into any other surface: the
 * planner at /my-day, the WMS dashboard at /dashboard and the Goals rail are all
 * untouched by this module.
 *
 * ── PERMISSIONS ────────────────────────────────────────────────────────────
 * Whose numbers you may read is decided by `goalScopeFor` — the SAME hierarchy
 * that decides whose day you may plan (lib/goals/plan-target.ts). No second
 * permission model:
 *   · admin / Manan  -> everyone
 *   · manager        -> themselves + their full downline
 *   · everyone else  -> themselves only, and the org filters are not rendered
 * A hand-crafted `?emp=` / `?dept=` / `?lead=` can only ever narrow the set the
 * scope already allows, never widen it — every filter is applied to the roster
 * AFTER the scope has produced it.
 *
 * ⚠ `daily_checklist.cascade_goal_id` (migration 0141) may be UNAPPLIED in
 * production, so — exactly as goals/plan/payload.ts does — nothing here
 * references that column. Y/Q/M cascade goals still land in the Goals stream
 * because the planner stamps `origin = 'goal_related'` when it pulls them.
 */

/* ----------------------------------------------------------------------- */
/* Row -> stream                                                            */
/* ----------------------------------------------------------------------- */

/**
 * Which of the three streams a `daily_checklist` row belongs to, expressed in
 * SQL so the grouping happens in the database rather than over 100k JS objects.
 *
 * The ladder matches the planner's own `kind` derivation in
 * goals/plan/payload.ts: a WMS task reference wins, then a goal link, then
 * `origin = 'goal_related'` (which is what a pulled Y/Q/M cascade goal carries),
 * and anything left is a typed commitment.
 */
const STREAM_SQL = sql<ScoreStream>`
  CASE
    WHEN ${dailyChecklist.taskId} IS NOT NULL THEN 'wms'
    WHEN ${dailyChecklist.goalId} IS NOT NULL OR ${dailyChecklist.origin} = 'goal_related' THEN 'goals'
    ELSE 'commitments'
  END
`;

const asStream = (v: unknown): ScoreStream =>
  v === "wms" || v === "goals" ? v : "commitments";

/* ----------------------------------------------------------------------- */
/* Accumulator                                                              */
/* ----------------------------------------------------------------------- */

/** `employeeId -> ymd -> Scorecard`. Every window the page reports on is a
 *  different slice of this one grid, so the database is read once. */
type Grid = Map<string, Map<string, Scorecard>>;

function cellFor(grid: Grid, employeeId: string, day: string): Scorecard {
  let byDay = grid.get(employeeId);
  if (!byDay) grid.set(employeeId, (byDay = new Map()));
  let cell = byDay.get(day);
  if (!cell) byDay.set(day, (cell = emptyScorecard()));
  return cell;
}

/** Sum every (employee in `ids`, day in [from, to]) cell of the grid. */
function slice(grid: Grid, ids: string[], from: string, to: string): Scorecard {
  const out = emptyScorecard();
  for (const id of ids) {
    const byDay = grid.get(id);
    if (!byDay) continue;
    for (const [day, card] of byDay) {
      if (day >= from && day <= to) addScorecard(out, card);
    }
  }
  return out;
}

/* ----------------------------------------------------------------------- */
/* The loader                                                               */
/* ----------------------------------------------------------------------- */

export interface DashParams {
  period?: unknown;
  day?: unknown;
  from?: unknown;
  to?: unknown;
  dept?: unknown;
  lead?: unknown;
  emp?: unknown;
  threshold?: unknown;
}

const str = (v: unknown): string | null => {
  const s = String(v ?? "").trim();
  return s.length > 0 ? s : null;
};

export async function loadDailyGoalsDashboard(
  me: { id: string; name: string; isAdmin: boolean },
  params: DashParams,
  now: Date = new Date(),
): Promise<DashPayload> {
  const today = istYmd(now);
  const range = resolveRange(today, params);
  const threshold = parseThreshold(params.threshold);

  /* ── WHO the viewer may see ─────────────────────────────────────────── */
  const scope = await goalScopeFor({ id: me.id, isAdmin: me.isAdmin });
  const lead = alias(employees, "lead");
  const roster: DashPerson[] = await db
    .select({
      id: employees.id,
      name: employees.name,
      // `department_id` is canonical, but the legacy free-text column is still
      // populated for anyone the M3 migration has not touched — coalescing
      // keeps those people inside a department filter instead of stranding
      // them under "(none)".
      department: sql<string | null>`coalesce(${departments.name}, ${employees.department})`,
      leadId: employees.managerId,
      leadName: lead.name,
    })
    .from(employees)
    .leftJoin(departments, eq(departments.id, employees.departmentId))
    .leftJoin(lead, eq(lead.id, employees.managerId))
    .where(
      scope.all
        ? eq(employees.isActive, true)
        : and(eq(employees.isActive, true), inArray(employees.id, scope.ids)),
    )
    .orderBy(asc(employees.name));

  // A viewer with nobody but themselves in reach gets the individual dashboard:
  // no org filters, no leaderboards, no threshold table.
  const individual = roster.length <= 1;

  /* ── The filter cascade ─────────────────────────────────────────────── */
  // Each control narrows what the ones after it may offer, so the Employee list
  // only ever holds people who are actually in the chosen department/team.
  const wantDept = individual ? null : str(params.dept);
  const wantLead = individual ? null : str(params.lead);
  const wantEmp = str(params.emp);

  const byDept = wantDept ? roster.filter((p) => p.department === wantDept) : roster;
  const byLead = wantLead ? byDept.filter((p) => p.leadId === wantLead) : byDept;
  // An `?emp=` outside the permitted roster is ignored rather than honoured —
  // it can only ever narrow, never reach someone the scope excluded.
  const picked = wantEmp ? byLead.find((p) => p.id === wantEmp) ?? null : null;
  const selection = picked ? [picked] : byLead;

  const options: DashOptions = {
    departments: [...new Set(roster.map((p) => p.department).filter(Boolean) as string[])].sort(),
    leads: [
      ...new Map(
        byDept
          .filter((p) => p.leadId && p.leadName)
          .map((p) => [p.leadId as string, { id: p.leadId as string, name: p.leadName as string }]),
      ).values(),
    ].sort((a, b) => a.name.localeCompare(b.name)),
    employees: byLead.map((p) => ({ id: p.id, name: p.name })),
  };

  const filters: DashFilters = {
    department: wantDept,
    leadId: wantLead,
    employeeId: picked?.id ?? null,
    threshold,
  };

  // The subject line — an individual viewer is always their own subject; a
  // manager becomes one the moment they pick a single employee.
  const subject = picked ?? (individual ? roster[0] ?? null : null);

  const ids = selection.map((p) => p.id);
  const empty: DashPayload = {
    individual,
    meId: me.id,
    subject,
    today,
    range,
    filters,
    options,
    score: emptyScorecard(),
    performance: { today: emptyScorecard(), week: emptyScorecard(), mtd: emptyScorecard() },
    transfers: [],
    peopleCount: 0,
    people: [],
  };
  if (ids.length === 0) return empty;

  /* ── ONE read, three windows ────────────────────────────────────────── */
  // The Performance strip always reports today / this week / month-to-date
  // alongside whatever the header is set to, so the query spans the UNION of
  // all four and every figure below is a slice of the same grid.
  const weekStart = mondayOfYmd(today);
  const monthStart = `${today.slice(0, 7)}-01`;
  const from = [range.from, weekStart, monthStart, today].reduce((a, b) => (a < b ? a : b));
  const to = [range.to, today].reduce((a, b) => (a > b ? a : b));

  const grid: Grid = new Map();
  const transfers = new Map<string, number>();

  // `plan_date` is NOT NULL and `moved_from_date` is nullable, so drizzle types
  // them as two different columns — `AnyPgColumn` is what lets one helper bound
  // both. A NULL `moved_from_date` simply fails the comparison, which is the
  // wanted behaviour: a row that never moved was never transferred off a day.
  const inWindow = (col: AnyPgColumn) => and(gte(col, from), lte(col, to));

  // (A) Everything SITTING on a day in the window: the day's planned set, its
  // ticks, and what is still open on it.
  const sitting = await db
    .select({
      employeeId: dailyChecklist.employeeId,
      day: dailyChecklist.planDate,
      stream: STREAM_SQL,
      planned: sql<number>`count(*)::int`,
      done: sql<number>`count(*) FILTER (WHERE ${dailyChecklist.done})::int`,
    })
    .from(dailyChecklist)
    .where(
      and(
        isNull(dailyChecklist.abandonedAt),
        inArray(dailyChecklist.employeeId, ids),
        inWindow(dailyChecklist.planDate),
      ),
    )
    .groupBy(dailyChecklist.employeeId, dailyChecklist.planDate, STREAM_SQL);

  for (const r of sitting) {
    const cell = cellFor(grid, r.employeeId, r.day);
    const bucket = cell[asStream(r.stream)];
    bucket.planned += r.planned;
    bucket.done += r.done;
    cell.overall.planned += r.planned;
    cell.overall.done += r.done;
    cell.unfinished += r.planned - r.done;
  }

  // (B) Everything that was planned on a day in the window and has since MOVED
  // OFF it. It stays in that day's planned set and never enters its done set —
  // which is precisely what makes a transfer score-neutral (see score.ts).
  const moved = await db
    .select({
      employeeId: dailyChecklist.employeeId,
      day: dailyChecklist.movedFromDate,
      toDay: dailyChecklist.planDate,
      stream: STREAM_SQL,
      n: sql<number>`count(*)::int`,
    })
    .from(dailyChecklist)
    .where(
      and(
        isNull(dailyChecklist.abandonedAt),
        inArray(dailyChecklist.employeeId, ids),
        inWindow(dailyChecklist.movedFromDate),
        // Belt-and-braces: the transfer action refuses a same-day move, so this
        // should never fire — but a row that claimed to have moved to where it
        // already is would be counted on that day twice.
        ne(dailyChecklist.movedFromDate, dailyChecklist.planDate),
      ),
    )
    .groupBy(
      dailyChecklist.employeeId,
      dailyChecklist.movedFromDate,
      dailyChecklist.planDate,
      STREAM_SQL,
    );

  for (const r of moved) {
    if (!r.day) continue;
    const cell = cellFor(grid, r.employeeId, r.day);
    cell[asStream(r.stream)].planned += r.n;
    cell.overall.planned += r.n;
    cell.transferred += r.n;
    // The "Transferred From <day>" breakdown only covers the ACTIVE window, not
    // the wider union the query had to span for the Performance strip.
    if (r.day >= range.from && r.day <= range.to) {
      transfers.set(r.toDay, (transfers.get(r.toDay) ?? 0) + r.n);
    }
  }

  /* ── Slice it ───────────────────────────────────────────────────────── */
  const people: PersonRow[] = individual
    ? []
    : selection.map((p) => ({
        ...p,
        range: slice(grid, [p.id], range.from, range.to),
        week: slice(grid, [p.id], weekStart, today),
        mtd: slice(grid, [p.id], monthStart, today),
      }));

  return {
    individual,
    meId: me.id,
    subject,
    today,
    range,
    filters,
    options,
    score: slice(grid, ids, range.from, range.to),
    performance: {
      today: slice(grid, ids, today, today),
      week: slice(grid, ids, weekStart, today),
      mtd: slice(grid, ids, monthStart, today),
    },
    transfers: [...transfers.entries()]
      .map(([toDay, count]) => ({ toDay, count }))
      .sort((a, b) => a.toDay.localeCompare(b.toDay)),
    peopleCount: selection.length,
    people,
  };
}
