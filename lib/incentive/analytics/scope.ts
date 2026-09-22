import "server-only";
import { canReviewIncentives } from "@/lib/auth/incentive-permissions";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { getDownlineIds } from "@/lib/weekly-goals/hierarchy";
import type { AnalyticsScope, AnalyticsView } from "./model";

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

/**
 * APPLY THE DASHBOARD'S Team / User SWITCH to an already-resolved scope.
 *
 * This is the ONLY place the view is honoured, and the only place that decides
 * whether the switcher appears at all.
 *
 * ── WHY A BROWSER-SUPPLIED VIEW IS SAFE HERE ──────────────────────────────
 * The action's doc says the browser "sends a period and nothing else" because
 * there was no parameter that could widen the answer. The view does not change
 * that, and the reason is structural rather than a check that could be
 * forgotten: `team` returns the scope this function was HANDED — whatever the
 * server already decided this person may see — and `user` replaces it with a
 * set containing only their own id. Neither branch can name an employee, and
 * neither can produce a scope larger than the one passed in. A crafted
 * `view: "team"` therefore buys exactly what the viewer would have got by
 * asking for nothing at all.
 *
 * ── canSeeTeam ────────────────────────────────────────────────────────────
 * Recorded BEFORE narrowing, because afterwards the scope no longer knows. A
 * company-wide viewer always has a team; anyone else has one only if their
 * downline is non-empty, which is `employeeIds` holding somebody besides
 * themselves. Someone with no reports gets no switcher — a "Team" button that
 * showed them their own figures under a second name is the empty team dashboard
 * the brief rules out.
 */
export function applyAnalyticsView(scope: AnalyticsScope, view: AnalyticsView): AnalyticsScope {
  const canSeeTeam = scope.all || scope.employeeIds.size > 1;

  // Not offered the switch → always the scope they already had. This also stops
  // `view: "user"` from being a no-op that relabels a solo viewer's dashboard.
  if (!canSeeTeam || view === "team") {
    return { ...scope, view: "team", canSeeTeam };
  }

  return {
    all: false,
    employeeIds: new Set([scope.viewerId]),
    viewerId: scope.viewerId,
    label: "You",
    view: "user",
    canSeeTeam,
  };
}
