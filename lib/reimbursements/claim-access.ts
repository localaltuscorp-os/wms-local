/**
 * WHO MAY SEE AND WHO MAY CHANGE a reimbursement claim's documents.
 *
 * Pure predicates, in one file, following the same split as
 * lib/auth/roster-permission.ts: the RULE is testable on its own, and the
 * Server Actions in app/(app)/reimbursements/attachment-actions.ts do the
 * loading and the refusing. Three actions ask these questions; stating the
 * rules once is what stops the read gate and the write gate drifting apart.
 *
 * The claim is always loaded from the database FIRST and passed here. Nothing
 * in this file takes an id — an id proves nothing about who owns what.
 */

/** The slice of a claim these rules read. */
export interface ClaimOwnership {
  employeeId: string;
  status: string;
}

/** The slice of a viewer these rules read. */
export interface ClaimViewer {
  id: string;
  isAdmin?: boolean;
}

/**
 * May this person SEE the claim's documents?
 *
 * The claimant, or an admin (who reviews and settles every claim, so needs the
 * bill). Nobody else — including a colleague who somehow has the claim id.
 *
 * This gates the FILE NAMES as much as the bytes: "Rutvisha-medical-bill.pdf"
 * is itself information, which is why the list action refuses before it reads
 * rather than returning names with dead links.
 */
export function canViewClaimDocuments(
  // Only the OWNER matters here — reading does not depend on the verdict, so
  // this asks for nothing more and callers need not invent a status to pass.
  claim: Pick<ClaimOwnership, "employeeId">,
  viewer: ClaimViewer,
): boolean {
  return claim.employeeId === viewer.id || viewer.isAdmin === true;
}

/**
 * May this person ADD or REMOVE the claim's documents?
 *
 * The claimant, and ONLY while the claim is still pending.
 *
 * ── WHY NOT ADMINS ─────────────────────────────────────────────────────────
 * Narrower than viewing, deliberately, and narrower in a way that is easy to
 * mistake for an oversight. An admin approves and settles claims; letting the
 * same person also swap the receipt would remove the only independent evidence
 * behind their own decision. An admin who needs a different document reopens
 * the claim (status back to pending) and the claimant attaches it.
 *
 * ── WHY ONLY WHILE PENDING ─────────────────────────────────────────────────
 * A receipt exchanged after approval changes the evidence behind a verdict
 * already given, and after payment it changes the evidence behind money already
 * moved. Both are things an audit has to be able to rely on.
 */
export function canChangeClaimDocuments(
  claim: ClaimOwnership,
  viewer: ClaimViewer,
): boolean {
  return claim.employeeId === viewer.id && claim.status === "pending";
}

/**
 * Why a change was refused — so the action can say something true instead of a
 * flat "Forbidden", and so the reason is decided in one place.
 *
 * Returns null when the change is allowed.
 */
export function claimChangeRefusal(
  claim: ClaimOwnership,
  viewer: ClaimViewer,
): string | null {
  if (claim.employeeId !== viewer.id) {
    return "You can only change the documents on your own claim.";
  }
  if (claim.status !== "pending") {
    return "This claim has already been decided — its documents are fixed.";
  }
  return null;
}
