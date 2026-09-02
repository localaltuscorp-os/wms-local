import { leaveCycleFor, leaveCycleLabel, type LeaveCycle } from "./leave-cycle";

/**
 * WHAT AN UNUSED LEAVE IS WORTH when a leave period closes.
 *
 * The policy: entitlement is granted per six-month period and lapses at the end
 * of it — but what lapses is the DAY OFF, not the value. Whatever the employee
 * did not take is paid out instead. So "lapse" and "encash" are two halves of
 * one rule rather than a contradiction: you cannot carry the day forward, and
 * you are not simply deprived of it either.
 *
 * ── THE 31-DAY BASIS IS DELIBERATE AND NOT THE PAYROLL DIVISOR ─────────────
 * An encashed day is valued at monthlyGross / 31, always. Payroll's own divisor
 * is `salary_config.divisor_policy = 'actual'` — the real length of the month —
 * which would value a September day (÷30) higher than a March one (÷31) for the
 * same entitlement earned under the same policy. Fixing the divisor at 31 makes
 * the two half-year periods pay identically, which is the point.
 *
 * That also means the figure CANNOT be reconstructed by handing payroll a number
 * of days: it has to be computed here and stored. Migration 0207 adds the amount
 * column for exactly that reason.
 *
 * PURE — no DB, no clock. Everything it needs is passed in, so the number that
 * reaches someone's payslip is testable without a database.
 */

/** Fixed divisor for valuing an encashed leave day. Never the month's real length. */
export const ENCASHMENT_DAY_DIVISOR = 31;

export interface EncashmentInput {
  /** Confirmation date (probation end); null means confirmed long ago. */
  probationEnd: string | null | undefined;
  /** Annual CTC in rupees. 0 or absent ⇒ nothing to encash. */
  annualCtc: number;
  /** Paid-leave days already taken inside this period's balance window. */
  paidLeaveUsed: number;
  /** Any date inside the period being closed — normally its last day. */
  onDate: string;
}

export interface Encashment {
  cycle: LeaveCycle;
  cycleLabel: string;
  /** Entitlement for the period, pro-rated for a mid-period confirmation. */
  allowance: number;
  used: number;
  /** Never negative: taking MORE than the allowance is a payroll deduction
   *  handled by the salary engine, not a negative encashment here. */
  unusedDays: number;
  /** monthlyGross / 31, unrounded — exposed so the payslip can show the working. */
  perDayRate: number;
  /** Rupees, rounded to whole. */
  amount: number;
}

export function computeEncashment(input: EncashmentInput): Encashment {
  const cycle = leaveCycleFor(input.probationEnd, input.onDate);
  const allowance = cycle.allowance;
  const used = Math.max(0, input.paidLeaveUsed);

  // Half-day granularity survives to the payout: an entitlement of 3.5 with 1
  // taken encashes 2.5 days, not 2. Rounding here would quietly pocket the half
  // day that `proRataAllowance` deliberately rounded UP to grant.
  const unusedDays = Math.max(0, allowance - used);

  const monthlyGross = input.annualCtc > 0 ? input.annualCtc / 12 : 0;
  const perDayRate = monthlyGross > 0 ? monthlyGross / ENCASHMENT_DAY_DIVISOR : 0;

  return {
    cycle,
    cycleLabel: leaveCycleLabel(cycle),
    allowance,
    used,
    unusedDays,
    perDayRate,
    amount: Math.round(unusedDays * perDayRate),
  };
}

/**
 * The sentence written onto the adjustment row.
 *
 * Spells out the arithmetic because the amount is frozen at write time and can
 * never be re-derived from the row alone — whoever approves it six weeks later
 * needs to see where the number came from without opening the code.
 */
export function encashmentReason(e: Encashment): string {
  const days = e.unusedDays === Math.trunc(e.unusedDays) ? e.unusedDays : e.unusedDays.toFixed(1);
  return (
    `Leave encashment ${e.cycleLabel}: ${days} unused of ${e.allowance} ` +
    `(${e.used} taken) at monthly gross / ${ENCASHMENT_DAY_DIVISOR}` +
    `${e.cycle.proRated ? ", entitlement pro-rated from confirmation" : ""}.`
  );
}
