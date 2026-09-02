// WS-5 Salary core — CTC breakup builder (PURE: no DB).
//
// Turns an entity-wise CTC definition + optional Retention Bonus into the
// structured line-set attached to a payslip. Spec rules honoured:
//   • Retention Bonus is added BEFORE the "Salary Payable" subtotal, and carries
//     a payable date. In the CTC breakup it is ALWAYS shown (with its date).
//   • In the PAYSLIP the Retention Bonus line is shown ONLY if actually paid;
//     hidden otherwise (see `retentionBonusForPayslip`).
//   • Entity-wise total Salary Payable is computed AFTER Professional Tax.
//
// Components are supplied by the CTC form (Basic / HRA / Special Allowance / …).
// This module does not invent component splits — it sums whatever the form
// provides and reconciles it against the annual CTC, flagging any mismatch.

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export interface CtcComponentInput {
  label: string;
  /** Annual rupee value of this component. Monthly is derived (÷12). */
  annualAmount: number;
}

export interface RetentionBonusInput {
  amount: number;
  /** When the retention bonus becomes payable (YYYY-MM-DD). */
  payableDate: string | null;
  /** Whether it has actually been paid (drives payslip visibility). */
  paid: boolean;
}

export interface CtcBreakupInput {
  employeeId: string;
  employeeName: string;
  payingEntityId: string | null;
  payingEntityName: string | null;
  annualCtc: number;
  components: CtcComponentInput[];
  retentionBonus?: RetentionBonusInput | null;
  /** Professional Tax ₹/month for this person (0 if exempt). From salaryConfig
   *  defaultPt unless a per-entity slab is supplied by the caller. */
  ptMonthly: number;
}

export interface CtcBreakupLine {
  label: string;
  annualAmount: number;
  monthlyAmount: number;
  /** 'component' | 'retention' | 'subtotal' | 'deduction' | 'net' — for styling. */
  kind: "component" | "retention" | "subtotal" | "deduction" | "net";
}

export interface CtcBreakupResult {
  employeeId: string;
  employeeName: string;
  payingEntityId: string | null;
  payingEntityName: string | null;
  annualCtc: number;
  monthlyCtc: number;
  lines: CtcBreakupLine[];
  /** Σ components − should equal annualCtc. */
  componentsAnnualTotal: number;
  /** True when components don't reconcile to the annual CTC (form warning). */
  ctcMismatch: boolean;
  /** annualCtc − Σ components (0 when reconciled). */
  ctcMismatchAmount: number;
  retentionBonus: RetentionBonusInput | null;
  ptMonthly: number;
  /** Monthly salary payable BEFORE PT (monthlyCtc + retention-bonus month share
   *  is NOT folded here — retention is a lump line, not a monthly accrual). */
  monthlySalaryPayable: number;
  /** Monthly salary payable AFTER PT. */
  monthlyPayableAfterPt: number;
}

/**
 * Build the CTC breakup for one person. Retention Bonus is inserted as a line
 * BEFORE the Salary Payable subtotal, then PT is deducted to give the
 * after-PT payable. Pure.
 */
export function buildCtcBreakup(input: CtcBreakupInput): CtcBreakupResult {
  const monthlyCtc = round2(input.annualCtc / 12);
  const lines: CtcBreakupLine[] = [];

  let componentsAnnualTotal = 0;
  for (const c of input.components) {
    const annual = round2(c.annualAmount);
    componentsAnnualTotal = round2(componentsAnnualTotal + annual);
    lines.push({
      label: c.label,
      annualAmount: annual,
      monthlyAmount: round2(annual / 12),
      kind: "component",
    });
  }

  const rb = input.retentionBonus ?? null;
  // Retention bonus line — ALWAYS present in the CTC breakup (with its date).
  if (rb && rb.amount > 0) {
    lines.push({
      label: rb.payableDate ? `Retention Bonus (payable ${rb.payableDate})` : "Retention Bonus",
      annualAmount: round2(rb.amount),
      monthlyAmount: 0, // lump sum, not a monthly accrual
      kind: "retention",
    });
  }

  // Salary Payable subtotal (monthly CTC; retention is a separate lump line).
  const monthlySalaryPayable = monthlyCtc;
  lines.push({
    label: "Salary Payable",
    annualAmount: round2(input.annualCtc),
    monthlyAmount: monthlySalaryPayable,
    kind: "subtotal",
  });

  // Professional Tax deduction.
  const ptMonthly = round2(Math.max(0, input.ptMonthly));
  lines.push({
    label: "Less: Professional Tax",
    annualAmount: round2(ptMonthly * 12),
    monthlyAmount: ptMonthly,
    kind: "deduction",
  });

  const monthlyPayableAfterPt = round2(monthlySalaryPayable - ptMonthly);
  lines.push({
    label: "Salary Payable (after PT)",
    annualAmount: round2(monthlyPayableAfterPt * 12),
    monthlyAmount: monthlyPayableAfterPt,
    kind: "net",
  });

  const ctcMismatchAmount = round2(input.annualCtc - componentsAnnualTotal);
  return {
    employeeId: input.employeeId,
    employeeName: input.employeeName,
    payingEntityId: input.payingEntityId,
    payingEntityName: input.payingEntityName,
    annualCtc: round2(input.annualCtc),
    monthlyCtc,
    lines,
    componentsAnnualTotal,
    ctcMismatch: input.components.length > 0 && Math.abs(ctcMismatchAmount) >= 1,
    ctcMismatchAmount,
    retentionBonus: rb,
    ptMonthly,
    monthlySalaryPayable,
    monthlyPayableAfterPt,
  };
}

/**
 * Retention-bonus visibility gate for the PAYSLIP. Returns the bonus ONLY when
 * it has actually been paid; null otherwise (hidden). The CTC breakup document
 * itself always shows it — this gate is payslip-specific.
 */
export function retentionBonusForPayslip(
  rb: RetentionBonusInput | null | undefined,
): RetentionBonusInput | null {
  if (rb && rb.paid && rb.amount > 0) return rb;
  return null;
}
