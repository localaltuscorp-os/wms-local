/**
 * WS-6 — Incentive entry REVERSAL math (PURE, no I/O). Decides the financial
 * effect of reversing a ledger entry, so the transactional action and its unit
 * tests share one source of truth.
 *
 * Rules (spec):
 *   - unpaid entry  → no negative payable (nothing was paid to claw back)
 *   - paid entry    → a negative adjustment equal to the PAID amount
 *   - partial pay   → the negative equals only the PAID portion, never more
 *   - already reversed → no-op (the `reversed` flag is the duplicate guard)
 *
 * The paid amount is left untouched on the row (it is the historical record);
 * the reversal is expressed as a separate negative `salary_payments` row.
 */

import { round2 } from "@/lib/incentive/payout-math";

export interface EntryReversalPlan {
  /** The row was already reversed — write nothing. */
  alreadyReversed: boolean;
  /** The signed amount to post as the adjustment (≤ 0). 0 ⇒ nothing to post. */
  reversalAmount: number;
  /** Whether a negative adjustment row must be written. */
  shouldReverse: boolean;
}

/** Compute the reversal adjustment for one entry. `paidAmt` is the amount
 *  already paid to the employee (the gross paid, pre-reversal). */
export function planEntryReversal(
  paidAmt: number | string | null | undefined,
  alreadyReversed: boolean,
): EntryReversalPlan {
  if (alreadyReversed) {
    return { alreadyReversed: true, reversalAmount: 0, shouldReverse: false };
  }
  const paid = round2(Math.max(0, Number(paidAmt) || 0));
  if (paid <= 0) {
    // Unpaid — nothing to claw back, but still mark reversed.
    return { alreadyReversed: false, reversalAmount: 0, shouldReverse: false };
  }
  return { alreadyReversed: false, reversalAmount: round2(-paid), shouldReverse: true };
}
