import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { ambAmbassadors, type AmbAmbassador } from "@/db/schema";
import { getDownlineIds } from "@/lib/weekly-goals/hierarchy";

/**
 * Ambassadors permission model.
 *
 * VIEW is granted to the whole Sales department + admins at the route layer
 * (`requireWorkspace("sales")`) — shared team intelligence, like People Gives.
 *
 * EDIT of a given ambassador (and its referrals/commissions/timeline) is
 * narrower: the ambassador's OWNER (the salesperson who manages the
 * relationship), that owner's MANAGERS (transitive `manager_id` upline), and
 * ADMINS. This mirrors the Weekly-Goals owner/manager/admin gate.
 */

export interface AmbActor {
  id: string;
  isAdmin: boolean;
}

export interface AmbScope {
  all: boolean;
  /** Employee ids this actor may act on behalf of (self + downline). */
  ids: string[];
}

/**
 * The edit scope for the signed-in user:
 *  - admin → { all: true }
 *  - else  → self + full downline (so a manager can edit ambassadors owned by
 *            anyone reporting to them).
 */
export async function ambScope(me: AmbActor): Promise<AmbScope> {
  if (me.isAdmin) return { all: true, ids: [] };
  const downline = await getDownlineIds(me.id);
  return { all: false, ids: [me.id, ...downline] };
}

/** Can `scope` edit an ambassador owned by `ownerId` (may be null/unowned)? */
export function canEditOwned(scope: AmbScope, ownerId: string | null): boolean {
  if (scope.all) return true;
  if (!ownerId) return false; // unowned ambassadors are admin-only to edit
  return scope.ids.includes(ownerId);
}

export type WritableResult =
  | { ok: false; error: string }
  | { ok: true; row: AmbAmbassador };

/**
 * Load an ambassador and require the signed-in user may EDIT it (owner / owner's
 * manager / admin). The single security gate for every ambassador-scoped
 * mutation — referrals, commissions, payouts, activities, documents all hang
 * off an ambassador, so they call this first.
 */
export async function loadWritableAmbassador(id: string, me: AmbActor): Promise<WritableResult> {
  const [row] = await db.select().from(ambAmbassadors).where(eq(ambAmbassadors.id, id)).limit(1);
  if (!row) return { ok: false, error: "Ambassador not found." };
  if (me.isAdmin || row.ownerId === me.id) return { ok: true, row };
  const scope = await ambScope(me);
  if (canEditOwned(scope, row.ownerId)) return { ok: true, row };
  return { ok: false, error: "You can only edit ambassadors you own or manage." };
}
