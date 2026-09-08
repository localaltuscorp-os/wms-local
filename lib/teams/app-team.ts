/**
 * THE APP / NON-APP SPLIT — one definition, shared by every section that
 * offers the toggle.
 *
 * Lifted out of components/dashboard/aging-heatmap.tsx when Overdue Tasks by
 * Person grew the same three-tab control. Two copies of this predicate is the
 * bug the aging heatmap's own comments keep warning about: the day someone
 * adds "App Support" to one list and not the other, the two sections disagree
 * about who is on which team while both look correct.
 */

/** The three mutually exclusive views of a per-person list. */
export type TeamView = "all" | "app" | "nonApp";

/**
 * Which departments count as the App side of the board.
 *
 * Matched on a word starting "app" rather than an exact allow-list, so the two
 * areas that already exist — "App Devp" and "BSS App" — both land left without
 * being named here, and a later "App Support" does too. An exact list would
 * silently drop anyone in a department nobody remembered to add.
 *
 * Employees with NO department fall to Non-App. That is the deliberate default:
 * Non-App is the larger, catch-all side, and an unset department is far more
 * likely to be an ops hire nobody has filed than a developer.
 */
export function isAppDepartment(department: string | null): boolean {
  return department != null && /\bapp/i.test(department);
}

/**
 * The labels for the three views, so a section cannot relabel a tab locally.
 * Status by Doer used to run a different bar entirely — six department buckets
 * — which meant "App Team" named one set of people there and another set two
 * sections up the same page.
 */
export const TEAM_VIEW_LABELS: Record<TeamView, string> = {
  all: "All Employees",
  app: "App Team",
  nonApp: "Non-App Team",
};

/**
 * True when ANY of the person's departments is an App department.
 *
 * ANY-of, because a person can hold several: somebody in both Apps and HR is on
 * the App team for this toggle. Demanding every department match would drop
 * multi-department people out of both tabs, so they would appear under All
 * Employees and nowhere else — the two tabs would stop summing to the roster.
 *
 * Accepts the single legacy `department` string as well as the structured list,
 * because the sections feeding this are on both shapes.
 */
export function isAppEmployee(departments: string | readonly (string | null)[] | null): boolean {
  if (departments == null) return false;
  const list = Array.isArray(departments) ? departments : [departments as string];
  return list.some((d) => isAppDepartment(d ?? null));
}

/**
 * Does this person belong under `view`? The single membership rule behind every
 * team toggle on the dashboard.
 *
 * The two tabs PARTITION the roster: `nonApp` is the exact complement of `app`,
 * so the counts always sum to All. That is what makes "Others" impossible here
 * and unnecessary — there is nobody the two tabs do not already hold. People
 * with no department land in Non-App, per isAppDepartment's default.
 */
export function inTeamView(
  departments: string | readonly (string | null)[] | null,
  view: TeamView,
): boolean {
  if (view === "all") return true;
  const isApp = isAppEmployee(departments);
  return view === "app" ? isApp : !isApp;
}
