/**
 * THE REIMBURSEMENT KEY CARDS — pure, and shared with their test.
 *
 * ── WHY THE OLD CARD SET WAS REPLACED (2026-09-21) ────────────────────────
 * It was: Total claimed · Pending · Approved·paid · Claims. Two of those four
 * cards filtered to the SAME set — "Total claimed" and "Claims" both landed on
 * every row, one in rupees and one as a count — and the strip's own source
 * comment admitted it ("That redundancy is the existing KPI design's"). So a
 * quarter of the strip was spent saying a number the first card already said in
 * its caption ("across 3 claims"), while REJECTED — a real state, with money in
 * it, sitting right there in the list — had no card at all.
 *
 * The set here is the claim LIFECYCLE instead, and it partitions:
 *
 *     pending + approved + paid + rejected  ==  total        (count and ₹)
 *
 * `deriveStatus` returns exactly one of those four for every row, so the
 * identity holds by construction rather than by inspection — which is the whole
 * reason the figures are computed here, once, from that one predicate, instead
 * of being four independent `rows.filter(...)` expressions in the page.
 *
 * "Approved" is the NARROW reading on purpose: approved but not yet settled,
 * i.e. still owed. The money that has actually left is "Paid". The old card
 * merged the two and had to be captioned "N of M settled" to explain itself.
 */

import type { ModuleSubmissionRow } from "@/lib/queries/modules";
import {
  claimAmount,
  deriveStatus,
  type ClaimFilter,
  type DerivedClaimStatus,
} from "@/lib/reimbursements/claim-status";
import type { StatusCardKey } from "@/lib/status-palette";

/** One bucket's two figures. Both, always — a ₹ total with no count cannot say
 *  "across 3 claims", and a count with no total cannot be a money card. */
export interface ClaimFigure {
  amount: number;
  count: number;
}

/** The five cards. `total` is the whole book; the other four partition it. */
export interface ClaimKpiFigures {
  total: ClaimFigure;
  pending: ClaimFigure;
  approved: ClaimFigure;
  paid: ClaimFigure;
  rejected: ClaimFigure;
}

const empty = (): ClaimFigure => ({ amount: 0, count: 0 });

/**
 * Fold the rows once into the five figures.
 *
 * ONE PASS, through `deriveStatus` — the same predicate `matchesFilter` uses,
 * so a card's figure and the list its click produces are computed from the same
 * rule. This is the property `tests/unit/reimbursement-claim-kpis.test.ts`
 * pins, and it is why this is not four filters in the page component.
 */
export function computeClaimKpis(rows: readonly ModuleSubmissionRow[]): ClaimKpiFigures {
  const f: ClaimKpiFigures = {
    total: empty(),
    pending: empty(),
    approved: empty(),
    paid: empty(),
    rejected: empty(),
  };
  for (const r of rows) {
    const amount = claimAmount(r);
    f.total.amount += amount;
    f.total.count += 1;
    const bucket = f[deriveStatus(r)];
    bucket.amount += amount;
    bucket.count += 1;
  }
  return f;
}

/** How much of the approved money has actually been paid out, 0–1, or null when
 *  nothing has been approved yet (a progress bar at 0% would imply "none of it
 *  has been paid", which is a different statement from "there is none"). */
export function settledShare(f: ClaimKpiFigures): number | null {
  const owedPlusPaid = f.approved.amount + f.paid.amount;
  return owedPlusPaid > 0 ? f.paid.amount / owedPlusPaid : null;
}

/* ── COLOUR ────────────────────────────────────────────────────────────────
   Read from the SHARED status palette, never a hex of this module's own.

   The page and the claim rows previously carried `const GREEN = "#16a34a"` —
   a private palette, duplicated across two files, which is the exact mistake
   that made the Done dashboard take three passes to fix. Both surfaces now go
   through this one map, so a "Paid" badge on a row and the "Paid" card above it
   cannot end up different colours. */

/** Which shared card token paints each claim state.
 *
 *  The token KEYS are palette slots, not claim states — `pending` is the rose
 *  slot, and rose is what a rejected claim should be. Read the right-hand side
 *  as a colour, never as a status. */
export const CLAIM_STATUS_CARD: Record<DerivedClaimStatus, StatusCardKey> = {
  /** Amber — sitting with a reviewer, nobody has decided yet. */
  pending: "needInfo",
  /** Indigo — decided yes, money still owed. Deliberately NOT the emerald that
   *  Paid carries: "approved" is a promise, "paid" is a payment, and the strip
   *  showing both in the same green is what hid that difference before. */
  approved: "notStarted",
  /** Emerald — the money has actually gone out. */
  paid: "done",
  /** Rose (the `pending` palette slot — see above). */
  rejected: "pending",
};

/** The 4px stripe down a claim row. Tailwind classes in the SAME families as
 *  the card tokens above, so a row reads as the card it belongs to. */
export const CLAIM_STATUS_STRIPE: Record<DerivedClaimStatus, string> = {
  pending: "bg-amber-400",
  approved: "bg-indigo-400",
  paid: "bg-emerald-500",
  rejected: "bg-rose-400",
};

export const CLAIM_STATUS_LABEL: Record<DerivedClaimStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  paid: "Paid",
  rejected: "Rejected",
};

/** Which filter each card selects. Exported so the card list and the test agree
 *  on it without the page restating it. */
export const CLAIM_CARD_FILTER: Record<keyof ClaimKpiFigures, ClaimFilter> = {
  total: "all",
  pending: "pending",
  approved: "approved",
  paid: "paid",
  rejected: "rejected",
};

/* ── MODULE IDENTITY ───────────────────────────────────────────────────────
   Reimbursements keeps its green — it is a money module and the green is its
   identity, not an accident. What it does NOT keep is three private copies of
   the hex: `app/(app)/reimbursements/page.tsx`, `rb-claims-list.tsx` and
   `rb-claim-dialog.tsx` each declared their own `const GREEN = "#16a34a"`.

   These are set ONCE, as `--module-accent` / `--module-accent-deep` on the page
   wrapper, which is the mechanism the app already has for this (see
   `.brand-btn` in globals.css, and the Goals canvas that set the precedent).
   Everything inside the page — buttons, pills, focus rings — inherits them, so
   the module's colour is now one declaration instead of three. */
export const CLAIM_ACCENT = "#E10600";
export const CLAIM_ACCENT_DEEP = "#B91C1C";
