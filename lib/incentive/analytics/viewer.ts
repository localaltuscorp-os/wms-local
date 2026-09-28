/**
 * INCENTIVE DASHBOARD — VIEWING SOMEBODY ELSE.
 *
 * Pure and client-safe (no DB, no I/O). Turns a URL parameter into a scope, and
 * a scope into the list of people a picker may offer.
 *
 * ── WHY THIS IS A NARROWING AND NOT A NEW SCOPE SYSTEM ─────────────────────
 * `incentiveAnalyticsScopeFor` (./scope.ts) already answers the only question
 * that matters — "who may this person see?" — on the server, from the session,
 * with no input from the browser. This module sits strictly BEHIND it: the
 * parameter can only ever select one person OUT OF the set the server already
 * granted. It cannot add anybody, and it cannot widen a single figure.
 *
 * ── THE FAILURE DIRECTION ──────────────────────────────────────────────────
 * An id that is not in the permitted set does not narrow to nothing and does
 * not error the page: `narrowToEmployee` is only ever called after
 * `canViewEmployee` has said yes, and callers that skip that check get `null`
 * back rather than a scope. A crafted `?emp=` therefore degrades to the viewer's
 * own dashboard, which is what they would have seen by asking for nothing.
 */

import type { AnalyticsScope } from "./model";

/**
 * The URL parameter naming the employee being viewed.
 *
 * A short key because it rides in shared links — a manager pasting a link to
 * somebody's dashboard is the point of the feature, and `?emp=` survives being
 * read aloud.
 */
export const VIEW_EMPLOYEE_PARAM = "emp";

/** The shape every picker feeds on and every server list returns. */
export interface ViewableEmployee {
  id: string;
  name: string;
}

/**
 * May this scope look at `employeeId` at all?
 *
 * `scope.all` is the company-wide case — the reviewer and the super-admins, and
 * anybody Admin Panel → Access Control has granted the organisation to. It
 * carries an EMPTY `employeeIds`, so the two branches cannot be collapsed: for
 * them every real employee is permitted, and for everybody else only the ids in
 * the set are.
 */
export function canViewEmployee(
  scope: Pick<AnalyticsScope, "all" | "employeeIds">,
  employeeId: string | null | undefined,
): boolean {
  if (!employeeId) return false;
  return scope.all || scope.employeeIds.has(employeeId);
}

/**
 * Narrow a resolved scope to ONE person, or null when they are not permitted.
 *
 * ── WHY `ctcUnrestricted` IS CARRIED ACROSS ────────────────────────────────
 * The engine marks a person's CTC `restricted` when the scope is not
 * company-wide and the row is not the viewer's own (see `buildIncentiveAnalytics`
 * in ./model.ts) — the rule that stops a team lead reading their reports' pay.
 * Selecting one person OUT of a company-wide scope is not that situation: the
 * viewer was already entitled to every CTC on the page, and narrowing the view
 * to one of them must not take that away. So the entitlement travels with the
 * narrowing rather than being re-derived from the narrowed shape, and the engine
 * keeps the CTC visible for exactly the viewers who had it.
 *
 * A viewer who did NOT have it — a manager, a granted branch — keeps the
 * restriction, unchanged.
 */
export function narrowToEmployee(
  scope: AnalyticsScope,
  employeeId: string,
  employeeName: string,
): AnalyticsScope | null {
  if (!canViewEmployee(scope, employeeId)) return null;
  return {
    all: false,
    employeeIds: new Set([employeeId]),
    viewerId: scope.viewerId,
    label: employeeName,
    view: "team",
    canSeeTeam: scope.canSeeTeam ?? false,
    ctcUnrestricted: scope.all,
  };
}

/**
 * The people a picker may offer, given the scope the server resolved.
 *
 * SELF FIRST, then alphabetical. Looking at your own dashboard is the common
 * case, so it is the one row that never moves; everything else is a colleague
 * whose position in an alphabetical list a reader can predict.
 *
 * A company-wide scope carries no id list, so it is handed the full roster by
 * the caller (lib/queries/incentive-viewable-people.ts) and this function only
 * orders it. A scoped viewer is filtered to the ids the server granted — the
 * filter is here rather than in the query so a caller cannot forget it.
 */
export function viewablePeople(
  scope: Pick<AnalyticsScope, "all" | "employeeIds" | "viewerId">,
  roster: readonly ViewableEmployee[],
): ViewableEmployee[] {
  const permitted = roster.filter((p) => canViewEmployee(scope, p.id));
  const self = permitted.find((p) => p.id === scope.viewerId);
  const others = permitted
    .filter((p) => p.id !== scope.viewerId)
    .sort((a, b) => a.name.localeCompare(b.name));
  return self ? [self, ...others] : others;
}

/**
 * Does this viewer get a picker at all?
 *
 * Only when there is somebody else to look at. A picker holding one row is a
 * control that cannot do anything, and for an ordinary employee the brief is
 * explicit that it must not be drawn — their page simply names them.
 */
export function hasViewableOthers(people: readonly ViewableEmployee[], viewerId: string): boolean {
  return people.some((p) => p.id !== viewerId);
}

/** The display name for a viewed employee, or the viewer's own when none resolves. */
export function viewedEmployeeName(
  people: readonly ViewableEmployee[],
  selectedId: string,
  viewerName: string,
): string {
  if (selectedId && selectedId !== "") {
    const found = people.find((p) => p.id === selectedId);
    if (found) return found.name;
  }
  return viewerName;
}

/**
 * The page title. The brief's own form: `Incentive | <employee being viewed>`.
 *
 * One function so the browser tab, the page heading and any future surface name
 * the same person — and so "which employee is this dashboard about" is answered
 * in exactly one place.
 */
export function incentivePageTitle(employeeName: string): string {
  return `Incentive | ${employeeName}`;
}
