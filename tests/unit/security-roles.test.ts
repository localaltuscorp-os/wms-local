import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  SECURITY_ROLES,
  SECURITY_ROLE_DEFS,
  isSecurityRole,
} from "@/lib/auth/security-roles-catalog";
import { ACCOUNT_UNLOCKER_EMAILS } from "@/lib/auth/unlock-permission";

/**
 * ASSIGNABLE ROLES: the list is code, the grants are data (migration 0238).
 *
 * The rules asserted here are the ones that make that split safe, and none of
 * them fails a type check: a role with no definition, a grants lookup that
 * fails OPEN, or a code floor that a screen can revoke would each quietly widen
 * or close access with nothing to show for it.
 */
describe("the role catalogue", () => {
  it("defines every role it lists", () => {
    for (const key of SECURITY_ROLES) {
      const def = SECURITY_ROLE_DEFS[key];
      expect(def, key).toBeDefined();
      expect(def.key).toBe(key);
      expect(def.label.length).toBeGreaterThan(0);
      expect(def.blurb.length).toBeGreaterThan(0);
    }
  });

  it("recognises only its own keys", () => {
    expect(isSecurityRole("account_unlock")).toBe(true);
    expect(isSecurityRole("account_unlock_v2")).toBe(false);
    expect(isSecurityRole("")).toBe(false);
  });

  it("is client-safe, so the screen and the guard read one definition", () => {
    const src = readFileSync("lib/auth/security-roles-catalog.ts", "utf8");
    expect(src).not.toContain("server-only");
    expect(src).not.toContain("@/lib/db");
  });
});

describe("granting and holding", () => {
  const roles = readFileSync("lib/auth/security-roles.ts", "utf8");

  it("keeps the four named addresses as a floor that no screen can revoke", () => {
    // Otherwise revoking every grant would leave nobody able to release a lock,
    // and a lockout feature whose release valve can be switched off in a UI can
    // lock the whole company out.
    expect(roles).toContain("canUnlockAccounts(employee.email)");
    expect(ACCOUNT_UNLOCKER_EMAILS.length).toBe(4);
    const actions = readFileSync("app/(app)/account-locks/actions.ts", "utf8");
    const revoke = actions.indexOf("revokeUnlockRoleAction");
    expect(actions.slice(revoke, revoke + 600)).toContain("canUnlockAccounts(email)");
  });

  it("fails CLOSED when the grants table cannot be read", () => {
    // The opposite of the lockout reads, which fail open: an unreadable grants
    // table must not hand the role to everybody.
    const hasRole = roles.indexOf("export async function hasSecurityRole");
    const body = roles.slice(hasRole, roles.indexOf("export async function mayUnlockAccounts"));
    expect(body).toContain("catch");
    expect(body).toContain("return false");
  });

  it("records who granted or revoked, separately from the grant itself", () => {
    expect(roles).toContain("securityRoleEvents");
    expect(roles).toContain('action: "granted"');
    expect(roles).toContain('action: "revoked"');
  });

  it("seeds the four in the migration, so a deploy changes nobody's access", () => {
    const sql = readFileSync("db/migrations/0238_security_role_grants.sql", "utf8");
    for (const email of ACCOUNT_UNLOCKER_EMAILS) expect(sql).toContain(email);
    expect(sql).toContain("ON CONFLICT (employee_id, role) DO NOTHING");
  });
});

describe("the lock respects the role, not a hardcoded list", () => {
  const lockout = readFileSync("lib/auth/account-lockout.ts", "utf8");

  it("asks the role when deciding whether an address can be locked", () => {
    expect(lockout).toContain("emailHoldsAccountUnlock");
    // The old hardcoded-only check is gone from this file.
    expect(lockout).not.toContain("isLockoutExempt(");
  });
});
