import type { ModuleSubmissionRow } from "@/lib/queries/modules";

/**
 * ONE definition of what a reimbursement claim IS — its amount, its status, and
 * what each filter means. Client-safe (no server imports) so the page, the KPI
 * strip and the claims list all read the same rules.
 *
 * ── WHY THIS FILE EXISTS ───────────────────────────────────────────────────
 * `claimAmount` and the paid test were written out TWICE, once in
 * app/(app)/reimbursements/page.tsx (for the KPI totals) and once in
 * components/reimbursements/rb-claims-list.tsx (for the cards and the chips).
 * Two copies of the arithmetic behind a number and the arithmetic behind the
 * list that number describes is exactly how a KPI comes to disagree with the
 * rows it filters to. Now the KPI cards ARE filters, they have to agree by
 * construction rather than by inspection.
 *
 * ── "PAID" IS DERIVED, NOT STORED ──────────────────────────────────────────
 * `module_submissions.status` only knows pending / approved / rejected. A claim
 * is settled once an admin has additionally logged a payment date in the admin
 * fields, so "paid" is a NARROWER reading of "approved" and lives only here.
 */

/** The stored status union on `module_submissions` for this module. */
export type ClaimStatus = "pending" | "approved" | "rejected";

/** What the UI shows, once a payment date has narrowed "approved" to "paid". */
export type DerivedClaimStatus = ClaimStatus | "paid";

/**
 * Every filter the reimbursement surfaces can be in.
 *
 * `approved` and `approvedAll` are DELIBERATELY both here and they are not the
 * same question:
 *
 *   · `approved`    — approved but NOT yet settled. This is what the existing
 *                     status chip has always meant, and it is the useful "still
 *                     owed" view. Left exactly as it was.
 *   · `approvedAll` — approved, settled or not. This is what the "Approved ·
 *                     paid" KPI CARD actually totals, so it is what that card
 *                     must filter to. Anything narrower and the card would show
 *                     one figure and produce a shorter list.
 */
export type ClaimFilter = "all" | "pending" | "approved" | "approvedAll" | "paid" | "rejected";

export const CLAIM_FILTER_LABELS: Record<ClaimFilter, string> = {
  all: "All claims",
  pending: "Pending",
  approved: "Approved",
  approvedAll: "Approved · paid",
  paid: "Paid",
  rejected: "Rejected",
};

/** Claim ₹ as a number — module fields are stored as strings. */
export function claimAmount(r: ModuleSubmissionRow): number {
  const n = Number(String(r.fields.amount ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** Σ of the claim amounts on these rows. */
export function sumClaims(rows: readonly ModuleSubmissionRow[]): number {
  return rows.reduce((s, r) => s + claimAmount(r), 0);
}

/** Approved AND an admin logged a payment date ⇒ settled. */
export function isPaid(r: ModuleSubmissionRow): boolean {
  return r.status === "approved" && (r.adminFields?.payment_date ?? "") !== "";
}

/** The status to display: "paid" where a payment date narrows "approved". */
export function deriveStatus(r: ModuleSubmissionRow): DerivedClaimStatus {
  if (isPaid(r)) return "paid";
  return (r.status as ClaimStatus) ?? "pending";
}

/**
 * Does this claim belong in `filter`'s list?
 *
 * THE ONE PREDICATE every surface filters through, so "what the Pending KPI
 * counts" and "what the Pending list shows" cannot drift apart.
 */
export function matchesFilter(r: ModuleSubmissionRow, filter: ClaimFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    // The KPI card's own definition: `status === "approved"`, whether or not it
    // has been settled. Its total is computed the same way (see page.tsx).
    case "approvedAll":
      return r.status === "approved";
    default:
      return deriveStatus(r) === filter;
  }
}

/** Rows in `filter`. */
export function filterClaims(
  rows: readonly ModuleSubmissionRow[],
  filter: ClaimFilter,
): ModuleSubmissionRow[] {
  return filter === "all" ? [...rows] : rows.filter((r) => matchesFilter(r, filter));
}
