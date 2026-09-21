"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { goals, weeklyGoals } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import { logDbError, dbErrorMessage } from "@/lib/db/error";
import { goalScopeFor, canManageGoalFor } from "@/lib/goals/scope";
import {
  canSetInitiatorStatus,
  effectiveInitiatorStatus,
  initiatorWrite,
  isInitiatorStatus,
  type InitiatorStatus,
} from "@/lib/status/axes";

/**
 * GOALS — the INITIATOR AXIS (migration 0225).
 *
 * Goals had no such axis before: a goal carried a doer status and an `archived`
 * flag, and the only ruling anyone could make on it was the Monday approve gate
 * (`/goals/approve`), which is a commitment ritual bound to a week rather than a
 * standing verdict. So "this goal is On Hold" was not expressible at all.
 *
 * This adds the same four every other module now has — Approved · Not Approved ·
 * On Hold · Archived — over the SAME shared vocabulary
 * (lib/status/axes.ts), so a goal on hold and a task on hold mean the same
 * thing and can be counted together.
 *
 * ONE FILE FOR BOTH TABLES. `goals` (the cascade levels) and `weekly_goals` are
 * separate engines with separate actions everywhere else, and that is right —
 * they have different shapes. But the initiator axis is identical on both, and
 * two copies of one permission rule is how the doer axis drifted in the first
 * place.
 *
 * WHO COUNTS AS THE INITIATOR OF A GOAL. Not the owner: a goal is work someone
 * is being held to, and letting them approve it themselves is exactly the thing
 * the two axes exist to prevent. It is:
 *
 *   · an admin, or
 *   · whoever RAISED the goal (`goals.created_by_id`), or
 *   · a manager of the owner — the owner is in their downline and is not
 *     themselves.
 *
 * `weekly_goals` has no `created_by_id`, so there it is the admin-or-manager
 * pair. Both go through `canSetInitiatorStatus` with an assembled actor, which
 * is the same function the task board and the plan board call.
 */

type Result =
  | { ok: true; status: InitiatorStatus | null }
  | { ok: false; error: string };

async function resolveIsInitiator(
  me: { id: string; isAdmin: boolean },
  ownerId: string,
  createdById: string | null,
): Promise<boolean> {
  if (createdById && createdById === me.id) return true;
  if (ownerId === me.id) return false; // never your own initiator
  if (me.isAdmin) return true;
  return canManageGoalFor(await goalScopeFor(me), ownerId);
}

/** Cascade goals (Yearly / Quarterly / Monthly). */
export async function setGoalInitiatorStatus(
  goalId: string,
  next: string,
): Promise<Result> {
  if (!isInitiatorStatus(next)) {
    return { ok: false, error: `"${next}" is not an initiator status.` };
  }
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, error: limited.error };

  const [row] = await db
    .select({
      id: goals.id,
      employeeId: goals.employeeId,
      createdById: goals.createdById,
      approvalStatus: goals.approvalStatus,
      archivedAt: goals.archivedAt,
    })
    .from(goals)
    .where(eq(goals.id, goalId))
    .limit(1);
  if (!row) return { ok: false, error: "Goal not found." };

  const allowed = canSetInitiatorStatus(
    {
      id: me.id,
      isAdmin: me.isAdmin,
      isInitiator: await resolveIsInitiator(me, row.employeeId, row.createdById),
      isDoer: row.employeeId === me.id,
      isSupervisor: false,
    },
    next,
  );
  if (!allowed.ok) return { ok: false, error: allowed.reason };

  // NOTE the archive column. In this module `archived` is the soft-DELETE
  // marker behind the Recycle Bin and `archived_at` is "put away" — the axis
  // means the latter. Writing the former here would delete a goal when an
  // initiator meant to file it.
  const write = initiatorWrite(next);
  try {
    await db
      .update(goals)
      .set({
        approvalStatus: write.approvalStatus,
        archivedAt: write.archived ? (row.archivedAt ?? new Date()) : null,
        approvalById: me.id,
        approvalAt: new Date(),
        updatedById: me.id,
        updatedAt: new Date(),
      })
      .where(eq(goals.id, goalId));
  } catch (err) {
    logDbError("goals:initiator-status", err);
    return { ok: false, error: `Could not update: ${dbErrorMessage(err)}` };
  }

  revalidatePath("/goals");
  return { ok: true, status: next };
}

/** Weekly goals. */
export async function setWeeklyGoalInitiatorStatus(
  goalId: string,
  next: string,
): Promise<Result> {
  if (!isInitiatorStatus(next)) {
    return { ok: false, error: `"${next}" is not an initiator status.` };
  }
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, error: limited.error };

  const [row] = await db
    .select({
      id: weeklyGoals.id,
      employeeId: weeklyGoals.employeeId,
      approvalStatus: weeklyGoals.approvalStatus,
      archivedAt: weeklyGoals.archivedAt,
    })
    .from(weeklyGoals)
    .where(eq(weeklyGoals.id, goalId))
    .limit(1);
  if (!row) return { ok: false, error: "Goal not found." };

  const allowed = canSetInitiatorStatus(
    {
      id: me.id,
      isAdmin: me.isAdmin,
      isInitiator: await resolveIsInitiator(me, row.employeeId, null),
      isDoer: row.employeeId === me.id,
      isSupervisor: false,
    },
    next,
  );
  if (!allowed.ok) return { ok: false, error: allowed.reason };

  const write = initiatorWrite(next);
  try {
    await db
      .update(weeklyGoals)
      .set({
        approvalStatus: write.approvalStatus,
        archivedAt: write.archived ? (row.archivedAt ?? new Date()) : null,
        approvalById: me.id,
        approvalAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(weeklyGoals.id, goalId));
  } catch (err) {
    logDbError("weekly-goals:initiator-status", err);
    return { ok: false, error: `Could not update: ${dbErrorMessage(err)}` };
  }

  revalidatePath("/weekly-goals");
  revalidatePath("/goals/weekly");
  return { ok: true, status: next };
}

/** Read-back helper so a caller can render the effective value without
 *  duplicating the archived-outranks-verdict rule. */
export async function currentGoalInitiatorStatus(
  goalId: string,
): Promise<InitiatorStatus | null> {
  const [row] = await db
    .select({ approvalStatus: goals.approvalStatus, archivedAt: goals.archivedAt })
    .from(goals)
    .where(eq(goals.id, goalId))
    .limit(1);
  if (!row) return null;
  return effectiveInitiatorStatus(row.approvalStatus, row.archivedAt != null);
}
