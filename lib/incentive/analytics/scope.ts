import "server-only";
import { canReviewIncentives } from "@/lib/auth/incentive-permissions";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { getDownlineIds } from "@/lib/weekly-goals/hierarchy";
import type { AnalyticsScope } from "./model";

/**
 * WHO THE INCENTIVE DASHBOARD MAY SHOW TO WHOM — resolved on the server, every
 * time, from the signed-in identity. Nothing a browser sends widens it.
 *
 *  · Company-wide — admins, the super-admin and the incentive reviewer (Manan
 *    Vasa, who already sees every incentive request).
 *  · Everyone else — themselves plus their downline: the people who report to
 *    them through `employees.manager_id`, transitively. That is the existing
 *    hierarchy rule the team boards use (`getDownlineIds`), so a team lead sees
 *    their reports and a manager sees their leads' reports too. Someone with no
 *    reports sees only themselves.
 *
 * `getDownlineIds` returns [] on any database error, so a failure narrows the
 * view to self — it never widens it.
 */
export async function incentiveAnalyticsScopeFor(me: {
  id: string;
  email: string;
  isAdmin: boolean;
}): Promise<AnalyticsScope> {
  if (me.isAdmin || isSuperAdmin(me.email) || canReviewIncentives(me.email)) {
    return { all: true, employeeIds: new Set(), viewerId: me.id, label: "Everyone" };
  }
  const downline = await getDownlineIds(me.id);
  return {
    all: false,
    employeeIds: new Set([me.id, ...downline]),
    viewerId: me.id,
    label: downline.length > 0 ? "You and your team" : "You",
  };
}
