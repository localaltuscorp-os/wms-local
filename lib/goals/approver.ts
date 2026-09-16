import "server-only";
import { inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { goalApproverStatuses, weeklyGoalApproverStatuses } from "@/db/schema";

/**
 * Read a goal's Initiator Status (migration 0231 side tables).
 *
 * Every failure — above all the tables not existing before 0231 is applied —
 * reads as "no rulings": a status column must never take a Goals board down.
 */

export async function loadGoalApprovers(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  try {
    const rows = await db
      .select({ id: goalApproverStatuses.goalId, status: goalApproverStatuses.approvalStatus })
      .from(goalApproverStatuses)
      .where(inArray(goalApproverStatuses.goalId, ids));
    return new Map(rows.map((r) => [r.id, r.status]));
  } catch (err) {
    console.error("[goals] approver statuses unavailable", err instanceof Error ? err.message : err);
    return new Map();
  }
}

export async function loadWeeklyGoalApprovers(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  try {
    const rows = await db
      .select({ id: weeklyGoalApproverStatuses.weeklyGoalId, status: weeklyGoalApproverStatuses.approvalStatus })
      .from(weeklyGoalApproverStatuses)
      .where(inArray(weeklyGoalApproverStatuses.weeklyGoalId, ids));
    return new Map(rows.map((r) => [r.id, r.status]));
  } catch (err) {
    console.error("[goals] weekly approver statuses unavailable", err instanceof Error ? err.message : err);
    return new Map();
  }
}
