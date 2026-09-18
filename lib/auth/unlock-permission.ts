/**
 * Who may UNLOCK an account that has been locked out by failed sign-ins.
 *
 * A DELIBERATELY NARROW CAPABILITY, separate from both `isAdmin` and
 * `isSuperAdmin`:
 *
 *   · Not `isAdmin` — there are five admins today and the number grows with the
 *     company. Unlocking is the one control standing between a brute-force
 *     attempt and an account, so it is named people rather than a role that
 *     accumulates members.
 *
 *   · Not `isSuperAdmin` — that list grants promotion and demotion of admins,
 *     which is strictly more power than unlocking. Widening it to cover this
 *     would also re-open something deliberately narrowed to two people during
 *     the 2026-09-04 unauthorized-access incident (see lib/auth/super-admin.ts
 *     and HANDOFF.md). A new capability costs one file and leaks nothing.
 *
 * A CODE LIST, NOT A DATABASE FLAG OR AN ENV VAR, for the reason super-admin.ts
 * records: an env-var escape hatch let anyone who could set a Vercel variable
 * grant themselves the privilege silently, with no code review and no git
 * history. Editing this file shows up in a diff. The same argument rules out a
 * `can_unlock` column, which any writer to the employees table could set.
 *
 * Addresses are app logins from `employees.email`, lower-cased. A correspondence
 * address grants nothing.
 */
export const ACCOUNT_UNLOCKER_EMAILS = [
  "mohitgupta.altuscorp@gmail.com", // Mohit Gupta
  "rohanchoudhary.altuscorp@gmail.com", // Rohan Choudhary
  "jeevanbharambe.altuscorp@gmail.com", // Jeevan Bharambe
  "manan@unleashed.in", // Manan Vasa
] as const;

/**
 * May this person unlock a locked account?
 *
 * Call this on the SERVER before performing an unlock. The admin UI uses it too,
 * to hide the control — but hiding a button is a courtesy, not a guard: the
 * server action re-checks, because a hidden button is still a reachable action.
 */
export function canUnlockAccounts(email: string | null | undefined): boolean {
  if (!email) return false;
  const e = email.trim().toLowerCase();
  return ACCOUNT_UNLOCKER_EMAILS.includes(e as (typeof ACCOUNT_UNLOCKER_EMAILS)[number]);
}

/**
 * Is this account EXEMPT from being locked out at all?
 *
 * The break-glass half of the design. If every unlocker could themselves be
 * locked out, five wrong passwords against each of four addresses would leave
 * nobody able to unlock anybody — a company-wide outage anyone on the internet
 * could trigger, since these addresses are guessable.
 *
 * The trade-off is explicit and accepted: these four accounts keep no lockout,
 * so they rely on password strength and Firebase's own `auth/too-many-requests`
 * throttle instead. They are the four people who could undo a lockout anyway,
 * so locking them buys nothing an attacker could not immediately reverse.
 *
 * scripts/unlock-account.ts is the second break-glass, for the case where the
 * app itself cannot be reached.
 */
export function isLockoutExempt(email: string | null | undefined): boolean {
  return canUnlockAccounts(email);
}

/** How many consecutive failures before the account locks. */
export const MAX_FAILED_ATTEMPTS = 5;

/**
 * The window failures are counted over.
 *
 * "Consecutive" in the requirement means a SUCCESSFUL sign-in resets the count
 * to zero — that is handled on the success path, not here. This window is the
 * separate question of whether five failures spread across months should still
 * lock: they should not, or a fat-fingered password in January contributes to a
 * lockout in March. 24 hours is long enough to cover a bad day and short enough
 * that the count reflects a single episode.
 */
export const FAILED_ATTEMPT_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Remaining attempts, for the countdown the sign-in form shows.
 *
 * NOTE FOR CALLERS — showing this number tells the person typing that the
 * address is a real account. That is an enumeration leak and it is ACCEPTED
 * deliberately: the requirement asks for "3 attempts left" warnings, and a
 * countdown that does not reveal whether the account exists is a contradiction.
 * The mitigation is the per-IP throttle, which makes sweeping addresses
 * expensive, not the message.
 */
export function remainingAttempts(failedCount: number): number {
  return Math.max(0, MAX_FAILED_ATTEMPTS - failedCount);
}
