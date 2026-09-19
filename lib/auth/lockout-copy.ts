import { MAX_FAILED_ATTEMPTS } from "./unlock-permission";

/**
 * What the sign-in screen SAYS about a lockout. Client-safe on purpose: the
 * login form renders these, and the login route sends them, so the wording
 * cannot drift between the two.
 *
 * The countdown starts at 3 rather than 5. "4 attempts left" on a first typo is
 * alarming for the ordinary case — a hurried password — while three is where the
 * warning starts being useful. The requirement asks for 3 and 2 by name; 1 is
 * included because the sentence that matters most is the last one before a lock.
 */

/**
 * Who to ask. Deliberately NOT a list of names: the people who hold the unlock
 * role change (it is granted in Settings → Account Locks, not in code), and a
 * sign-in screen is the one place in the app a stranger can read, so it should
 * not publish who the privileged accounts are.
 */
export const UNLOCKER_NAMES = "your WMS administrator";

/** The countdown begins at this many attempts remaining. */
export const WARN_FROM_REMAINING = 3;

export const LOCKED_MESSAGE =
  `Your account is locked after ${MAX_FAILED_ATTEMPTS} wrong passwords. ` +
  `Ask ${UNLOCKER_NAMES} to unlock it — “Forgot password” will not work until they do.`;

/** The line shown after a wrong password, given how many tries are left. */
export function wrongPasswordMessage(remaining: number): string {
  if (remaining <= 0) return LOCKED_MESSAGE;
  if (remaining === 1) {
    return "Wrong password. 1 attempt left — the next wrong password locks your account.";
  }
  if (remaining <= WARN_FROM_REMAINING) {
    return `Wrong password. ${remaining} attempts left before your account locks.`;
  }
  return "Wrong password. Try again, or reset it below.";
}

/** Shown on the Forgot Password screen when the address is locked. */
export const RESET_BLOCKED_MESSAGE =
  `This account is locked, so its password cannot be reset yet. ` +
  `Ask ${UNLOCKER_NAMES} to unlock it first.`;
