/**
 * THE ROLES SOMEBODY CAN BE GIVEN — the list, in code.
 *
 * Pure and client-safe: the screen that grants a role and the guard that
 * enforces it read the same definition, so a role on screen is always one
 * something actually checks.
 *
 * ── WHY THE LIST IS CODE AND THE GRANTS ARE DATA ───────────────────────────
 * A role means nothing unless a route consults it. If the list lived in a table
 * an admin could invent "can unlock accounts v2", hand it out, and nothing would
 * change — a switch wired to nothing. So adding a role is a code change (one
 * entry here plus the check that reads it), while GIVING a role to somebody is
 * data: an existing holder does it in the app, with no deploy.
 *
 * The same split lib/permissions/catalog.ts documents for the permission tree.
 */

export const SECURITY_ROLES = ["account_unlock"] as const;
export type SecurityRole = (typeof SECURITY_ROLES)[number];

export interface SecurityRoleDef {
  key: SecurityRole;
  label: string;
  /** What the holder may do, in the words the screen shows. */
  blurb: string;
  /** Why it is worth being careful with. Shown next to the grant control. */
  caution: string;
}

export const SECURITY_ROLE_DEFS: Record<SecurityRole, SecurityRoleDef> = {
  account_unlock: {
    key: "account_unlock",
    label: "Unlock accounts",
    blurb:
      "Release an account that locked itself after five wrong passwords, so the person can sign in and reset their password again.",
    caution:
      "A holder can also never be locked out themselves — otherwise five wrong passwords against every holder would leave nobody able to release anybody.",
  },
};

export function isSecurityRole(value: string): value is SecurityRole {
  return (SECURITY_ROLES as readonly string[]).includes(value);
}
