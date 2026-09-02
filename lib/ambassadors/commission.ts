/**
 * Ambassador commission computation — pure, client-safe.
 *
 * Each ambassador has payout terms: a percentage of the converted deal, or a
 * flat amount per conversion. When a referral is won we compute the commission
 * once and snapshot the basis string onto the referral, so later edits to the
 * ambassador's terms never rewrite history. An explicit per-referral override
 * always wins.
 *
 * Money is rupees with 2-decimal precision throughout; we round to paise.
 */

export type PayoutType = "percent" | "flat";

export interface CommissionInput {
  payoutType: PayoutType;
  /** Percent (e.g. 10 = 10%) when type=percent; flat rupees when type=flat. */
  payoutValue: number;
  /** Converted deal amount in rupees; required for percent commissions. */
  dealAmount: number | null;
  /** Explicit per-referral override in rupees; when set, it is the commission. */
  override?: number | null;
}

export interface CommissionResult {
  amount: number;
  basis: string;
}

/** Round to 2 decimals (paise) avoiding binary-float drift. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function computeCommission(input: CommissionInput): CommissionResult {
  const { payoutType, payoutValue, dealAmount, override } = input;

  if (override != null && Number.isFinite(override)) {
    return { amount: round2(override), basis: `override ₹${round2(override)}` };
  }

  if (payoutType === "flat") {
    const amount = round2(payoutValue || 0);
    return { amount, basis: `flat ₹${amount}` };
  }

  // percent
  const pct = payoutValue || 0;
  const base = dealAmount && dealAmount > 0 ? dealAmount : 0;
  const amount = round2((base * pct) / 100);
  return { amount, basis: `percent ${pct}%` };
}
