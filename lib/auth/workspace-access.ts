import "server-only";
import { redirect } from "next/navigation";
import type { Employee } from "@/db/schema";
import { requireUser, forbiddenError } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { employeeDepartmentNames } from "@/lib/queries/departments";
import { canAccessWorkspace, type WorkspaceId } from "@/lib/workspaces";

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
export async function accessFor(me: Employee) {
  const structured = await employeeDepartmentNames(me.id).catch(() => [] as string[]);
  const departments = me.department ? [...structured, me.department] : structured;
  return {
    departments,
    isAdmin: me.isAdmin,
    isSuperAdmin: isSuperAdmin(me.email),
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
