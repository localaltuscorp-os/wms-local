import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { goals, weeklyGoals } from "@/db/schema";
import {
  quartersOfFy,
  monthKeysOfQuarter,
  fyStartYearOfKey,
  quarterOfKey,
  fyStartYearOfMonthKey,
} from "./types";
import { weeksOfMonth, weeksInMonth } from "./fy-calendar";
import {
  parseNum,
  toMoney,
  divideYearToQuarter,
  divideQuarterToMonth,
  divideMonthToWeek,
} from "./cascade-math";

/**
 * Cascade engine (Y→Q→M→W) — the roll-down + adopt/drop core.
 *
 * Auto-divide is 15Five's equal-default-editable model: seed the child target,
 * then let the user freely edit it. Quarter = Year ÷ 4, Month = Quarter ÷ 3,
 * Week = Month ÷ (that month's actual week count, 4 or 5). Applied to BOTH
 * target_qty and target_amount. Generation is **idempotent** (keyed on
 * parent_goal_id / month_goal_id) so re-running never duplicates.
 *
 * The pure dividers + numeric marshalling now live in `./cascade-math` (design
 * §3.1) so the client derive layer (`lib/goals/derive.ts`) shares the exact same
 * rounding. Re-exported here so server callers keep their import path.
 */
export {
  parseNum,
  toMoney,
  round2,
  divideYearToQuarter,
  divideQuarterToMonth,
  divideMonthToWeek,
} from "./cascade-math";

export interface GenerateResult {
  /** How many NEW child rows were created (0 when already fully generated). */
  created: number;
  /** The child level generated ('quarter' | 'month' | 'week'), or null if none. */
  childLevel: "quarter" | "month" | "week" | null;
}

/**
 * Generate (or top-up) the cascade children of a goal. Idempotent — only creates
 * children that don't already exist under this parent.
 *   year    → 4 quarter goals
 *   quarter → 3 month goals
 *   month   → the month's weekly_goals rows (into weekly_goals, month_goal_id set)
 * Children are `source='cascade'`, `adopted=true`, with divided targets, and
 * inherit the parent's area / uom / title.
 */
export async function generateChildren(goalId: string): Promise<GenerateResult> {
  const [parent] = await db.select().from(goals).where(eq(goals.id, goalId)).limit(1);
  if (!parent) return { created: 0, childLevel: null };

  const parentQty = parseNum(parent.targetQty);
  const parentAmt = parseNum(parent.targetAmount);

  if (parent.period === "year") {
    const fyStartYear = fyStartYearOfKey(parent.periodKey);
    const childKeys = quartersOfFy(fyStartYear);
    const existing = await db
      .select({ periodKey: goals.periodKey })
      .from(goals)
      .where(and(eq(goals.parentGoalId, goalId), eq(goals.period, "quarter")));
    const have = new Set(existing.map((r) => r.periodKey));
    const qty = toMoney(divideYearToQuarter(parentQty));
    const amt = toMoney(divideYearToQuarter(parentAmt));
    const rows = childKeys
      .filter((k) => !have.has(k))
      .map((periodKey, i) => ({
        employeeId: parent.employeeId,
        period: "quarter",
        periodKey,
        parentGoalId: goalId,
        position: i + 1,
        area: parent.area,
        title: parent.title,
        uom: parent.uom,
        // Carry the parent's classification down so a split quarter keeps the
        // yearly goal's type/category and space (was dropped → children fell
        // back to the 'goal' default and lost the parent's Goal Type).
        category: parent.category,
        goalType: parent.goalType,
        scope: parent.scope,
        targetQty: qty,
        targetAmount: amt,
        weight: parent.weight,
        adopted: true,
        source: "cascade",
        createdById: parent.createdById,
      }));
    if (rows.length) await db.insert(goals).values(rows);
    return { created: rows.length, childLevel: "quarter" };
  }

  if (parent.period === "quarter") {
    const fyStartYear = fyStartYearOfKey(parent.periodKey);
    const quarter = quarterOfKey(parent.periodKey);
    const childKeys = monthKeysOfQuarter(fyStartYear, quarter);
    const existing = await db
      .select({ periodKey: goals.periodKey })
      .from(goals)
      .where(and(eq(goals.parentGoalId, goalId), eq(goals.period, "month")));
    const have = new Set(existing.map((r) => r.periodKey));
    const qty = toMoney(divideQuarterToMonth(parentQty));
    const amt = toMoney(divideQuarterToMonth(parentAmt));
    const rows = childKeys
      .filter((k) => !have.has(k))
      .map((periodKey, i) => ({
        employeeId: parent.employeeId,
        period: "month",
        periodKey,
        parentGoalId: goalId,
        position: i + 1,
        area: parent.area,
        title: parent.title,
        uom: parent.uom,
        category: parent.category,
        goalType: parent.goalType,
        scope: parent.scope,
        targetQty: qty,
        targetAmount: amt,
        weight: parent.weight,
        adopted: true,
        source: "cascade",
        createdById: parent.createdById,
      }));
    if (rows.length) await db.insert(goals).values(rows);
    return { created: rows.length, childLevel: "month" };
  }

  if (parent.period === "month") {
    // Month → weekly_goals rows for each week the month owns (Monday-in-month).
    const fyStartYear = fyStartYearOfMonthKey(parent.periodKey);
    const monthIndex = Number(parent.periodKey.slice(5, 7)) - 1;
    const weeks = weeksOfMonth(fyStartYear, monthIndex);
    const weekCount = weeksInMonth(fyStartYear, monthIndex);
    const existing = await db
      .select({ weekStart: weeklyGoals.weekStart })
      .from(weeklyGoals)
      .where(eq(weeklyGoals.monthGoalId, goalId));
    const have = new Set(existing.map((r) => String(r.weekStart)));
    const qty = toMoney(divideMonthToWeek(parentQty, weekCount));
    const amt = toMoney(divideMonthToWeek(parentAmt, weekCount));
    // One next position for the owner across the target weeks is impractical
    // (positions are per week); default to 1 and let the weekly board renumber.
    const rows = weeks
      .filter((w) => !have.has(w.mondayISO))
      .map((w) => ({
        employeeId: parent.employeeId,
        weekStart: w.mondayISO,
        monthGoalId: goalId,
        subject: parent.title,
        targetDone: parent.title,
        area: parent.area,
        uom: parent.uom,
        targetQty: qty,
        targetAmount: amt,
        notes: parent.notes,
        adopted: true,
        createdById: parent.createdById,
      }));
    if (rows.length) await db.insert(weeklyGoals).values(rows);
    return { created: rows.length, childLevel: "week" };
  }

  return { created: 0, childLevel: null };
}

/** Every descendant goal id below `rootId` (recursive over parent_goal_id). */
async function descendantGoalIds(rootId: string): Promise<string[]> {
  const rows = (await db.execute(sql`
    WITH RECURSIVE sub AS (
      SELECT id FROM goals WHERE parent_goal_id = ${rootId}
      UNION
      SELECT g.id FROM goals g INNER JOIN sub s ON g.parent_goal_id = s.id
    )
    SELECT id FROM sub
  `)) as unknown as Array<{ id: string }>;
  return rows.map((r) => r.id);
}

/**
 * Adopt / drop a goal and MIRROR the flag down its whole subtree (cascade-drop):
 * crossing out a parent (`adopted=false`) drops every descendant goal AND the
 * weekly_goals rows hung off any month node in the subtree; re-adopting
 * (`adopted=true`) re-includes them. Rows are preserved (never deleted) so
 * history/audit survives (design §3).
 *
 * Returns every mutated GOAL id (root + descendants) so callers can re-read
 * the whole subtree and return it through the rows-reconcile path (bug #22).
 */
export async function setAdopted(goalId: string, adopted: boolean): Promise<string[]> {
  const descendants = await descendantGoalIds(goalId);
  const ids = [goalId, ...descendants];
  const now = new Date();
  await db.update(goals).set({ adopted, updatedAt: now }).where(inArray(goals.id, ids));
  // Weekly leaves are keyed by month_goal_id; any month node in the subtree
  // (or the goal itself, when it is a month) may own weekly rows.
  await db
    .update(weeklyGoals)
    .set({ adopted, updatedAt: now })
    .where(inArray(weeklyGoals.monthGoalId, ids));
  return ids;
}
