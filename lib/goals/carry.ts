import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { goals } from "@/db/schema";

/**
 * Move-unfinished-forward for cascade goals (design §4). Verified best practice
 * (Perdoo) = **CLONE forward**, not move: the origin stays put (footprint
 * preserved, no double-count) and a fresh row is created in the target period
 * with `cloned_from_id` = origin. Progress resets to 0% unless `retainProgress`.
 * `moveTo` is the rare, destructive alternative (re-timeframe in place).
 *
 * These operate on the year/quarter/month `goals` table. Weekly carry-over keeps
 * using the existing `weekly_goals.carried_from_id` chain in the weekly engine.
 */

export interface CloneForwardOptions {
  /** Copy actual_qty / actual_amount / pct_done onto the clone (default: reset). */
  retainProgress?: boolean;
  /** Who initiated the carry (created_by_id on the clone). */
  actorId?: string | null;
}

/**
 * Clone `goalId` into `targetPeriodKey` (same level). Returns the new row id.
 * The clone is standalone (`parent_goal_id = null`) so it never double-attaches
 * under the origin's parent; re-link it from the cascade UI if desired.
 */
export async function cloneForward(
  goalId: string,
  targetPeriodKey: string,
  opts: CloneForwardOptions = {},
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const [origin] = await db.select().from(goals).where(eq(goals.id, goalId)).limit(1);
  if (!origin) return { ok: false, error: "Goal not found" };

  const retain = opts.retainProgress === true;
  const [row] = await db
    .insert(goals)
    .values({
      employeeId: origin.employeeId,
      period: origin.period,
      periodKey: targetPeriodKey,
      parentGoalId: null,
      position: origin.position,
      area: origin.area,
      title: origin.title,
      uom: origin.uom,
      targetQty: origin.targetQty,
      targetAmount: origin.targetAmount,
      actualQty: retain ? origin.actualQty : null,
      actualAmount: retain ? origin.actualAmount : null,
      notes: origin.notes,
      teamInvolved: origin.teamInvolved,
      teamDependencyPct: origin.teamDependencyPct,
      pctDone: retain ? origin.pctDone : 0,
      acceptPct: null,
      reviewNotes: null,
      evidenceUrl: null,
      weight: origin.weight,
      status: retain ? origin.status : "not_started",
      adopted: true,
      source: origin.source,
      clonedFromId: origin.id,
      createdById: opts.actorId ?? origin.createdById,
    })
    .returning({ id: goals.id });

  return { ok: true, id: row!.id };
}

/**
 * Re-timeframe a goal in place (destructive): change its `period_key` to the
 * target and detach it from its parent. For goals not worked at all in their
 * period — removes it from the origin period entirely.
 */
export async function moveTo(
  goalId: string,
  targetPeriodKey: string,
  actorId?: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const [origin] = await db.select().from(goals).where(eq(goals.id, goalId)).limit(1);
  if (!origin) return { ok: false, error: "Goal not found" };
  await db
    .update(goals)
    .set({
      periodKey: targetPeriodKey,
      parentGoalId: null,
      updatedById: actorId ?? origin.updatedById,
      updatedAt: new Date(),
    })
    .where(eq(goals.id, goalId));
  return { ok: true };
}
