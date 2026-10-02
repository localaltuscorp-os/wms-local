import { isFounderEmail } from "@/lib/auth/founder";

/**
 * WHO MAY DECIDE AN INCENTIVE REQUEST — Manan Vasa, and nobody else.
 *
 * The brief is explicit that only Manan makes the approval decision, so this is
 * the founder identity the rest of the app already keys on
 * (lib/auth/founder.ts), not "any admin". Before this change any admin could
 * approve or reject; that path now goes through this check too.
 *
 * Client-safe and pure so the page can decide what to RENDER from it — but the
 * boundary is the server: every decision action calls this again for itself.
 * A hidden button is presentation.
 */
export function canReviewIncentives(email: string | null | undefined): boolean {
  return isFounderEmail(email);
}

/** How the reviewer is named on screens and in messages. */
export const INCENTIVE_REVIEWER_NAME = "Manan Vasa";

/**
 * WHO MAY ADD, EDIT OR DELETE AN INCENTIVE TABLE RECORD.
 *
 * Manan Vasa, and nobody else — by name, not by role. This deliberately does
 * NOT widen to admins, managers, HR or the super-admins: the Incentive Table is
 * the set of schemes the whole company is paid from, and the brief is explicit
 * that a single person owns it. An admin who needs a change asks for it.
 *
 * Same founder identity `canReviewIncentives` above keys on, so the two
 * "Manan only" rules in this module can never drift apart.
 *
 * Client-safe and pure so the dialog can decide what to RENDER from it — but
 * the boundary is the server: `catalog-actions.ts` re-checks it on every write,
 * so hiding the buttons is presentation, not the lock.
 */
export function canEditIncentiveTable(email: string | null | undefined): boolean {
  return isFounderEmail(email);
}
