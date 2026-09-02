import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";

/**
 * The Productivity Dashboard's access layer (§19, §23).
 *
 * §23 is explicit that authorisation must be enforced at the DATA layer, not
 * just visually — a manager must not reach an unrelated employee by editing a
 * URL, changing an id, or defeating a client-side filter. So every surface in
 * the module resolves who it may look at THROUGH here, and never trusts a
 * request parameter on its own.
 *
 * The rules:
 *   • Employee — self only. No Team Performance, no other dashboards.
 *   • Manager  — self, plus DIRECT REPORTS only. Note this is `manager_id = me`,
 *     deliberately narrower than the product's `getDownlineIds` transitive
 *     walk: §21 and §23 both say "report directly to them", so a skip-level
 *     report is out of scope for this module even though Goals shows them.
 *   • Admin    — everyone (§19).
 */

export interface ProductivityViewer {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
  /** True when at least one active employee reports directly to this person.
   *  Drives the Manager section (§18) and Team Performance access (§21). */
  isManager: boolean;
}

/** Ids of the ACTIVE employees reporting directly to `managerId`. */
export async function directReportIds(managerId: string): Promise<string[]> {
  const rows = await db
    .select({ id: employees.id })
    .from(employees)
    .where(and(eq(employees.managerId, managerId), eq(employees.isActive, true)));
  return rows.map((r) => r.id);
}

/**
 * Resolve the signed-in viewer plus their manager status.
 *
 * "Manager" is DERIVED from the hierarchy — someone is a manager because people
 * report to them, never because of a role flag. §20 calls this out directly: an
 * Admin who happens to have reports gets the Manager section through exactly the
 * same rule as anyone else, with nothing hard-coded for Admin.
 */
export async function getProductivityViewer(): Promise<ProductivityViewer> {
  const me = await requireUser();
  const reports = await directReportIds(me.id);
  return {
    id: me.id,
    name: me.name,
    email: me.email,
    isAdmin: Boolean(me.isAdmin) || isSuperAdmin(me.email),
    isManager: reports.length > 0,
  };
}

/**
 * May `viewer` open `targetId`'s dashboard? The single gate for every drill-down
 * (§22) and for the `?emp=` parameter.
 *
 * Returns a boolean rather than throwing so the caller chooses the response —
 * pages 404, actions return an error. A refusal never distinguishes "no such
 * employee" from "not yours": that difference would let a manager enumerate the
 * org chart by trying ids.
 */
export async function canViewProductivityOf(
  viewer: ProductivityViewer,
  targetId: string,
): Promise<boolean> {
  if (targetId === viewer.id) return true;
  if (viewer.isAdmin) return true;
  if (!viewer.isManager) return false;
  const reports = await directReportIds(viewer.id);
  return reports.includes(targetId);
}

/**
 * The employees whose dashboards `viewer` may open — the Team Performance
 * population (§21).
 *
 * Admin gets every active employee; a manager gets their direct reports; an
 * employee gets an empty list, which is what makes Team Performance
 * inaccessible to them rather than merely hidden.
 */
export async function productivityScopeFor(
  viewer: ProductivityViewer,
): Promise<{ id: string; name: string }[]> {
  if (viewer.isAdmin) {
    const rows = await db
      .select({ id: employees.id, name: employees.name })
      .from(employees)
      .where(eq(employees.isActive, true))
      .orderBy(employees.name);
    return rows;
  }
  if (!viewer.isManager) return [];

  const ids = await directReportIds(viewer.id);
  if (ids.length === 0) return [];
  const rows = await db
    .select({ id: employees.id, name: employees.name })
    .from(employees)
    .where(inArray(employees.id, ids))
    .orderBy(employees.name);
  return rows;
}
