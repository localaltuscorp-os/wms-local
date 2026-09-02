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
