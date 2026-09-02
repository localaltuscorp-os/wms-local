/**
 * Salary wave-off (condone) math — ONE source of truth so the net-to-pay never
 * drifts between the on-screen table, CSV, PDF payslip and the mobile route.
 *
 * Sir grants some CONDONED days on a salary_breakup row (`waive_off_days`); the
 * amount is added BACK onto the take-home, pro-rated by the sheet's own per-day
 * rate (monthly CTC ÷ days in the month). The stored base (`final_payment`) is
 * deliberately NOT mutated — the wave-off is a reversible grant on top — but the
 * EFFECTIVE net (what actually gets paid / printed / exported) is this value.
 *
 * Pure + framework-free: safe in server routes, pdfkit, and the client table.
 */

export interface WaiveOffInput {
  monthlyCtc: string | number | null | undefined;
  daysInMonth: string | number | null | undefined;
  finalPayment: string | number | null | undefined;
  waiveOffDays: string | number | null | undefined;
  /** Signed pre-payout adjustment (+extra / −deduct), Sir #37. Optional. */
  payoutAdjustment?: string | number | null | undefined;
}

function num(v: string | number | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

/** Per-day rate, matching the sheet's pro-ration (fallback: 30-day month). */
export function perDayRate(r: WaiveOffInput): number {
  const monthly = num(r.monthlyCtc);
  const days = num(r.daysInMonth);
  return monthly / (days > 0 ? days : 30);
}

/** Rupees added back by the condoned days (0 when nothing is waived). */
export function waiveAddBack(r: WaiveOffInput): number {
  const days = num(r.waiveOffDays);
  return days > 0 ? days * perDayRate(r) : 0;
}

/** Signed pre-payout adjustment (+extra / −deduct), Sir #37. 0 when unset. */
export function payoutAdjustmentAmount(r: WaiveOffInput): number {
  return num(r.payoutAdjustment);
}

/**
 * The EFFECTIVE net take-home — base final payment + condoned wave-off days +
 * the signed pre-payout adjustment. This is the ONE amount to pay / print /
 * export everywhere (table, CSV, PDF, mobile).
 */
export function netAfterWaiveOff(r: WaiveOffInput): number {
  return num(r.finalPayment) + waiveAddBack(r) + payoutAdjustmentAmount(r);
}
