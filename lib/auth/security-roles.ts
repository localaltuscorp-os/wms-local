import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, securityRoleEvents, securityRoleGrants, type Employee } from "@/db/schema";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import type { SecurityRole } from "@/lib/auth/security-roles-catalog";

/**
 * WHO HOLDS AN ASSIGNABLE ROLE (migration 0238).
 *
 * The roles themselves are code (lib/auth/security-roles-catalog.ts); these
 * functions answer "has this person been given one", and hand the role to
 * somebody new. That is the whole point: a person who should be able to unlock
 * accounts is given the role in the app, with no code change and no deploy.
 *
 * There are no permanent role holders. Super-admins manage grants, and every
 * grant can be removed by a different super-admin.
 */

/** Does this employee hold the role by grant, or inherently as a super-admin? */
export async function hasSecurityRole(employee: Pick<Employee, "id" | "email">, role: SecurityRole): Promise<boolean> {
  if (role === "account_unlock" && isSuperAdmin(employee.email)) return true;
  try {
    const [row] = await db
      .select({ id: securityRoleGrants.id })
      .from(securityRoleGrants)
      .where(and(eq(securityRoleGrants.employeeId, employee.id), eq(securityRoleGrants.role, role)))
      .limit(1);
    return Boolean(row);
  } catch (err) {
    // Fail CLOSED: an unreadable grants table must not hand the role out. The
    // Super-admins above still work, which keeps the recovery path available.
    console.error("[security-roles] grant lookup failed", err);
    return false;
  }
}

/** May this person release a locked account? */
export async function mayUnlockAccounts(employee: Pick<Employee, "id" | "email">): Promise<boolean> {
  return hasSecurityRole(employee, "account_unlock");
}

/**
 * May this person GIVE the role to somebody else?
 *
 * Deliberately narrower than holding it: super-admins only.
 * A role that could hand itself out would spread without anybody deciding to.
 */
export function mayGrantSecurityRoles(employee: Pick<Employee, "email">): boolean {
  return isSuperAdmin(employee.email);
}

/** By email — for the lockout state machine, which is keyed by address, not id. */
export async function emailHoldsAccountUnlock(email: string): Promise<boolean> {
  const normalised = email.trim().toLowerCase();
  if (isSuperAdmin(normalised)) return true;
  try {
    const [row] = await db
      .select({ id: securityRoleGrants.id })
      .from(securityRoleGrants)
      .innerJoin(employees, eq(employees.id, securityRoleGrants.employeeId))
      .where(and(eq(employees.email, normalised), eq(securityRoleGrants.role, "account_unlock")))
      .limit(1);
    return Boolean(row);
  } catch (err) {
    console.error("[security-roles] email grant lookup failed", err);
    return false;
  }
}

export interface RoleHolder {
  employeeId: string;
  name: string;
  email: string;
  grantedAt: string | null;
}

/** Everyone who has an explicit database grant. */
export async function listRoleHolders(role: SecurityRole): Promise<RoleHolder[]> {
  const granted = await db
    .select({
      employeeId: securityRoleGrants.employeeId,
      name: employees.name,
      email: employees.email,
      createdAt: securityRoleGrants.createdAt,
    })
    .from(securityRoleGrants)
    .innerJoin(employees, eq(employees.id, securityRoleGrants.employeeId))
    .where(eq(securityRoleGrants.role, role))
    .orderBy(asc(employees.name));

  const holders: RoleHolder[] = granted.map((g) => ({
    employeeId: g.employeeId,
    name: g.name,
    email: g.email,
    grantedAt: g.createdAt.toISOString(),
  }));

  return holders;
}

/** Give the role. The CALLER must have checked `mayGrantSecurityRoles`. */
export async function grantSecurityRole(
  employeeId: string,
  role: SecurityRole,
  actorId: string | null,
): Promise<void> {
  await db
    .insert(securityRoleGrants)
    .values({ employeeId, role, grantedById: actorId })
    .onConflictDoNothing();
  await db.insert(securityRoleEvents).values({ employeeId, role, action: "granted", actorId });
}

/** Take the role away. The caller prevents a super-admin changing their own grant. */
export async function revokeSecurityRole(
  employeeId: string,
  role: SecurityRole,
  actorId: string | null,
): Promise<void> {
  await db
    .delete(securityRoleGrants)
    .where(and(eq(securityRoleGrants.employeeId, employeeId), eq(securityRoleGrants.role, role)));
  await db.insert(securityRoleEvents).values({ employeeId, role, action: "revoked", actorId });
}
