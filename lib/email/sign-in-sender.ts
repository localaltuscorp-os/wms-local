/**
 * Which address the SIGN-IN CODE is sent from, and what to do when Resend
 * refuses it.
 *
 * Kept out of lib/email/resend.ts (which is `server-only`) so the rules can be
 * tested directly. Pure functions, no Resend client, no environment writes.
 *
 * ── WHY A FALLBACK AND NOT JUST AN ENV VAR ────────────────────────────────
 * Resend refuses a `from` whose domain is not verified on that account, and for
 * the sign-in code that failure is total: no code arrives, so NOBODY CAN SIGN
 * IN. It has already happened twice on wms-local, where only mananvasa.com is
 * verified. `RESEND_SIGNIN_FROM` only helps someone who knew to set it, so the
 * sender falls through a list instead:
 *
 *   1. RESEND_SIGNIN_FROM, else the company address noreply@altuscorp.in —
 *      the 21 Sep decision: the one email read BEFORE you are inside the app
 *      carries the company's own address.
 *   2. RESEND_FROM_EMAIL — whatever this environment sends its notifications
 *      as, which is by definition verified here.
 *   3. mananvasa.com — verified on the non-production Resend account.
 *
 * Only a domain-verification refusal falls through. A bad address, a rate limit
 * or an outage is a real failure and is reported as one.
 */

export const COMPANY_SIGN_IN_FROM = "Altus Corp <noreply@altuscorp.in>";
export const FALLBACK_SIGN_IN_FROM = "Altus Corp <noreply@mananvasa.com>";

/** The preferred sender for the sign-in code. */
export function signInFrom(): string {
  return process.env.RESEND_SIGNIN_FROM?.trim() || COMPANY_SIGN_IN_FROM;
}

/** Senders to try, in order, first one wins. Never repeats a sender. */
export function signInFromCandidates(): string[] {
  const list = [signInFrom(), process.env.RESEND_FROM_EMAIL?.trim(), FALLBACK_SIGN_IN_FROM];
  return [...new Set(list.map((s) => s?.trim()).filter((s): s is string => !!s))];
}

/** Resend's wording when the from-domain is not verified on the account. */
export function isUnverifiedDomainError(message: string | null | undefined): boolean {
  return /domain is not verified|verify your domain|resend\.com\/domains/i.test(message ?? "");
}
