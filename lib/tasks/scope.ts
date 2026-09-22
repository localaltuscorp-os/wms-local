import "server-only";

import type { Employee } from "@/db/schema";
import { isMasterAdmin } from "@/lib/security/capabilities";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { getCurrentEmployee } from "@/lib/auth/current";
import { grantedExtrasLabel, permittedPeopleFor } from "@/lib/access/visibility";
import type { TaskListFilters } from "@/lib/types";

/**
 * WHO MAY SEE WHOSE TASKS.
 *
 * ── THE RULE ───────────────────────────────────────────────────────────────
 * Everyone — admin, team leader, ordinary employee — sees THEIR OWN tasks by
 * default. Selecting "All" on the Tasks filter widens that to the people below
 * them in the org chart, and to nobody else. Being an admin does not widen it,
 * which is the whole point: an administrator is someone who configures the
 * system, not someone who reads everybody's work.
 *
 * Seeing beyond that requires a grant, and a grant is a row in
 * `task_view_grants` written from Admin Panel → Access Control by a master
 * admin (Manan, Rohan). Two shapes:
 *   - `target_id` NULL → the whole organisation;
 *   - `target_id` = a person → that person AND their downline.
 *
 * ── WHY HERE AND NOT IN THE PAGE ───────────────────────────────────────────
 * Enforced in the QUERY layer (lib/queries/tasks.ts), so every reader of tasks
 * inherits it — the list, the archive, the agenda, the mobile endpoints — and no
 * caller can forget. A URL parameter cannot widen it either: `?emp=<someone>`
 * is INTERSECTED with the permitted set rather than replacing it, so the only
 * way past is a grant row.
 *
 * ── FAIL-CLOSED ────────────────────────────────────────────────────────────
 * If the grants table is missing (pre-migration) or unreadable, the answer is
 * "no grants", which is the restrictive direction. The opposite default would
 * turn a transient read error into an organisation-wide leak.
 */

export interface TaskVisibility {
  /**
   * The ids whose tasks may be read. `null` means the whole organisation — the
   * only way to get it is an org-wide grant or a master-admin/super-admin
   * account (the two people who administer the system itself).
   */
  permittedIds: string[] | null;
  /** Whether "All" shows anything more than "My Tasks" for this person. */
  canExpand: boolean;
  /** The person's own id, always inside `permittedIds`. */
  selfId: string;
  /** One line naming what "All" means for them — rendered on the filter bar. */
  scopeLabel: string;
}

/** The person's permitted task visibility. */
export async function taskVisibilityFor(
  me: Pick<Employee, "id" | "email" | "isAdmin">,
): Promise<TaskVisibility> {
  // The two accounts that administer the permission system itself are not
  // scoped by it — the same reasoning as the permission matrix's exemption:
  // whoever grants the visibility must not be able to lock themselves out of
  // seeing whether a grant worked. Named in the capability registry, not here.
  if (isMasterAdmin(me.email) || isSuperAdmin(me.email)) {
    return {
      permittedIds: null,
      canExpand: true,
      selfId: me.id,
      scopeLabel: "Everyone in the organisation",
    };
  }

  // The one rule, shared with the Incentive module (lib/access/visibility.ts):
  // self + downline, plus an Access Control grant (a branch, or the whole
  // organisation). Fails closed.
  const { org, ids, grantedExtras } = await permittedPeopleFor(me.id, "tasks");
  if (org) {
    return {
      permittedIds: null,
      canExpand: true,
      selfId: me.id,
      scopeLabel: "Everyone in the organisation (granted)",
    };
  }

  const permitted = [...ids];
  return {
    permittedIds: permitted,
    canExpand: permitted.length > 1,
    selfId: me.id,
    scopeLabel:
      (permitted.length > 1 ? "You and the people below you" : "Only you") +
      grantedExtrasLabel(grantedExtras),
  };
}

/**
 * The visibility of the CURRENT request, or null when there is no signed-in
 * employee (a cron job, a seed script, a system read). A null scope means
 * "unenforced" — those callers are not reading on anybody's behalf, and
 * inventing a refusal for them would break scheduled mail, not protect anyone.
 */
export async function currentTaskVisibility(): Promise<TaskVisibility | null> {
  const me = await getCurrentEmployee();
  if (!me) return null;
  return taskVisibilityFor(me);
}

/**
 * Apply the ceiling to a filter set.
 *
 * The requested assignee filter is INTERSECTED with the permitted set — never
 * widened by it, and never replaced by it. So `?emp=<a stranger>` returns
 * nothing rather than their tasks, and `?emp=all` returns exactly the permitted
 * set, while "My Tasks" still means "assigned to me".
 */
export function applyTaskScope(
  filters: TaskListFilters,
  visibility: TaskVisibility | null,
): TaskListFilters {
  if (!visibility || visibility.permittedIds === null) return filters;

  const permitted = visibility.permittedIds;
  const permittedSet = new Set(permitted);
  const requested = filters.doerIds.filter((id) => permittedSet.has(id));

  return {
    ...filters,
    doerIds: requested,
    visibleDoerIds: permitted,
    // An explicit assignee selection that survives the ceiling narrows within
    // it; one that lies entirely outside must match NOTHING rather than fall
    // back to the permitted set — otherwise asking for a stranger would
    // silently answer with your own team and look like it worked.
    assigneeOutsideScope: filters.doerIds.length > 0 && requested.length === 0,
  };
}

/** Used by the Admin Panel screen: the roster a grant may target. Re-exported
 *  so the screen has one import for the whole feature. */
export { listGrantableEmployees } from "@/lib/access/visibility";
