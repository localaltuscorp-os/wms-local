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

export type PayBasis = "monthly_ctc" | "hourly" | "fixed_fee";

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
  // Which formula produced this breakdown + the basis-specific figures the
  // payslip renders. Optional so the day-based (monthly_ctc) shape is unchanged.
  basis?: PayBasis;
  workedHours?: number;     // hourly
  targetHours?: number;     // hourly: 27 × daysInMonth/7
  hourlyRate?: number;      // hourly
  fee?: number;             // fixed_fee
  /** Hours paid ON TOP of the target (0 for worker types that earn no overtime). */
  overtimeHours?: number;
  /** ₹ for those hours, at the same hourly rate. Included in `gross`. */
  overtimeAmount?: number;
}

// Part-time hourly input. Pay = min(rate × actual hours, monthlyPayAtTarget),
// where rate = monthlyPayAtTarget / (weeklyTargetHours × daysInMonth/7).
export interface HourlySalaryInput {
  monthlyPayAtTarget: number; // ₹ at full target (e.g. 3500)
  weeklyTargetHours: number;  // e.g. 27
  daysInMonth: number;        // 28–31
  workedMinutes: number;      // actual minutes worked this month
  /**
   * Pay hours worked BEYOND the expected hours at the same hourly rate — the
   * intern/hourly-shift overtime. When false (or omitted), pay stays capped at
   * monthlyPayAtTarget. `base + overtime` equals `rate × hoursWorked` for the
   * eligible, so a long month is paid for every hour of it.
   */
  overtimeEligible?: boolean;
  /**
   * The month's ELIGIBLE target hours — the schedule-derived requirement with
   * holidays and weekly offs already removed (`payroll.monthlyTargetHours`,
   * the same figure the full-time engine divides by). When present, the RATE
   * divides by THIS and the surplus is measured beyond it, so completing the
   * eligible month pays the FULL monthly figure: a holiday raises the rate
   * instead of silently shaving the base (spec §12/§16 — "predefined holidays
   * must not create artificial missing-hour deficits"). Before this input the
   * rate divided by the raw calendar target, and an employee who cleared every
   * eligible hour of a holiday-shortened month was told their "base earned"
   * was less than their salary.
   */
  eligibleTargetHours?: number | null;
  /**
   * Fallback surplus threshold when `eligibleTargetHours` is absent — the
   * elapsed "required hours" the Attendance page shows. Only the surplus split
   * reads it; the rate then divides by the calendar target.
   */
  overtimeThresholdHours?: number;
  ptExempt: boolean;
  tdsMonthly: number;
  advances: number;
  pendingBalanceIn: number;
}

// Project/remote fixed fee. Gross = the retainer, unaffected by attendance.
export interface FixedFeeSalaryInput {
  monthlyFee: number;
  tdsMonthly: number;
  advances: number;
  pendingBalanceIn: number;
}

const PT_AMOUNT = 200;
const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * THE canonical hourly rate for an hourly-paid (shift) worker — the ONE place
 * this division lives (spec §10). Anchored to the FULL calendar realisation of
 * the configured weekly target (`weeklyTargetHours × daysInMonth / 7`) so the
 * rate stays steady through the month whatever the schedule graded: a
 * schedule-less part-timer has no fixed days to grade Absent, and dividing by
 * a reconciled target would let a light month price almost like a full one.
 *
 * Every surface that shows or spends a shift-worker's rate — payroll
 * (computeHourlySalary), the Monday week-loss pricing, the admin profile
 * dialog's preview — must call this, never re-derive it.
 */
export function calendarHourlyRate(
  monthlyAnchor: number,
  weeklyTargetHours: number,
  daysInMonth: number,
): number {
  const targetHours = weeklyTargetHours * (daysInMonth / 7);
  return targetHours > 0 ? monthlyAnchor / targetHours : 0;
}

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
    basis: "monthly_ctc",
  };
}

/**
 * Part-time / hourly-shift pay: hours worked × a rate anchored to the monthly
 * target. Base pay is capped at the monthly figure; for staff who earn overtime
 * (interns / hourly shifts) hours beyond the target are paid at the SAME rate on
 * top of the cap, so `base + overtime = rate × hoursWorked` and a long month is
 * paid in full. Without overtime eligibility the cap stands.
 */
export function computeHourlySalary(i: HourlySalaryInput): SalaryBreakdown {
  const calendarTarget = i.weeklyTargetHours * (i.daysInMonth / 7);

  // THE ELIGIBLE TARGET IS THE DENOMINATOR when the month has one — mirroring
  // computeScheduleHourlySalary, where a holiday-shrunk target RAISES the rate
  // so a complete month still pays the full figure. GUARD: a degenerate
  // reconciled target (sparse grading — the "schedule-less part-timer" whose
  // absent days never grade) must not explode the rate, so anything under half
  // the calendar realisation falls back to the calendar target.
  const eligible =
    i.eligibleTargetHours != null &&
    i.eligibleTargetHours >= calendarTarget * 0.5 &&
    i.eligibleTargetHours > 0
      ? i.eligibleTargetHours
      : null;
  const rateTargetHours = eligible ?? calendarTarget;
  const hourlyRate = rateTargetHours > 0 ? i.monthlyPayAtTarget / rateTargetHours : 0;
  // PAY FOR WHOLE HOURS ONLY (spec §18) — the same floor the full-time engine
  // applies: 53.8h and 53.9h both pay 53h. The precise figure is still reported.
  const workedHours = Math.floor(i.workedMinutes / 60);

  // Surplus hours are worked beyond the eligible target (or, without one, the
  // elapsed expected hours the Attendance page shows). Priced at the SAME
  // rate — additional payable hours, never an "OT" premium. With the eligible
  // target, base = rate × min(worked, target) tops out at EXACTLY the monthly
  // figure the moment the month is complete.
  const expectedHours =
    eligible ??
    (i.overtimeThresholdHours != null && i.overtimeThresholdHours > 0
      ? i.overtimeThresholdHours
      : rateTargetHours);
  const overtimeHours = i.overtimeEligible ? Math.max(0, workedHours - expectedHours) : 0;
  const overtimeAmount = round2(hourlyRate * overtimeHours);

  // Surplus-eligible staff are paid for every whole hour worked (base + surplus
  // = rate × workedHours); the monthly cap only bounds workers who earn none.
  const gross = i.overtimeEligible
    ? round2(hourlyRate * workedHours)
    : round2(Math.min(hourlyRate * workedHours, i.monthlyPayAtTarget));

  const pt = i.ptExempt ? 0 : PT_AMOUNT;
  const net = round2(gross - pt - i.tdsMonthly - i.advances + i.pendingBalanceIn);
  return {
    monthlyCtc: 0, perDay: 0, payableDays: 0, lateDeductionDays: 0, effectiveDays: 0,
    gross, pt, tds: i.tdsMonthly, advances: i.advances, pendingBalanceIn: i.pendingBalanceIn, net,
    // targetHours is the EXPECTED hours (what "Required Hours" shows) so the My
    // Salary card reconciles worked − required = overtime, same as Attendance.
    basis: "hourly", workedHours: round2(workedHours), targetHours: round2(expectedHours), hourlyRate: round2(hourlyRate),
    overtimeHours: round2(overtimeHours), overtimeAmount,
  };
}

/** Project/remote fixed fee — attendance never changes the amount. */
export function computeFixedFeeSalary(i: FixedFeeSalaryInput): SalaryBreakdown {
  const gross = round2(i.monthlyFee);
  const net = round2(gross - i.tdsMonthly - i.advances + i.pendingBalanceIn);
  return {
    monthlyCtc: 0, perDay: 0, payableDays: 0, lateDeductionDays: 0, effectiveDays: 0,
    gross, pt: 0, tds: i.tdsMonthly, advances: i.advances, pendingBalanceIn: i.pendingBalanceIn, net,
    basis: "fixed_fee", fee: gross,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
   SCHEDULE-BASED HOURLY PAY (spec §1/§2/§14)

   Replaces "full-day deduction × absent days" as the primary payroll method:

       hourlyRate = monthlySalary ÷ monthlyTargetHours
       gross      = floor(payableHours) × hourlyRate

   `monthlyTargetHours` is DERIVED FROM THE EMPLOYEE'S SCHEDULE with weekly offs
   and declared holidays already removed (lib/attendance/hour-balance.ts →
   payableHoursForMonth), so it moves with the calendar. A month with one extra
   holiday has a smaller target, and the employee is not docked for hours that
   were never expected of them.

   Works for full-time and part-time alike — the formula is identical, only the
   inputs differ (₹40,000 over 216h vs ₹3,500 over 108h). Project/remote staff
   keep `computeFixedFeeSalary`: a retainer is not hours.
   ──────────────────────────────────────────────────────────────────────────── */

export interface ScheduleHourlyInput {
  /** Monthly salary at full target — CTC/12 for full-time, the agreed monthly
   *  pay for part-time. */
  monthlySalary: number;
  /** Schedule-derived target for THIS month, holidays + weekly offs excluded. */
  monthlyTargetHours: number;
  /** Final payable hours BEFORE rounding (the caller keeps the precise value
   *  for reporting; this function is what rounds it down for money). */
  payableHoursRaw: number;
  /** Half-days charged this month (the 4th onward — the first 3 are waived). */
  chargeableHalfDays: number;
  /** One scheduled day in hours, for pricing a chargeable half-day. */
  dailyTargetHours: number;
  /**
   * Hours to pay ON TOP of the target — the month-end surplus that survived
   * covering every short week (`MonthReconciliation.monthlyHourBalanceMinutes`).
   *
   * ALREADY NETTED AND ALREADY GATED by the caller: `generate.ts` passes 0 for
   * any worker type that earns no overtime, so this function does not need to
   * know who is an intern. A 25h week followed by a 29h week nets to zero here
   * and pays nothing extra, because the surplus was consumed covering the
   * shortfall before it ever reached this input.
   *
   * OPTIONAL, defaulting to none: a caller that predates overtime — or one that
   * simply has no view of it — must keep computing exactly the pay it computed
   * before, never a NaN or an accidental bonus.
   */
  overtimeHours?: number;
  ptExempt: boolean;
  tdsMonthly: number;
  advances: number;
  pendingBalanceIn: number;
}

export function computeScheduleHourlySalary(i: ScheduleHourlyInput): SalaryBreakdown {
  const hourlyRate =
    i.monthlyTargetHours > 0 ? i.monthlySalary / i.monthlyTargetHours : 0;

  // ROUND DOWN to a whole hour (spec §2): 53.8h and 53.9h both pay 53h.
  // `Math.max(0, …)` because a negative balance must never invert the sign.
  const payableHours = Math.max(0, Math.floor(i.payableHoursRaw));

  // Each chargeable half-day costs half a scheduled day, priced at the same
  // hourly rate so one rule governs all money in this function.
  const halfDayPenaltyHours = i.chargeableHalfDays * (i.dailyTargetHours / 2);
  const paidHours = Math.max(0, payableHours - halfDayPenaltyHours);

  // The BASE is capped at the monthly salary: hours banked beyond target are
  // already capped per-week upstream, so nobody drifts above their salary just
  // by working long days.
  const base = Math.min(hourlyRate * paidHours, i.monthlySalary);

  // Overtime is added OUTSIDE that cap, and it must be — the cap is the whole
  // reason an over-target month would otherwise pay exactly the same as an
  // on-target one. Same hourly rate, no premium.
  const overtimeHours = Math.max(0, i.overtimeHours ?? 0);
  const overtimeAmount = round2(hourlyRate * overtimeHours);
  const gross = round2(base + overtimeAmount);
  const pt = i.ptExempt ? 0 : PT_AMOUNT;
  const net = round2(gross - pt - i.tdsMonthly - i.advances + i.pendingBalanceIn);

  return {
    monthlyCtc: round2(i.monthlySalary),
    perDay: 0,
    payableDays: 0,
    lateDeductionDays: 0,
    effectiveDays: 0,
    gross,
    pt,
    tds: i.tdsMonthly,
    advances: i.advances,
    pendingBalanceIn: i.pendingBalanceIn,
    net,
    basis: "hourly",
    workedHours: round2(paidHours),
    targetHours: round2(i.monthlyTargetHours),
    hourlyRate: round2(hourlyRate),
    overtimeHours: round2(overtimeHours),
    overtimeAmount,
  };
}
