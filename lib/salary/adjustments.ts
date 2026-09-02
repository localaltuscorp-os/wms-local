// WS-5 Salary core — accountant adjustments BEFORE final salary (PURE: no DB).
//
// Spec:
//   • Deduct X days for disciplinary action — reason MANDATORY. (present 30 → paid 27)
//   • Add ex-gratia days — reason MANDATORY. (present 28 → paid 30; Parvez/Moharram)
//   • Show BOTH "Amount Payable" and "Amount Paid" so the person sees the
//     account is nil and the accountant sees the state.
//
// Reasons are enforced at the type + validator level (see lib/validators/
// salary-ctc.ts). This module is the pure arithmetic + the display trail.

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export type AdjustmentKind = "deduct" | "ex_gratia";

export interface SalaryAdjustment {
  kind: AdjustmentKind;
  /** Whole/half days (>0). For 'deduct' these are removed; for 'ex_gratia' added. */
  days: number;
  /** MANDATORY. A blank reason is invalid (guarded here AND at the validator). */
  reason: string;
}

export interface AdjustmentApplyInput {
  /** Pay before any accountant adjustment (proration v2 gross, or gross−PT−… as
   *  the caller defines "payable"). This is the "Amount Payable" baseline. */
  amountPayableBeforeAdjust: number;
  /** Per-day rate used to value the adjustment days. */
  perDay: number;
  adjustments: SalaryAdjustment[];
}

export interface AppliedAdjustment extends SalaryAdjustment {
  /** Signed rupee effect (negative for deduct, positive for ex-gratia). */
  amount: number;
  /** True when the mandatory reason was missing/blank — surfaced, never dropped. */
  reasonMissing: boolean;
}

export interface AdjustmentApplyResult {
  /** Baseline before adjustments. */
  amountPayable: number;
  deductDays: number;
  exGratiaDays: number;
  deductAmount: number; // positive magnitude
  exGratiaAmount: number; // positive magnitude
  /** Final amount the person is actually PAID after adjustments. */
  amountPaid: number;
  applied: AppliedAdjustment[];
  /** True if any adjustment is missing its mandatory reason. */
  hasReasonGap: boolean;
}

/**
 * Apply accountant adjustments and return BOTH "Amount Payable" (baseline) and
 * "Amount Paid" (after deduct/ex-gratia). Pure. A missing reason does not throw
 * here — it is flagged (`reasonMissing` / `hasReasonGap`) so the UI can block
 * the save; the arithmetic still runs so nothing silently vanishes.
 */
export function applyAdjustments(input: AdjustmentApplyInput): AdjustmentApplyResult {
  const perDay = Math.max(0, input.perDay);
  let deductDays = 0;
  let exGratiaDays = 0;
  let hasReasonGap = false;

  const applied: AppliedAdjustment[] = input.adjustments.map((a) => {
    const days = Math.max(0, a.days);
    const reasonMissing = !a.reason || a.reason.trim().length === 0;
    if (reasonMissing) hasReasonGap = true;
    const signed = a.kind === "deduct" ? -round2(perDay * days) : round2(perDay * days);
    if (a.kind === "deduct") deductDays = round2(deductDays + days);
    else exGratiaDays = round2(exGratiaDays + days);
    return { ...a, days, amount: signed, reasonMissing };
  });

  const deductAmount = round2(perDay * deductDays);
  const exGratiaAmount = round2(perDay * exGratiaDays);
  const amountPayable = round2(input.amountPayableBeforeAdjust);
  const amountPaid = round2(amountPayable - deductAmount + exGratiaAmount);

  return {
    amountPayable,
    deductDays,
    exGratiaDays,
    deductAmount,
    exGratiaAmount,
    amountPaid,
    applied,
    hasReasonGap,
  };
}
