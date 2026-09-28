import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  delegatedAccessGrants,
  designations,
  employeeRoles,
  employees,
  functions,
  modulePermissions,
  payingEntities,
  rolePermissions,
  roles,
} from "@/db/schema";
import { nodeChain, permissionNode } from "@/lib/permissions/catalog";
import { DATA_SCOPE_LABELS, type DataScope } from "@/lib/permissions/vocabulary";
import {
  mergeEffectiveAccessLines,
  type EffectiveAccessLine,
} from "@/lib/permissions/effective-access";

/**
 * SERVER-SIDE QUERIES FOR ADMIN PANEL → CONTROL PANEL.
 *
 * Everything here is read-only composition over tables the application already
 * owns (employees + masters, `module_permissions`, `delegated_access_grants`) and
 * the new Roles tables. No employee/hierarchy/permission data is duplicated.
 */

export interface ControlPanelUser {
  id: string;
  name: string;
  email: string | null;
  employeeCode: string | null;
  functionName: string | null;
  designationName: string | null;
  entityName: string | null;
  isActive: boolean;
  isAdmin: boolean;
  roleNames: string[];
}

/** The Users tab: employees joined live to function/designation/entity + roles. */
export async function listControlPanelUsers(): Promise<ControlPanelUser[]> {
  const rows = await db
    .select({
      id: employees.id,
      name: employees.name,
      email: employees.email,
      employeeCode: employees.employeeCode,
      functionName: functions.name,
      designationName: designations.name,
      entityName: payingEntities.name,
      isActive: employees.isActive,
      isAdmin: employees.isAdmin,
    })
    .from(employees)
    .leftJoin(functions, eq(employees.departmentId, functions.id))
    .leftJoin(designations, eq(employees.designationId, designations.id))
    .leftJoin(payingEntities, eq(employees.payingEntityId, payingEntities.id))
    .orderBy(asc(employees.name));

  const empIds = rows.map((r) => r.id);
  const assignments =
    empIds.length > 0
      ? await db
          .select({
            employeeId: employeeRoles.employeeId,
            roleName: roles.name,
          })
          .from(employeeRoles)
          .innerJoin(roles, eq(employeeRoles.roleId, roles.id))
          .where(inArray(employeeRoles.employeeId, empIds))
          .orderBy(asc(roles.name))
      : [];

  const byEmp = new Map<string, string[]>();
  for (const a of assignments) {
    (byEmp.get(a.employeeId) ?? byEmp.set(a.employeeId, []).get(a.employeeId)!).push(a.roleName);
  }

  return rows.map((r) => ({ ...r, roleNames: byEmp.get(r.id) ?? [] }));
}

export interface RoleRow {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissionCount: number;
  memberCount: number;
}

export async function listRoles(): Promise<RoleRow[]> {
  const [roleRows, permCounts, memberCounts] = await Promise.all([
    db.select().from(roles).orderBy(asc(roles.name)),
    db
      .select({ roleId: rolePermissions.roleId, n: sql<number>`count(*)::int` })
      .from(rolePermissions)
      .groupBy(rolePermissions.roleId),
    db
      .select({ roleId: employeeRoles.roleId, n: sql<number>`count(*)::int` })
      .from(employeeRoles)
      .groupBy(employeeRoles.roleId),
  ]);
  const permMap = new Map(permCounts.map((r) => [r.roleId, Number(r.n)]));
  const memMap = new Map(memberCounts.map((r) => [r.roleId, Number(r.n)]));
  return roleRows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    isSystem: r.isSystem,
    permissionCount: permMap.get(r.id) ?? 0,
    memberCount: memMap.get(r.id) ?? 0,
  }));
}

export interface RolePermissionRow {
  id: string;
  nodeKey: string;
  module: string;
  page: string;
  action: string;
  scope: string | null;
}

export async function listRolePermissions(roleId: string): Promise<RolePermissionRow[]> {
  const rows = await db
    .select()
    .from(rolePermissions)
    .where(eq(rolePermissions.roleId, roleId))
    .orderBy(asc(rolePermissions.nodeKey));
  return rows.map((r) => {
    const chain = nodeChain(r.nodeKey);
    const moduleLabel = chain[0] ? (permissionNode(chain[0])?.label ?? "") : "";
    const node = permissionNode(r.nodeKey);
    return {
      id: r.id,
      nodeKey: r.nodeKey,
      module: moduleLabel,
      page: node && node.key !== moduleLabel ? node.label : "",
      action: r.action,
      scope: r.scope,
    };
  });
}

export interface TemporaryAccessLine {
  id: string;
  role: "delegate" | "target";
  otherName: string;
  state: "live" | "revoked" | "expired";
  expiresAt: Date;
}

export interface EffectiveAccess {
  permanent: EffectiveAccessLine[];
  /** Direct module_permissions overrides (the existing 3-action matrix). */
  direct: { nodeKey: string; module: string; page: string; show: boolean; view: boolean; edit: boolean }[];
  temporary: TemporaryAccessLine[];
}

/**
 * What a user ACTUALLY has, after roles + direct overrides + temporary access.
 */
export async function effectiveAccessFor(employeeId: string): Promise<EffectiveAccess> {
  const [assignments, direct, grants] = await Promise.all([
    db
      .select({
        roleName: roles.name,
        nodeKey: rolePermissions.nodeKey,
        action: rolePermissions.action,
        scope: rolePermissions.scope,
      })
      .from(employeeRoles)
      .innerJoin(roles, eq(employeeRoles.roleId, roles.id))
      .innerJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
      .where(eq(employeeRoles.employeeId, employeeId)),
    db
      .select()
      .from(modulePermissions)
      .where(eq(modulePermissions.employeeId, employeeId)),
    db
      .select({
        id: delegatedAccessGrants.id,
        targetEmployeeId: delegatedAccessGrants.targetEmployeeId,
        delegateEmployeeId: delegatedAccessGrants.delegateEmployeeId,
        targetName: employees.name,
        expiresAt: delegatedAccessGrants.expiresAt,
        revokedAt: delegatedAccessGrants.revokedAt,
      })
      .from(delegatedAccessGrants)
      .innerJoin(employees, eq(delegatedAccessGrants.targetEmployeeId, employees.id))
      .where(
        eq(delegatedAccessGrants.delegateEmployeeId, employeeId),
      )
      .orderBy(delegatedAccessGrants.startsAt),
  ]);

  const permanent: EffectiveAccessLine[] = assignments.map((a) => {
    const chain = nodeChain(a.nodeKey);
    const moduleLabel = chain[0] ? (permissionNode(chain[0])?.label ?? "") : "";
    const node = permissionNode(a.nodeKey);
    return {
      nodeKey: a.nodeKey,
      module: moduleLabel,
      page: node && node.key !== moduleLabel ? node.label : "",
      action: a.action,
      scope: a.scope ? (DATA_SCOPE_LABELS[a.scope as DataScope] ?? a.scope) : null,
      source: a.roleName,
    };
  });

  const directRows = direct.map((m) => {
    const chain = nodeChain(m.nodeKey);
    const moduleLabel = chain[0] ? (permissionNode(chain[0])?.label ?? "") : "";
    const node = permissionNode(m.nodeKey);
    return {
      nodeKey: m.nodeKey,
      module: moduleLabel,
      page: node && node.key !== moduleLabel ? node.label : "",
      show: m.canShow,
      view: m.canView,
      edit: m.canEdit,
    };
  });

  const temporary: TemporaryAccessLine[] = grants.map((g) => {
    const now = Date.now();
    const state = g.revokedAt ? "revoked" : g.expiresAt.getTime() < now ? "expired" : "live";
    return {
      id: g.id,
      role: "delegate",
      otherName: g.targetName ?? "",
      state,
      expiresAt: g.expiresAt,
    };
  });

  return { permanent: mergeEffectiveAccessLines(permanent), direct: directRows, temporary };
}
