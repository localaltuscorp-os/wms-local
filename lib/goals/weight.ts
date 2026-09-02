import "server-only";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { goals } from "@/db/schema";

/** A goal bucket's weights must total at most this. */
export const WEIGHT_CAP = 100;

/**
 * Sum of active (non-archived) goal weights in one bucket
 * (person + period + periodKey), optionally excluding one goal (for edits).
 */
export async function bucketWeightSum(
  employeeId: string,
  period: string,
  periodKey: string,
  excludeId?: string,
): Promise<number> {
  const rows = await db
    .select({ w: goals.weight })
    .from(goals)
    .where(
      and(
        eq(goals.employeeId, employeeId),
        eq(goals.period, period),
        eq(goals.periodKey, periodKey),
        eq(goals.archived, false),
        ...(excludeId ? [ne(goals.id, excludeId)] : []),
      ),
    );
  return rows.reduce((s, r) => s + (r.w ?? 0), 0);
}
