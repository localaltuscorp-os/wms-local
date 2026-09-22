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
