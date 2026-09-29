"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { employeeRoles, rolePermissions, roles } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/current";
import { auditAction } from "@/lib/logs/audit";
import { isPermissionNodeKey } from "@/lib/permissions/catalog";
import { PERMISSION_ACTIONS, isDataScope, isPermissionAction } from "@/lib/permissions/vocabulary";

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

function parseExpiry(value: string | null | undefined): Date | null | Result {
  if (!value) return null;
  const expiresAt = new Date(value);
  if (Number.isNaN(expiresAt.getTime())) return { ok: false, error: "Choose a valid expiration date." };
  if (expiresAt.getTime() <= Date.now()) return { ok: false, error: "The expiration must be in the future." };
  return expiresAt;
}

export async function assignRole(input: { employeeId: string; roleId: string; expiresAt?: string | null }): Promise<Result> {
  const actor = await adminActor();
  if (!actor.ok) return actor;
  const expiresAt = parseExpiry(input.expiresAt);
  if (expiresAt && !(expiresAt instanceof Date)) return expiresAt;

  await db
    .insert(employeeRoles)
    .values({ employeeId: input.employeeId, roleId: input.roleId, assignedById: actor.id, expiresAt })
    .onConflictDoUpdate({ target: [employeeRoles.employeeId, employeeRoles.roleId], set: { expiresAt } });
  revalidatePath("/control-panel/roles");
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

/** Change a role assignment's lifetime without removing and re-adding the role. */
export async function setRoleExpiration(input: {
  employeeId: string;
  roleId: string;
  expiresAt: string | null;
}): Promise<Result> {
  const actor = await adminActor();
  if (!actor.ok) return actor;
  const expiresAt = parseExpiry(input.expiresAt);
  if (expiresAt && !(expiresAt instanceof Date)) return expiresAt;

  const [existing] = await db
    .select({ id: employeeRoles.id, previousExpiry: employeeRoles.expiresAt })
    .from(employeeRoles)
    .where(and(eq(employeeRoles.employeeId, input.employeeId), eq(employeeRoles.roleId, input.roleId)));
  if (!existing) return { ok: false, error: "That role assignment no longer exists." };

  await db.update(employeeRoles).set({ expiresAt }).where(eq(employeeRoles.id, existing.id));
  revalidatePath("/control-panel/roles");
  auditAction({
    eventType: "CONFIG_CHANGE",
    employeeId: actor.id,
    route: "/control-panel/roles",
    module: "Control Panel",
    page: "Roles",
    resourceType: "employee_role",
    resourceId: `${input.employeeId}:${input.roleId}`,
    action: "role_expiration",
    status: "SUCCESS",
    changes: [{ field: "expiresAt", before: existing.previousExpiry?.toISOString() ?? null, after: expiresAt?.toISOString() ?? null }],
  });
  return { ok: true };
}

export async function removeRole(input: { employeeId: string; roleId: string }): Promise<Result> {
  const actor = await adminActor();
  if (!actor.ok) return actor;

  await db
    .delete(employeeRoles)
    .where(and(eq(employeeRoles.employeeId, input.employeeId), eq(employeeRoles.roleId, input.roleId)));
  revalidatePath("/control-panel/roles");
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

/** One switch represents every action available in a module. */
export async function setRoleModuleAccess(input: { roleId: string; nodeKey: string; granted: boolean }): Promise<Result> {
  const actor = await adminActor();
  if (!actor.ok) return actor;
  if (!isPermissionNodeKey(input.nodeKey)) return { ok: false, error: "Unknown module." };

  await db.transaction(async (tx) => {
    await tx.delete(rolePermissions).where(and(eq(rolePermissions.roleId, input.roleId), eq(rolePermissions.nodeKey, input.nodeKey)));
    if (input.granted) {
      await tx.insert(rolePermissions).values(
        PERMISSION_ACTIONS.map((action) => ({ roleId: input.roleId, nodeKey: input.nodeKey, action, scope: null })),
      );
    }
  });
  revalidatePath("/control-panel/roles");
  auditAction({
    eventType: "CONFIG_CHANGE",
    employeeId: actor.id,
    route: "/control-panel/roles",
    module: "Control Panel",
    page: "Roles",
    resourceType: "role_permission",
    resourceId: `${input.roleId}:${input.nodeKey}`,
    action: input.granted ? "module_access_grant" : "module_access_revoke",
    status: "SUCCESS",
    metadata: { nodeKey: input.nodeKey, fullAccess: input.granted },
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
