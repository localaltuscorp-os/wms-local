import { netAfterWaiveOff, type WaiveOffInput } from "./waive-off";

/**
 * Partial-payment math — ONE source of truth for Total payable, Amount paid,
 * Unpaid balance and the payment status, shared by the table, the server
 * actions and anything that reports on them.
 *
 * Pure + framework-free (no db, no `server-only`, no React), exactly like
 * `waive-off`, so the client table and the server action compute the same
 * numbers instead of each carrying its own arithmetic.
 *
 * WHAT "TOTAL PAYABLE" IS: `netAfterWaiveOff` — the base final payment PLUS the
 * condoned wave-off days PLUS the signed payout adjustment. That is already
 * documented as "the ONE amount to pay / print / export everywhere", so the
 * balance is measured against the figure the employee actually receives. Using
 * the raw `final_payment` instead would leave a fully-settled row showing a
 * residual balance the moment Sir waived a day.
 *
 * NOTHING IS STORED BUT THE INPUTS. Payable is derived, amount paid is stored,
 * balance and status are derived. A balance column would go stale the instant a
 * wave-off changed the payable underneath it.
 */

export type PaymentStatus = "unpaid" | "partial" | "paid";

export interface PaymentInput extends WaiveOffInput {
  /** Cumulative rupees disbursed so far (`salary_breakup.amount_paid`). */
  amountPaid?: string | number | null | undefined;
}

function num(v: string | number | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

/** Round to paise. Payable comes out of a division (monthly ÷ days), so it
 *  routinely carries float dust that must not leak into a money comparison. */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * How close to zero counts as SETTLED — half a rupee.
 *
 * The payable is `monthly_ctc / days_in_month × days`, which lands on values
 * like 20833.333…, so an admin who pays the displayed whole-rupee figure leaves
 * a few paise behind. Without a tolerance those rows would sit at "Partially
 * paid" forever with a balance that renders as ₹0 — a status contradicting the
 * number printed beside it. Half a rupee is under the smallest amount anyone can
 * actually transfer, so it can never mask a real shortfall.
 */
export const SETTLED_EPSILON = 0.5;

/** Total payable — the effective net take-home for this row. */
export function totalPayable(r: PaymentInput): number {
  return round2(netAfterWaiveOff(r));
}

/** Rupees disbursed so far. Never negative. */
export function amountPaidOf(r: PaymentInput): number {
  return round2(Math.max(0, num(r.amountPaid)));
}

/**
 * Unpaid balance = payable − paid, FLOORED AT ZERO.
 *
 * The floor is the guarantee that an overpayment (or a payable revised downward
 * after the money went out) can never render as a negative outstanding amount.
 * Over-recovery, if it ever matters, is a different report than "what do we
 * still owe".
 */
export function unpaidBalance(r: PaymentInput): number {
  return round2(Math.max(0, totalPayable(r) - amountPaidOf(r)));
}

/**
 * The row's payment state, derived — never read from a stored status column.
 *
 * A payable of ZERO (nothing owed for the month) counts as settled: there is no
 * money to send, so "unpaid" would be a permanent false alarm on a row nobody
 * can ever action.
 */
export function paymentStatusOf(r: PaymentInput): PaymentStatus {
  const paid = amountPaidOf(r);
  if (unpaidBalance(r) <= SETTLED_EPSILON) return "paid";
  return paid > 0 ? "partial" : "unpaid";
}

/** Would this amount settle the row? The single rule the UI and the server
 *  action both use to decide whether `paid` flips true — and therefore whether
 *  the salary slip goes out. */
export function settles(r: PaymentInput, amount: number): boolean {
  return totalPayable(r) - round2(Math.max(0, amount)) <= SETTLED_EPSILON;
}

/**
 * Clamp an entered amount into the payable range.
 *
 * Overpayment is capped rather than rejected: the intent behind typing more than
 * the payable is always "settle it", and bouncing the whole action back would
 * lose that. `clamped` lets the caller say what it did instead of silently
 * changing the number the admin typed.
 */
export function clampAmount(r: PaymentInput, amount: number): { amount: number; clamped: boolean } {
  const max = totalPayable(r);
  const safe = round2(Math.max(0, Number.isFinite(amount) ? amount : 0));
  if (safe > max) return { amount: max, clamped: true };
  return { amount: safe, clamped: false };
}

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  unpaid: "Unpaid",
  partial: "Partially paid",
  paid: "Paid",
};
