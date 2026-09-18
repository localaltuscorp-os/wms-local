"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/current";
import { canUnlockAccounts } from "@/lib/auth/unlock-permission";
import { getLockoutState, unlockAccount } from "@/lib/auth/account-lockout";

export type UnlockResult = { ok: true; email: string } | { ok: false; error: string };

/**
 * Release a locked account.
 *
 * Authorisation lives HERE (unlockAccount itself does not re-check, so the
 * break-glass script can call it with no signed-in actor). Checked against the
 * REAL signed-in person: `requireUser()` returns the effective identity under
 * delegated access, and borrowing somebody's account must not borrow the
 * authority to release lockouts.
 */
export async function unlockAccountAction(emailInput: string): Promise<UnlockResult> {
  const me = await requireUser();
  if (!canUnlockAccounts(me.email)) {
    return { ok: false, error: "Only Mohit, Rohan, Jeevan or Manan can unlock an account." };
  }
  const email = String(emailInput ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return { ok: false, error: "That doesn't look like an email address." };
  }
  try {
    await unlockAccount(email, me.id);
    console.info("[account-locks] unlocked", { email, by: me.email });
    revalidatePath("/account-locks");
    return { ok: true, email };
  } catch (err) {
    console.error("[account-locks] unlock failed", err);
    return { ok: false, error: "Couldn't unlock that account just now. Try again." };
  }
}

/** Current state for one address — lets the screen answer "is this one locked?" */
export async function lookupLockState(
  emailInput: string,
): Promise<{ ok: true; locked: boolean; failedCount: number } | { ok: false; error: string }> {
  const me = await requireUser();
  if (!canUnlockAccounts(me.email)) return { ok: false, error: "Not allowed." };
  const email = String(emailInput ?? "").trim().toLowerCase();
  if (!email.includes("@")) return { ok: false, error: "That doesn't look like an email address." };
  const state = await getLockoutState(email);
  return { ok: true, locked: state.locked, failedCount: state.failedCount };
}
