import "server-only";
import { and, eq, inArray, ne, or, gte, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { goals, weeklyGoals, employees } from "@/db/schema";
import { withRetry } from "@/lib/db/with-timeout";
import { getDownlineIds } from "@/lib/weekly-goals/hierarchy";
import { effectivePct, weeklyScore } from "@/lib/weekly-goals/effective";
import { currentWeekStart } from "@/lib/weekly-goals/week";
import type { Goal, GoalNode, GoalPeriod } from "./types";
import { quartersOfFy, monthKeysOfFy } from "./types";

const READ_BUDGET = [6000, 12000] as const;

/** Assemble a parent→child tree from a flat goal set (children sorted by position). */
function buildTree(rows: Goal[]): GoalNode[] {
  const byId = new Map<string, GoalNode>();
  for (const r of rows) byId.set(r.id, { ...r, children: [] });
  const roots: GoalNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parentGoalId ? byId.get(node.parentGoalId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const sortRec = (ns: GoalNode[]) => {
    ns.sort((a, b) => a.position - b.position);
    ns.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  return roots;
}

export interface YearBoard {
  fyStartYear: number;
  /** period='year' roots with their quarter→month subtrees. */
  years: GoalNode[];
  /** Parentless quarter/month goals (standalone, not cascaded). */
  standalone: GoalNode[];
}

/** The whole cascade for one person in one financial year, as a tree. */
export async function getYearBoard(
  employeeId: string,
  fyStartYear: number,
  scope: "professional" | "personal" = "professional",
): Promise<YearBoard> {
  const keys = [String(fyStartYear), ...quartersOfFy(fyStartYear), ...monthKeysOfFy(fyStartYear)];
  // Year/Quarter/Month match by canonical key; the Personal space ALSO stores
  // week/day goals in this table (periodKey = a date), so include those by
  // period + FY date-range. (Professional has no week/day rows here → no-op.)
  const fyStart = `${fyStartYear}-04-01`;
  const fyEnd = `${fyStartYear + 1}-03-31`;
  const rows = await withRetry(
    () =>
      db
        .select()
        .from(goals)
        .where(
          and(
            eq(goals.employeeId, employeeId),
            eq(goals.archived, false),
            eq(goals.scope, scope),
            or(
              inArray(goals.periodKey, keys),
              and(
                inArray(goals.period, ["week", "day"]),
                gte(goals.periodKey, fyStart),
                lte(goals.periodKey, fyEnd),
              ),
            ),
          ),
        ),
    { timeoutMs: [...READ_BUDGET], label: "goals.getYearBoard" },
  );
  const tree = buildTree(rows as Goal[]);
  return {
    fyStartYear,
    years: tree.filter((n) => n.period === "year"),
    standalone: tree.filter((n) => n.period !== "year"),
  };
}

export interface AssignedGoal {
  id: string;
  title: string;
  area: string | null;
  period: string;
  periodKey: string;
  pctDone: number;
  acceptPct: number | null;
  ownerName: string;
}

/**
 * Goals OWNED BY OTHERS where this person is named in `team_involved` (Sir #25) —
 * "whoever is selected for a goal sees it in his own view, in his own capacity."
 * Scoped to the FY, excludes the person's own goals (those already show on the board).
 */
export async function getAssignedGoals(employeeId: string, fyStartYear: number): Promise<AssignedGoal[]> {
  const keys = [String(fyStartYear), ...quartersOfFy(fyStartYear), ...monthKeysOfFy(fyStartYear)];
  const rows = await withRetry(
    () =>
      db
        .select({
          id: goals.id,
          title: goals.title,
          area: goals.area,
          period: goals.period,
          periodKey: goals.periodKey,
          pctDone: goals.pctDone,
          acceptPct: goals.acceptPct,
          ownerName: employees.name,
        })
        .from(goals)
        .innerJoin(employees, eq(employees.id, goals.employeeId))
        .where(
          and(
            eq(goals.archived, false),
            ne(goals.employeeId, employeeId),
            inArray(goals.periodKey, keys),
            sql`${goals.teamInvolved} @> ${JSON.stringify([{ employeeId }])}::jsonb`,
          ),
        ),
    { timeoutMs: [...READ_BUDGET], label: "goals.getAssignedGoals" },
  );
  return rows as AssignedGoal[];
}

/**
 * Cascade goals OWNED BY OTHERS and SHARED with this person — the level-board
 * counterpart to `getAssignedGoals` (which returns the canvas's lean read-only
 * shape). Here we return the FULL rows so the board can map them through
 * `toGoalDTO` and render them inline on the member's own Yearly/Quarterly/
 * Monthly board. A row qualifies when: not archived, in the SAME space, owned by
 * someone else, `share_with_team = true`, in this FY's buckets, AND `team_involved`
 * contains this person. One lean containment select (mirrors getAssignedGoals'
 * proven pattern) — load-neutral (result set is only this person's shared goals).
 */
export async function getSharedGoals(
  employeeId: string,
  fyStartYear: number,
  scope: "professional" | "personal" = "professional",
): Promise<Goal[]> {
  const keys = [String(fyStartYear), ...quartersOfFy(fyStartYear), ...monthKeysOfFy(fyStartYear)];
  const rows = await withRetry(
    () =>
      db
        .select()
        .from(goals)
        .where(
          and(
            eq(goals.archived, false),
            eq(goals.scope, scope),
            ne(goals.employeeId, employeeId),
            inArray(goals.periodKey, keys),
            // A goal reaches this person's board two ways: shared with them as a
            // team member (share_with_team + team_involved), OR delegated to them
            // (delegated_to — accountability, mig 0171). ONE indexed select still.
            or(
              and(
                eq(goals.shareWithTeam, true),
                sql`${goals.teamInvolved} @> ${JSON.stringify([{ employeeId }])}::jsonb`,
              ),
              sql`${goals.delegatedTo} @> ${JSON.stringify([{ employeeId }])}::jsonb`,
            ),
          ),
        ),
    { timeoutMs: [...READ_BUDGET], label: "goals.getSharedGoals" },
  );
  return rows as Goal[];
}

/**
 * The viewed person's WEEKLY goals across one financial year — the Month board's
 * week-lane source (week goals live on `weekly_goals`, not the `goals` table, so
 * the year-board query can't reach them). ONE lean indexed select by
 * (employee, week_start range), mirroring the lean `getSharedGoals` pattern —
 * load-neutral (the result set is only this person's weekly rows for the FY).
 * `week_start` (a DATE) is the bucket key; the caller maps each row to a
 * `period="week"` GoalDTO keyed on it.
 */
export async function getBoardWeeklyGoals(
  employeeId: string,
  fyStartYear: number,
): Promise<(typeof weeklyGoals.$inferSelect)[]> {
  const fyStart = `${fyStartYear}-04-01`;
  const fyEnd = `${fyStartYear + 1}-03-31`;
  const rows = await withRetry(
    () =>
      db
        .select()
        .from(weeklyGoals)
        .where(
          and(
            eq(weeklyGoals.employeeId, employeeId),
            eq(weeklyGoals.archived, false),
            gte(weeklyGoals.weekStart, fyStart),
            lte(weeklyGoals.weekStart, fyEnd),
          ),
        ),
    { timeoutMs: [...READ_BUDGET], label: "goals.getBoardWeeklyGoals" },
  );
  return rows as (typeof weeklyGoals.$inferSelect)[];
}

/** Goals for one person at one period + key (non-archived), ordered by Sr No. */
export async function getPeriodGoals(
  employeeId: string,
  period: GoalPeriod,
  periodKey: string,
): Promise<Goal[]> {
  const rows = await withRetry(
    () =>
      db
        .select()
        .from(goals)
        .where(
          and(
            eq(goals.employeeId, employeeId),
            eq(goals.period, period),
            eq(goals.periodKey, periodKey),
            eq(goals.archived, false),
          ),
        ),
    { timeoutMs: [...READ_BUDGET], label: "goals.getPeriodGoals" },
  );
  return (rows as Goal[]).sort((a, b) => a.position - b.position);
}

export interface ReviewBundle {
  fyStartYear: number;
  goals: Goal[];
}

/** All cascade goals for one person in an FY (flat) — the review surface source. */
export async function getReviewBundle(employeeId: string, fyStartYear: number): Promise<ReviewBundle> {
  const keys = [String(fyStartYear), ...quartersOfFy(fyStartYear), ...monthKeysOfFy(fyStartYear)];
  const rows = await withRetry(
    () =>
      db
        .select()
        .from(goals)
        .where(
          and(
            eq(goals.employeeId, employeeId),
            eq(goals.archived, false),
            inArray(goals.periodKey, keys),
          ),
        ),
    { timeoutMs: [...READ_BUDGET], label: "goals.getReviewBundle" },
  );
  return { fyStartYear, goals: rows as Goal[] };
}

export interface WeekCommitState {
  weekStart: string;
  total: number;
  committed: number;
  allCommitted: boolean;
}

/**
 * Whether an employee has committed (frozen) their week. `total` = adopted,
 * non-archived weekly goals for the week; `committed` = those with a
 * `committed_at` stamp. `allCommitted` requires ≥1 goal AND every one frozen.
 */
export async function getWeekCommitState(
  employeeId: string,
  weekStart: string,
): Promise<WeekCommitState> {
  const rows = await withRetry(
    () =>
      db
        .select({ committedAt: weeklyGoals.committedAt })
        .from(weeklyGoals)
        .where(
          and(
            eq(weeklyGoals.employeeId, employeeId),
            eq(weeklyGoals.weekStart, weekStart),
            eq(weeklyGoals.archived, false),
            eq(weeklyGoals.adopted, true),
          ),
        ),
    { timeoutMs: [...READ_BUDGET], label: "goals.getWeekCommitState" },
  );
  const total = rows.length;
  const committed = rows.filter((r) => r.committedAt != null).length;
  return { weekStart, total, committed, allCommitted: total > 0 && committed === total };
}

export interface ApproveMemberState {
  employeeId: string;
  total: number;
  approved: number;
  allApproved: boolean;
}
export interface ManagerApproveState {
  weekStart: string;
  members: ApproveMemberState[];
  /** True when every downline member with goals is fully approved. */
  allApproved: boolean;
}

/**
 * Per-downline-member approval state for a manager's Monday gate. One grouped
 * read over the downline's weekly goals for `weekStart`.
 */
export async function getManagerApproveState(
  managerId: string,
  weekStart: string,
): Promise<ManagerApproveState> {
  const downline = await getDownlineIds(managerId);
  if (downline.length === 0) {
    return { weekStart, members: [], allApproved: true };
  }
  const rows = await withRetry(
    () =>
      db
        .select({
          employeeId: weeklyGoals.employeeId,
          total: sql<number>`count(*)::int`,
          approved: sql<number>`count(*) filter (where ${weeklyGoals.approvedByManagerAt} is not null)::int`,
        })
        .from(weeklyGoals)
        .where(
          and(
            eq(weeklyGoals.weekStart, weekStart),
            eq(weeklyGoals.archived, false),
            eq(weeklyGoals.adopted, true),
            inArray(weeklyGoals.employeeId, downline),
          ),
        )
        .groupBy(weeklyGoals.employeeId),
    { timeoutMs: [...READ_BUDGET], label: "goals.getManagerApproveState" },
  );
  const members: ApproveMemberState[] = rows.map((r) => ({
    employeeId: r.employeeId,
    total: Number(r.total),
    approved: Number(r.approved),
    allApproved: Number(r.total) > 0 && Number(r.approved) === Number(r.total),
  }));
  return {
    weekStart,
    members,
    allApproved: members.every((m) => m.allApproved),
  };
}

export interface GoalsDashboard {
  weekStart: string;
  /** Weight-aware effective score for the current week (0..100). */
  weekScore: number;
  /** Simple average effective % across all non-archived weekly goals this FY. */
  ytdWeeklyAvg: number;
  weeklyGoalCount: number;
  cascadeGoalCount: number;
}

/**
 * Headline rollups for the goals dashboard / PDF. Kept lightweight (the review
 * UI + PDF slices layer richer analytics on top). Effective % reuses the weekly
 * engine's coalesce(accept_pct, pct_done).
 */
export async function getDashboard(employeeId: string, fyStartYear: number): Promise<GoalsDashboard> {
  const weekStart = currentWeekStart();
  const [weekRows, ytdRows, cascadeCount] = await withRetry(
    () =>
      Promise.all([
        db
          .select({
            acceptPct: weeklyGoals.acceptPct,
            pctDone: weeklyGoals.pctDone,
            weight: weeklyGoals.weight,
          })
          .from(weeklyGoals)
          .where(
            and(
              eq(weeklyGoals.employeeId, employeeId),
              eq(weeklyGoals.weekStart, weekStart),
              eq(weeklyGoals.archived, false),
            ),
          ),
        db
          .select({ acceptPct: weeklyGoals.acceptPct, pctDone: weeklyGoals.pctDone })
          .from(weeklyGoals)
          .where(
            and(eq(weeklyGoals.employeeId, employeeId), eq(weeklyGoals.archived, false)),
          ),
        db
          .select({ n: sql<number>`count(*)::int` })
          .from(goals)
          .where(and(eq(goals.employeeId, employeeId), eq(goals.archived, false))),
      ]),
    { timeoutMs: [...READ_BUDGET], label: "goals.getDashboard" },
  );

  const weekScore = weeklyScore(
    weekRows.map((r) => ({ acceptPct: r.acceptPct, pctDone: r.pctDone, weight: r.weight })),
  );
  const ytdWeeklyAvg = ytdRows.length
    ? Math.round(
        ytdRows.reduce((s, r) => s + effectivePct({ acceptPct: r.acceptPct, pctDone: r.pctDone }), 0) /
          ytdRows.length,
      )
    : 0;

  return {
    weekStart,
    weekScore,
    ytdWeeklyAvg,
    weeklyGoalCount: ytdRows.length,
    cascadeGoalCount: Number(cascadeCount[0]?.n ?? 0),
  };
}
