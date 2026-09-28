"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { employeeRoles, rolePermissions, roles } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/current";
import { auditAction } from "@/lib/logs/audit";
import { isPermissionNodeKey } from "@/lib/permissions/catalog";
import { isDataScope, isPermissionAction } from "@/lib/permissions/vocabulary";

/**
 * CONTROL PANEL → ROLES — the server actions.
 *
 * Every write re-authorises the signed-in administrator. The Control Panel is
 * the single admin-facing place for role and module access management.
 *
 * Every change writes the immutable Logs (`auditAction`), and each action
 * returns `{ ok, error? }` so the UI can surface the refusal.
 */

type Result = { ok: boolean; error?: string };

async function adminActor(): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const me = await requireAdmin();
  return { ok: true, id: me.id };
}

export async function createRole(input: { name: string; description?: string }): Promise<Result> {
  const actor = await adminActor();
  if (!actor.ok) return actor;

  const name = input.name.trim().slice(0, 120);
  if (!name) return { ok: false, error: "Give the role a name." };

  try {
    const [row] = await db
      .insert(roles)
      .values({ name, description: input.description?.trim() || null, createdById: actor.id })
      .returning({ id: roles.id });
    auditAction({
      eventType: "CREATE",
      employeeId: actor.id,
      route: "/control-panel/roles",
      module: "Control Panel",
      page: "Roles",
      resourceType: "role",
      resourceId: row?.id ?? "",
      resourceName: name,
      action: "role_create",
      status: "SUCCESS",
    });
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export async function updateRole(input: {
  roleId: string;
  name: string;
  description?: string;
}): Promise<Result> {
  const actor = await adminActor();
  if (!actor.ok) return actor;

  const name = input.name.trim().slice(0, 120);
  if (!name) return { ok: false, error: "Give the role a name." };

  const existing = await db.query.roles.findFirst({ where: eq(roles.id, input.roleId) });
  if (!existing) return { ok: false, error: "That role no longer exists." };
  if (existing.isSystem) return { ok: false, error: "The Super Admin role cannot be renamed." };

  await db
    .update(roles)
    .set({ name, description: input.description?.trim() || null, updatedAt: new Date() })
    .where(eq(roles.id, input.roleId));
  auditAction({
    eventType: "UPDATE",
    employeeId: actor.id,
    route: "/control-panel/roles",
    module: "Control Panel",
    page: "Roles",
    resourceType: "role",
    resourceId: input.roleId,
    resourceName: name,
    action: "role_update",
    status: "SUCCESS",
  });
  return { ok: true };
}

export async function deleteRole(input: { roleId: string }): Promise<Result> {
  const actor = await adminActor();
  if (!actor.ok) return actor;

  const existing = await db.query.roles.findFirst({ where: eq(roles.id, input.roleId) });
  if (!existing) return { ok: false, error: "That role no longer exists." };
  if (existing.isSystem) return { ok: false, error: "The Super Admin role cannot be deleted." };

  await db.delete(roles).where(eq(roles.id, input.roleId));
  auditAction({
    eventType: "DELETE",
    employeeId: actor.id,
    route: "/control-panel/roles",
    module: "Control Panel",
    page: "Roles",
    resourceType: "role",
    resourceId: input.roleId,
    resourceName: existing.name,
    action: "role_delete",
    status: "SUCCESS",
  });
  return { ok: true };
}

export async function assignRole(input: { employeeId: string; roleId: string }): Promise<Result> {
  const actor = await adminActor();
  if (!actor.ok) return actor;

  await db
    .insert(employeeRoles)
    .values({ employeeId: input.employeeId, roleId: input.roleId, assignedById: actor.id })
    .onConflictDoNothing();
  auditAction({
    eventType: "CONFIG_CHANGE",
    employeeId: actor.id,
    route: "/control-panel/roles",
    module: "Control Panel",
    page: "Roles",
    resourceType: "employee_role",
    resourceId: `${input.employeeId}:${input.roleId}`,
    action: "role_assign",
    status: "SUCCESS",
  });
  return { ok: true };
}

export async function removeRole(input: { employeeId: string; roleId: string }): Promise<Result> {
  const actor = await adminActor();
  if (!actor.ok) return actor;

  await db
    .delete(employeeRoles)
    .where(and(eq(employeeRoles.employeeId, input.employeeId), eq(employeeRoles.roleId, input.roleId)));
  auditAction({
    eventType: "CONFIG_CHANGE",
    employeeId: actor.id,
    route: "/control-panel/roles",
    module: "Control Panel",
    page: "Roles",
    resourceType: "employee_role",
    resourceId: `${input.employeeId}:${input.roleId}`,
    action: "role_remove",
    status: "SUCCESS",
  });
  return { ok: true };
}

export async function grantRolePermission(input: {
  roleId: string;
  nodeKey: string;
  action: string;
  scope?: string | null;
}): Promise<Result> {
  const actor = await adminActor();
  if (!actor.ok) return actor;

  if (!isPermissionNodeKey(input.nodeKey)) return { ok: false, error: "Unknown module." };
  if (!isPermissionAction(input.action)) return { ok: false, error: "Unknown action." };
  if (input.scope != null && !isDataScope(input.scope)) return { ok: false, error: "Unknown scope." };

  await db
    .insert(rolePermissions)
    .values({
      roleId: input.roleId,
      nodeKey: input.nodeKey,
      action: input.action,
      scope: input.scope ?? null,
    })
    .onConflictDoNothing();
  auditAction({
    eventType: "CONFIG_CHANGE",
    employeeId: actor.id,
    route: "/control-panel/roles",
    module: "Control Panel",
    page: "Roles",
    resourceType: "role_permission",
    resourceId: `${input.roleId}:${input.nodeKey}:${input.action}`,
    action: "permission_grant",
    status: "SUCCESS",
    metadata: { nodeKey: input.nodeKey, action: input.action, scope: input.scope ?? null },
  });
  return { ok: true };
}

export async function revokeRolePermission(input: { permissionId: string }): Promise<Result> {
  const actor = await adminActor();
  if (!actor.ok) return actor;

  await db.delete(rolePermissions).where(eq(rolePermissions.id, input.permissionId));
  auditAction({
    eventType: "CONFIG_CHANGE",
    employeeId: actor.id,
    route: "/control-panel/roles",
    module: "Control Panel",
    page: "Roles",
    resourceType: "role_permission",
    resourceId: input.permissionId,
    action: "permission_revoke",
    status: "SUCCESS",
  });
  return { ok: true };
}

export async function setRoleScope(input: {
  permissionId: string;
  scope: string | null;
}): Promise<Result> {
  const actor = await adminActor();
  if (!actor.ok) return actor;

  if (input.scope != null && !isDataScope(input.scope)) return { ok: false, error: "Unknown scope." };

  const existing = await db.query.rolePermissions.findFirst({
    where: eq(rolePermissions.id, input.permissionId),
  });
  if (!existing) return { ok: false, error: "That permission no longer exists." };

  await db
    .update(rolePermissions)
    .set({ scope: input.scope, updatedAt: new Date() })
    .where(eq(rolePermissions.id, input.permissionId));
  auditAction({
    eventType: "UPDATE",
    employeeId: actor.id,
    route: "/control-panel/roles",
    module: "Control Panel",
    page: "Roles",
    resourceType: "role_permission",
    resourceId: input.permissionId,
    action: "scope",
    status: "SUCCESS",
    changes: [{ field: "scope", before: existing.scope, after: input.scope }],
  });
  return { ok: true };
}
