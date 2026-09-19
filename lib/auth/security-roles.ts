import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, securityRoleEvents, securityRoleGrants, type Employee } from "@/db/schema";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { ACCOUNT_UNLOCKER_EMAILS, canUnlockAccounts } from "@/lib/auth/unlock-permission";
import type { SecurityRole } from "@/lib/auth/security-roles-catalog";

/**
 * WHO HOLDS AN ASSIGNABLE ROLE (migration 0238).
 *
 * The roles themselves are code (lib/auth/security-roles-catalog.ts); these
 * functions answer "has this person been given one", and hand the role to
 * somebody new. That is the whole point: a person who should be able to unlock
 * accounts is given the role in the app, with no code change and no deploy.
 *
 * ── THE FOUR NAMED ADDRESSES STAY IN CODE AS A FLOOR ───────────────────────
 * `ACCOUNT_UNLOCKER_EMAILS` still always holds `account_unlock`, and no screen
 * can revoke it. It is the answer to "what if somebody revokes every grant, or
 * the grants table is empty on a fresh database" — a lockout feature whose
 * release valve can be switched off by a UI is a feature that can lock the
 * whole company out. Everyone else is data.
 */

/** Does this employee hold the role — by grant, or by being one of the built-in four? */
export async function hasSecurityRole(employee: Pick<Employee, "id" | "email">, role: SecurityRole): Promise<boolean> {
  if (role === "account_unlock" && canUnlockAccounts(employee.email)) return true;
  try {
    const [row] = await db
      .select({ id: securityRoleGrants.id })
      .from(securityRoleGrants)
      .where(and(eq(securityRoleGrants.employeeId, employee.id), eq(securityRoleGrants.role, role)))
      .limit(1);
    return Boolean(row);
  } catch (err) {
    // Fail CLOSED: an unreadable grants table must not hand the role out. The
    // built-in four above still work, which is what keeps the valve open.
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
 * Deliberately narrower than holding it: the four named owners and super-admins.
 * A role that could hand itself out would spread without anybody deciding to.
 */
export function mayGrantSecurityRoles(employee: Pick<Employee, "email">): boolean {
  return canUnlockAccounts(employee.email) || isSuperAdmin(employee.email);
}

/** By email — for the lockout state machine, which is keyed by address, not id. */
export async function emailHoldsAccountUnlock(email: string): Promise<boolean> {
  const normalised = email.trim().toLowerCase();
  if (canUnlockAccounts(normalised)) return true;
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
  /** True for the four in code: shown as permanent, and not revocable. */
  builtIn: boolean;
  grantedAt: string | null;
}

/** Everyone who holds the role: the built-in four first, then granted holders. */
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

  const builtInEmails = role === "account_unlock" ? new Set<string>(ACCOUNT_UNLOCKER_EMAILS) : new Set<string>();
  const holders: RoleHolder[] = granted.map((g) => ({
    employeeId: g.employeeId,
    name: g.name,
    email: g.email,
    builtIn: builtInEmails.has(g.email.toLowerCase()),
    grantedAt: g.createdAt.toISOString(),
  }));

  // A built-in address with no employees row (or no grant row yet) still holds
  // the role, so say so rather than showing a list that contradicts the guard.
  for (const email of builtInEmails) {
    if (!holders.some((h) => h.email.toLowerCase() === email)) {
      holders.push({ employeeId: "", name: email, email, builtIn: true, grantedAt: null });
    }
  }
  return holders.sort((a, b) => Number(b.builtIn) - Number(a.builtIn) || a.name.localeCompare(b.name));
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

/** Take the role away. The built-in four cannot be revoked — see the header. */
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
