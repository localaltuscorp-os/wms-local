import "server-only";
import { redirect } from "next/navigation";
import type { Employee } from "@/db/schema";
import { requireUser, forbiddenError } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { localAllWorkspaces } from "@/lib/auth/local-session";
import { employeeDepartmentNames } from "@/lib/queries/departments";
import { canAccessWorkspace, type WorkspaceId, type WorkspaceAccessInput } from "@/lib/workspaces";
import { canShowModule } from "@/lib/permissions/resolve";

/**
 * The permission node that governs the Control Panel MODULE — not one of its
 * screens. A row that switches this off takes the whole room with it, which is
 * what "the module should not appear anywhere" means: no rail entry, no room in
 * the top bar, no card, and `/control-panel` itself refused.
 */
export const CONTROL_PANEL_NODE = "control-panel";

/**
 * The inputs `canAccessWorkspace` needs, derived from an employee row. Single
 * source of truth — used by the (app) layout, the hub, the /ws route and the
 * data-layer guards.
 *
 * Reads the employee's STRUCTURED department membership (employee_departments)
 * so department-gated rooms (Sales) honour the real org structure, not just the
 * legacy single free-text `department` field — a person assigned to Sales as one
 * of several departments now gets in. The free-text value is kept too for
 * back-compat. One small indexed lookup; called on the workspace-entry path,
 * not the heavy dashboard path.
 */
export async function accessFor(me: Employee): Promise<WorkspaceAccessInput> {
  const structured = await employeeDepartmentNames(me.id).catch(() => [] as string[]);
  const departments = me.department ? [...structured, me.department] : structured;
  // DEV_ALL_WORKSPACES reopens every room on a dev machine when the local
  // session user isn't in the needed department. Inert on any deployment
  // (localAllWorkspaces() is gated by localSessionEnabled()).
  const isSuper = isSuperAdmin(me.email) || localAllWorkspaces();

  // ── THE CONTROL PANEL'S VISIBILITY ───────────────────────────────────────
  //
  // Two conditions, ANDed, and both are needed:
  //
  //   · the BASE authorization — admin. The room was admin-only inside the
  //     Admin Panel and it stays admin-only now; the matrix can only NARROW
  //     (see the header of lib/permissions/resolve.ts), so nothing here can
  //     hand the Control Panel to somebody who could not reach it before.
  //
  //   · the MATRIX — whether this person's `control-panel` node is switched on.
  //     This is the switch the brief asks for: absent a row the matrix has no
  //     opinion and the answer is the base authorization, which is exactly how
  //     every admin saw the screen before this change. A master admin is exempt
  //     from the matrix, so the two people who administer it can never lock
  //     themselves out of it.
  //
  // FAIL-OPEN on a read error, like every other use of the matrix: a database
  // hiccup must return people to the access they had before the matrix existed,
  // not hide a module from the admins who run the company.
  const canControlPanel =
    (me.isAdmin || isSuper) && (await canShowModule(CONTROL_PANEL_NODE).catch(() => true));

  return {
    departments,
    isAdmin: me.isAdmin,
    isSuperAdmin: isSuper,
    canControlPanel,
  };
}

/**
 * Require workspace access at the DATA layer — route handlers, server actions
 * and pages inside a restricted room (e.g. Sales). The (app) layout gate does
 * NOT run for route handlers or server actions, so each data surface must guard
 * itself or the room is only cosmetically restricted. Bounces to the hub if the
 * signed-in user can't enter. Returns the employee for chaining.
 */
export async function requireWorkspace(ws: WorkspaceId): Promise<Employee> {
  const me = await requireUser();
  if (!canAccessWorkspace(ws, await accessFor(me))) {
    redirect("/hub");
  }
  return me;
}

/**
 * Like {@link requireWorkspace} but also requires admin — for management ops
 * inside a room (editing contracts, imports, write-offs in Sales). Super-admins
 * always pass. Throws "Forbidden" for a room member who isn't an admin.
 */
export async function requireWorkspaceAdmin(ws: WorkspaceId): Promise<Employee> {
  const me = await requireWorkspace(ws);
  if (!me.isAdmin && !isSuperAdmin(me.email)) {
    throw forbiddenError();
  }
  return me;
}
