"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/current";
import { canUnlockAccounts } from "@/lib/auth/unlock-permission";
import { getLockoutState, unlockAccount } from "@/lib/auth/account-lockout";
import {
  grantSecurityRole,
  mayGrantSecurityRoles,
  mayUnlockAccounts,
  revokeSecurityRole,
} from "@/lib/auth/security-roles";
import { SECURITY_ROLE_DEFS } from "@/lib/auth/security-roles-catalog";

export type ActionResult = { ok: true } | { ok: false; error: string };
export type LockStateResult =
  | { ok: true; locked: boolean; failedCount: number }
  | { ok: false; error: string };

const NOT_ALLOWED = `You need the “${SECURITY_ROLE_DEFS.account_unlock.label}” role to do that.`;
const CANNOT_GRANT = "Only Mohit, Rohan, Jeevan, Manan or a super-admin can hand out this role.";

/**
 * Release a locked account.
 *
 * Authorisation lives HERE (unlockAccount itself does not re-check, so the
 * break-glass script can call it with no signed-in actor). Checked against the
 * REAL signed-in person: `requireUser()` returns the effective identity under
 * delegated access, and borrowing somebody's account must not borrow the
 * authority to release lockouts.
 */
export async function unlockAccountAction(emailInput: string): Promise<ActionResult> {
  const me = await requireUser();
  if (!(await mayUnlockAccounts(me))) return { ok: false, error: NOT_ALLOWED };
  const email = String(emailInput ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return { ok: false, error: "That doesn't look like an email address." };
  }
  try {
    await unlockAccount(email, me.id);
    console.info("[account-locks] unlocked", { email, by: me.email });
    revalidatePath("/account-locks");
    return { ok: true };
  } catch (err) {
    console.error("[account-locks] unlock failed", err);
    return { ok: false, error: "Couldn't unlock that account just now. Try again." };
  }
}

/** Current state for one address — lets the screen answer "is this one locked?" */
export async function lookupLockState(
  emailInput: string,
): Promise<LockStateResult> {
  const me = await requireUser();
  if (!(await mayUnlockAccounts(me))) return { ok: false, error: NOT_ALLOWED };
  const email = String(emailInput ?? "").trim().toLowerCase();
  if (!email.includes("@")) return { ok: false, error: "That doesn't look like an email address." };
  const state = await getLockoutState(email);
  return { ok: true, locked: state.locked, failedCount: state.failedCount };
}

/** Give somebody the unlock role. Takes effect immediately — no deploy. */
export async function grantUnlockRoleAction(employeeId: string): Promise<ActionResult> {
  const me = await requireUser();
  if (!mayGrantSecurityRoles(me)) return { ok: false, error: CANNOT_GRANT };
  const id = String(employeeId ?? "").trim();
  if (!id) return { ok: false, error: "Pick somebody first." };
  try {
    await grantSecurityRole(id, "account_unlock", me.id);
    console.info("[account-locks] granted account_unlock", { employeeId: id, by: me.email });
    revalidatePath("/account-locks");
    return { ok: true };
  } catch (err) {
    console.error("[account-locks] grant failed", err);
    return { ok: false, error: "Couldn't give that person the role. Try again." };
  }
}

/** Take the role away. The four named in code cannot be revoked here. */
export async function revokeUnlockRoleAction(employeeId: string, email: string): Promise<ActionResult> {
  const me = await requireUser();
  if (!mayGrantSecurityRoles(me)) return { ok: false, error: CANNOT_GRANT };
  if (canUnlockAccounts(email)) {
    return {
      ok: false,
      error: "This person is named in the code as a permanent unlocker, so the role cannot be taken away here.",
    };
  }
  try {
    await revokeSecurityRole(String(employeeId ?? "").trim(), "account_unlock", me.id);
    console.info("[account-locks] revoked account_unlock", { employeeId, by: me.email });
    revalidatePath("/account-locks");
    return { ok: true };
  } catch (err) {
    console.error("[account-locks] revoke failed", err);
    return { ok: false, error: "Couldn't take the role away. Try again." };
  }
}
