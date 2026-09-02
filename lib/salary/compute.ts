// Pure salary computation — the money spine. No DB, no Date. Rupees (not paise),
// rounded to 2 decimals. Inputs come from the attendance month summary
// (payableDays = Σ day-values, lateMarksInMonth = un-waived late count) + the
// employee's salary profile.

export interface SalaryInput {
  annualCtc: number;        // rupees/year
  payableDays: number;      // Σ day-values for the month (PL=1, A/LWP=0, HP=2, H-H/D=1.5, H/D=0.5…)
  daysInMonth: number;      // calendar days in the month (28–31)
  ptExempt: boolean;        // professional tax exemption
  tdsMonthly: number;       // fixed ₹/month
  lateMarksInMonth: number; // un-waived lates (every 3rd → 0.5 day cut)
  advances: number;         // ₹ taken this month
  pendingBalanceIn: number; // ₹ carried in from a prior month's unpaid remainder
}

export interface SalaryBreakdown {
  monthlyCtc: number;
  perDay: number;
  payableDays: number;
  lateDeductionDays: number;
  effectiveDays: number;    // payableDays - lateDeductionDays
  gross: number;
  pt: number;
  tds: number;
  advances: number;
  pendingBalanceIn: number;
  net: number;
}

const PT_AMOUNT = 200;
const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export function computeSalary(input: SalaryInput): SalaryBreakdown {
  const monthlyCtc = round2(input.annualCtc / 12);
  const perDay = input.daysInMonth > 0 ? monthlyCtc / input.daysInMonth : 0;
  const lateDeductionDays = Math.floor(input.lateMarksInMonth / 3) * 0.5;
  const effectiveDays = input.payableDays - lateDeductionDays;
  const gross = round2(perDay * effectiveDays);
  const pt = input.ptExempt ? 0 : PT_AMOUNT;
  const net = round2(gross - pt - input.tdsMonthly - input.advances + input.pendingBalanceIn);
  return {
    monthlyCtc,
    perDay: round2(perDay),
    payableDays: input.payableDays,
    lateDeductionDays,
    effectiveDays,
    gross,
    pt,
    tds: input.tdsMonthly,
    advances: input.advances,
    pendingBalanceIn: input.pendingBalanceIn,
    net,
  };
}
