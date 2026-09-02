import "server-only";
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, weeklyGoals, tasks, attendanceLogs, incentiveRequests } from "@/db/schema";
import type { TaskPriority } from "@/db/enums";
import {
  periodStart,
  recentWeekStarts,
  type PerformerPeriod,
} from "@/lib/weekly-goals/week";
import {
  effectiveCompletedSql,
  effectivePctSql,
  weeklyScoreSql,
} from "@/lib/weekly-goals/effective";

// Re-export the fill-gate helpers from the queries module so the
// `requireWeeklyGoalsFilled` guard (lib/auth/current.ts) — which lazily imports
// `hasUnfilledWeekGoals` from `@/lib/queries/weekly-goals` — wires up. The
// implementation lives in lib/weekly-goals/gate.ts (single source of truth).
export {
  hasUnfilledWeekGoals,
  countUnfilledWeekGoals,
  listUnfilledWeekGoals,
  type UnfilledWeekGoal,
} from "@/lib/weekly-goals/gate";

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

/**
 * Goals across a set of employees for one week — the manager's team overview.
 * Same shape/joins as `listGoalsForWeek`, but scoped to `employeeIds` (their
 * downline + self). Returns [] for an empty id list. Sorted by employee then
 * Sr. No.
 */
export async function listGoalsForEmployees(
  employeeIds: string[],
  weekStart: string,
): Promise<WeeklyGoalRow[]> {
  if (employeeIds.length === 0) return [];
  return db
    .select(ROW_SELECT)
    .from(weeklyGoals)
    .innerJoin(employees, eq(weeklyGoals.employeeId, employees.id))
    .where(
      and(
        inArray(weeklyGoals.employeeId, employeeIds),
        eq(weeklyGoals.weekStart, weekStart),
      ),
    )
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
 * Leaderboard for a period (this week / this month / YTD). Ranks by the
 * effective, weight-aware weekly score (Accept% if reviewed else %Done,
 * Σ(eff×weight)/Σ(weight)) over every non-archived goal whose week falls in the
 * window, best-first. Only employees with ≥1 (non-archived) goal appear.
 */
export async function employeeRankings(
  period: PerformerPeriod,
  now: Date = new Date(),
  employeeId?: string,
): Promise<EmployeeRanking[]> {
  const start = periodStart(period, now);
  const rows = await db
    .select({
      employeeId: weeklyGoals.employeeId,
      employeeName: employees.name,
      goals: sql<number>`count(*)::int`,
      completed: effectiveCompletedSql,
      // Weight-aware effective % across the window (the official metric, §4).
      avgPct: weeklyScoreSql,
    })
    .from(weeklyGoals)
    .innerJoin(employees, eq(weeklyGoals.employeeId, employees.id))
    .where(
      and(
        gte(weeklyGoals.weekStart, start),
        eq(weeklyGoals.archived, false),
        ...(employeeId ? [eq(weeklyGoals.employeeId, employeeId)] : []),
      ),
    )
    .groupBy(weeklyGoals.employeeId, employees.name)
    .orderBy(
      desc(weeklyScoreSql),
      desc(effectiveCompletedSql),
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
        completed: effectiveCompletedSql,
        // Effective, weight-aware % over the window (§4).
        avgPct: weeklyScoreSql,
      })
      .from(weeklyGoals)
      .where(and(gte(weeklyGoals.weekStart, goalStart), eq(weeklyGoals.archived, false)))
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
      // NOTE (port adaptation): the intern schema had an `archived` column on
      // incentive_requests; ours doesn't. Dropped that predicate so the query
      // compiles + means the same thing here (approved-in-period wins).
      .where(
        and(
          eq(incentiveRequests.status, "approved"),
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
    ? and(
        gte(weeklyGoals.weekStart, earliest),
        eq(weeklyGoals.archived, false),
        eq(weeklyGoals.employeeId, opts.employeeId),
      )
    : and(gte(weeklyGoals.weekStart, earliest), eq(weeklyGoals.archived, false));

  const rows = await db
    .select({
      weekStart: weeklyGoals.weekStart,
      // Rebased onto the effective, weight-aware % (§4).
      avgPct: weeklyScoreSql,
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

/* ------------------------------------------------------------------ */
/* Weekly-goals leaderboard (analytics dashboard §12)                  */
/* ------------------------------------------------------------------ */

export interface WeeklyGoalLeaderboardRow {
  empId: string;
  name: string;
  avatar: string | null;
  /** Spec 1 — avg effective % (weight-aware) over the window, 0..100. */
  weightedScore: number;
  /** Spec 3 — goals at effective % ≥ 100 + the completion rate. */
  completion: {
    /** Count of non-archived goals at effective % ≥ 100. */
    done: number;
    /** done / total goals, 0..100. */
    rate: number;
  };
  /** Spec 2 — consistency composite + streak. */
  consistency: {
    /** % of weeks (with goals) where ALL goals were filled in-time, 0..100. */
    fillOnTimeRate: number;
    /** Avg effective % across the window, 0..100. */
    avgEffective: number;
    /** 0.5×fillOnTimeRate + 0.5×avgEffective, 0..100. */
    composite: number;
    /** Consecutive most-recent fully-filled weeks (ending at the window end). */
    streak: number;
  };
  /** Spec 4 — KPI goals achieved (kpi flag + effective % ≥ 100). */
  kpiHits: number;
  /** Spec 4 — total ₹ incentive earned on completed incentive goals. */
  incentiveEarned: number;
}

/** Small grace (days) after the week ends within which a fill still counts
 *  as "on time" — matches the design's "+ small grace". */
const FILL_GRACE_DAYS = 1;

/**
 * One leaderboard pass that returns ALL FOUR leaderboard specs (§12) per
 * employee, so the UI just re-sorts: weighted weekly score, consistency +
 * streak, goals completed, and KPI + incentive. Computed over a per-employee ×
 * per-week aggregation across the window (for the fill-on-time rate + streak).
 *
 * Only non-archived goals contribute. Employees with no goals in the window are
 * dropped. Effective % is Accept% (if reviewed) else %Done, weight-aware (§4).
 */
export async function weeklyGoalLeaderboard(
  window: PerformerPeriod,
  now: Date = new Date(),
  employeeId?: string,
): Promise<WeeklyGoalLeaderboardRow[]> {
  const start = periodStart(window, now);

  // Per-employee × per-week aggregation. `onTime` = the week's goals were all
  // filled within (week end + grace); `filled`/`total` let us tell a fully
  // filled week from a partial one for the streak. week end = Monday + 6 days.
  const perWeek = await db
    .select({
      employeeId: weeklyGoals.employeeId,
      weekStart: weeklyGoals.weekStart,
      total: sql<number>`count(*)::int`,
      filled: sql<number>`count(*) filter (where ${weeklyGoals.pctUpdatedAt} is not null)::int`,
      // On-time = every goal in the week was filled on/before week-end + grace.
      onTimeFilled: sql<number>`count(*) filter (
        where ${weeklyGoals.pctUpdatedAt} is not null
          and ${weeklyGoals.pctUpdatedAt} <= ((${weeklyGoals.weekStart}::date + ${6 + FILL_GRACE_DAYS}::int) + time '23:59:59')
      )::int`,
      done: effectiveCompletedSql,
      // Weighted numerator / denominator so we can re-aggregate across weeks
      // without double-rounding.
      weightedSum: sql<number>`coalesce(sum(${effectivePctSql} * ${weeklyGoals.weight}), 0)`,
      weightTotal: sql<number>`coalesce(sum(${weeklyGoals.weight}), 0)`,
      kpiHits: sql<number>`count(*) filter (where ${weeklyGoals.kpi} = true and ${effectivePctSql} >= 100)::int`,
      incentiveEarned: sql<number>`coalesce(sum(${weeklyGoals.incentiveAmount}) filter (where ${weeklyGoals.incentive} = true and ${effectivePctSql} >= 100), 0)::int`,
    })
    .from(weeklyGoals)
    .where(
      and(
        gte(weeklyGoals.weekStart, start),
        eq(weeklyGoals.archived, false),
        ...(employeeId ? [eq(weeklyGoals.employeeId, employeeId)] : []),
      ),
    )
    .groupBy(weeklyGoals.employeeId, weeklyGoals.weekStart);

  const emps = await db
    .select({ id: employees.id, name: employees.name, avatar: employees.avatarUrl })
    .from(employees)
    .where(eq(employees.isActive, true));
  const empBy = new Map(emps.map((e) => [e.id, e]));

  // Fold per-week rows into per-employee aggregates.
  interface Acc {
    weeks: { weekStart: string; total: number; filled: number; onTime: boolean }[];
    weightedSum: number;
    weightTotal: number;
    goalsTotal: number;
    done: number;
    kpiHits: number;
    incentiveEarned: number;
  }
  const accBy = new Map<string, Acc>();
  for (const r of perWeek) {
    let acc = accBy.get(r.employeeId);
    if (!acc) {
      acc = {
        weeks: [],
        weightedSum: 0,
        weightTotal: 0,
        goalsTotal: 0,
        done: 0,
        kpiHits: 0,
        incentiveEarned: 0,
      };
      accBy.set(r.employeeId, acc);
    }
    acc.weeks.push({
      weekStart: r.weekStart,
      total: r.total,
      filled: r.filled,
      onTime: r.total > 0 && r.onTimeFilled >= r.total,
    });
    acc.weightedSum += Number(r.weightedSum);
    acc.weightTotal += Number(r.weightTotal);
    acc.goalsTotal += r.total;
    acc.done += r.done;
    acc.kpiHits += r.kpiHits;
    acc.incentiveEarned += r.incentiveEarned;
  }

  const rows: WeeklyGoalLeaderboardRow[] = [];
  for (const [empId, acc] of accBy) {
    const meta = empBy.get(empId);
    if (!meta) continue; // inactive / removed employee — skip

    const weeksWithGoals = acc.weeks.length;
    const onTimeWeeks = acc.weeks.filter((w) => w.onTime).length;
    const fillOnTimeRate =
      weeksWithGoals > 0 ? Math.round((onTimeWeeks / weeksWithGoals) * 100) : 0;

    const avgEffective =
      acc.weightTotal > 0 ? Math.round(acc.weightedSum / acc.weightTotal) : 0;
    const weightedScore = avgEffective;

    const composite = Math.round(0.5 * fillOnTimeRate + 0.5 * avgEffective);

    // Streak: consecutive fully-filled weeks counting back from the most-recent
    // week the employee had goals in.
    const sortedDesc = [...acc.weeks].sort((a, b) =>
      a.weekStart < b.weekStart ? 1 : a.weekStart > b.weekStart ? -1 : 0,
    );
    let streak = 0;
    for (const w of sortedDesc) {
      if (w.total > 0 && w.filled >= w.total) streak += 1;
      else break;
    }

    const completionRate =
      acc.goalsTotal > 0 ? Math.round((acc.done / acc.goalsTotal) * 100) : 0;

    rows.push({
      empId,
      name: meta.name,
      avatar: meta.avatar,
      weightedScore,
      completion: { done: acc.done, rate: completionRate },
      consistency: { fillOnTimeRate, avgEffective, composite, streak },
      kpiHits: acc.kpiHits,
      incentiveEarned: acc.incentiveEarned,
    });
  }

  // Default order: weighted score, then composite consistency.
  return rows.sort(
    (a, b) =>
      b.weightedScore - a.weightedScore ||
      b.consistency.composite - a.consistency.composite ||
      a.name.localeCompare(b.name),
  );
}

/** Active employees (incl. interns) for the person selector. */
export async function listGoalEmployees(): Promise<{ id: string; name: string }[]> {
  return db
    .select({ id: employees.id, name: employees.name })
    .from(employees)
    .where(eq(employees.isActive, true))
    .orderBy(asc(employees.name));
}

/**
 * Active employees for the person selector, scoped to a goal-management scope:
 *  - admin (`scope.all`) → every active employee (same as `listGoalEmployees`)
 *  - manager → only the active employees in `scope.ids` (their downline + self)
 * Always ordered by name. Returns [] for a non-admin scope with no ids.
 */
export async function listGoalEmployeesScoped(scope: {
  all: boolean;
  ids: string[];
}): Promise<{ id: string; name: string }[]> {
  if (scope.all) return listGoalEmployees();
  if (scope.ids.length === 0) return [];
  return db
    .select({ id: employees.id, name: employees.name })
    .from(employees)
    .where(and(eq(employees.isActive, true), inArray(employees.id, scope.ids)))
    .orderBy(asc(employees.name));
}
