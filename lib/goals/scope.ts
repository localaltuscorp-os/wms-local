import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { goals } from "@/db/schema";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { goalScopeFor, getDownlineIds, canManageGoalFor } from "@/lib/weekly-goals/hierarchy";
import { goalPolicy, type GoalPolicy } from "@/lib/goals/policy";

/**
 * Permission scope for the Goals Cascade — the SAME org-chart model as weekly
 * goals, reused verbatim. `goalScopeFor(me)` → admin sees everyone, everyone
 * else sees self + full recursive downline. Re-exported so cascade actions/reads
 * import from one place and stay in lock-step with the weekly engine.
 */
export { goalScopeFor, getDownlineIds, canManageGoalFor };

/**
 * Phase 2 (Option A) — resolve the viewer's `GoalPolicy` over a goal OWNER,
 * server-side (the source of truth the actions consult). One scope query at
 * most (admins short-circuit; goalScopeFor is I/O-free for them anyway).
 */
export async function goalPolicyFor(
  me: { id: string; isAdmin: boolean },
  ownerEmployeeId: string,
): Promise<GoalPolicy> {
  const isOwner = ownerEmployeeId === me.id;
  const isManagerOfOwner =
    !isOwner &&
    (me.isAdmin || canManageGoalFor(await goalScopeFor(me), ownerEmployeeId));
  return goalPolicy({ isAdmin: me.isAdmin, isManagerOfOwner, isOwner });
}

type LoadResult =
  | { ok: false; error: string }
  | { ok: true; row: typeof goals.$inferSelect };

/**
 * Fetch a cascade goal + decide whether the signed-in user may WRITE it.
 * Owners (the goal's employee), admins, and managers (any goal owned by someone
 * in their full downline) may edit; nobody else. Mirrors weekly `loadWritableGoal`.
 */
export async function loadWritableGoalRow(
  id: string,
  me: { id: string; isAdmin: boolean },
): Promise<LoadResult> {
  const [row] = await db.select().from(goals).where(eq(goals.id, id)).limit(1);
  if (!row) return { ok: false, error: "Goal not found" };
  if (me.isAdmin || row.employeeId === me.id) return { ok: true, row };
  const scope = await goalScopeFor(me);
  if (scope.ids.includes(row.employeeId)) return { ok: true, row };
  return { ok: false, error: "You can only edit your own goals" };
}

/**
 * Load a cascade goal and require the signed-in user is a MANAGER of it — i.e.
 * the owner is NOT themselves AND they have authority over that owner (admin /
 * super-admin org-wide, or the owner is in their downline). A person is NEVER a
 * manager of their own goal. The gate for privileged writes (review/accept,
 * approve, delete, fill-on-behalf). Mirrors weekly `loadManageableGoal`.
 */
export async function loadManageableGoalRow(
  id: string,
  me: { id: string; isAdmin: boolean; email: string },
): Promise<LoadResult> {
  const [row] = await db.select().from(goals).where(eq(goals.id, id)).limit(1);
  if (!row) return { ok: false, error: "Goal not found" };
  const scope = await goalScopeFor(me);
  const isManager =
    me.isAdmin ||
    isSuperAdmin(me.email) ||
    (row.employeeId !== me.id && scope.ids.includes(row.employeeId));
  if (!isManager) return { ok: false, error: "Only a manager or admin can do that" };
  return { ok: true, row };
}
