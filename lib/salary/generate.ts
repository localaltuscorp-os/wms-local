import "server-only";
import {
  type SalaryInput,
  type SalaryBreakdown,
  computeSalary,
  computeHourlySalary,
  computeFixedFeeSalary,
  computeScheduleHourlySalary,
} from "@/lib/salary/compute";
import {
  type WorkerType,
  type PayBasis,
  earnsOvertime,
  payBasisFor,
  hourlyMonthlyAnchor,
} from "@/lib/attendance/worker-type";
import { daysInMonth, fyForMonth } from "@/lib/salary/period";
import {
  listSalaryProfiles,
  getAttendanceSheetPayableMap,
  sumAdvances,
  lastDisbursedRemainder,
} from "@/lib/queries/salary";
import { getMonthDashboard } from "@/lib/queries/attendance-status";
import { getMonthDashboardMerged } from "@/lib/queries/attendance-sheet-report";
import { localDateString } from "@/lib/format";
import { isPtExempt } from "@/lib/salary/pt-policy";

/**
 * Attendance-source cutover. Months on/after this use the app's own PUNCH
 * attendance (attendance_logs → the grader), integrating the sheet-imported
 * history (synthetic 10:30/19:30 punches through 2026-07-10) with real punches
 * from 2026-07-11 onward. Earlier months keep computing from the frozen,
 * already-paid HR sheet mirror — never re-derived, so historical pay is stable.
 */
export const SALARY_PUNCH_CUTOVER = "2026-07";

export interface MonthInputRow {
  employeeId: string;
  name: string;
  fy: string;
  month: string; // YYYY-MM
  daysInMonth: number;
  annualCtc: number;
  hasProfile: boolean; // false → no pay config for this basis; caller flags "attendance-only"
  input: SalaryInput; // ready for computeSalary (monthly_ctc path)
  // Worker types (0177) — which pay basis to compute + the basis-specific inputs.
  workerType: WorkerType;
  payBasis: PayBasis;
  workedMinutes: number; // actual worked minutes this month (hourly basis)
  /**
   * Expected hours = elapsed working days × daily target (holidays/offs excluded)
   * — the SAME "required hours" the Attendance page measures overtime against.
   * Overtime pay is worked beyond this. Present only for app-graded months (it
   * comes from the live grader); absent months fall back to the calendar target.
   */
  overtimeThresholdHours?: number;
  hourlyProfile: { monthlyPayAtTarget: number; weeklyTargetHours: number };
  feeProfile: { monthlyFee: number };
  /**
   * SCHEDULE-BASED HOURLY PAYROLL (spec §1/§13/§14).
   *
   * Present only for app-graded months (SALARY_PUNCH_CUTOVER onward). When set,
   * pay is `floor(payableHours) × (monthlySalary ÷ monthlyTargetHours)` instead
   * of the old `per-day rate × payable days`. Absent on frozen historical
   * months, which deliberately keep computing exactly as they were paid.
   */
  payroll?: {
    monthlyTargetHours: number;
    payableHoursRaw: number;
    dailyTargetHours: number;
    chargeableHalfDays: number;
    /**
     * Month-end surplus that survived covering every short week, in hours.
     * Raw and worker-type-blind: whether it becomes MONEY is decided below by
     * `earnsOvertime`. A full-timer accrues exactly the same surplus and simply
     * is not paid for it.
     */
    netSurplusHours: number;
  };
}

/** Route a MonthInputRow to the correct pure pay function by its basis. */
export function computeForRow(r: MonthInputRow): SalaryBreakdown {
  // ── HOURLY PAY — everyone but a full-timer (Sir, 2026-08) ─────────────────
  // The rate divides by the month's ELIGIBLE target (holidays and weekly offs
  // removed — the same figure the full-time engine divides by), so an hourly
  // shift that clears every eligible hour of a holiday-shortened month is paid
  // the FULL monthly figure, with surplus beyond that target paid on top at
  // the same rate. computeHourlySalary itself guards the degenerate case
  // (a sparsely-graded month falls back to the calendar target so the rate
  // cannot explode) — see the guard inside it.
  if (r.payBasis === "hourly") {
    return computeHourlySalary({
      monthlyPayAtTarget: hourlyMonthlyAnchor({
        annualCtc: r.annualCtc,
        monthlyPayAtTarget: r.hourlyProfile.monthlyPayAtTarget,
      }),
      weeklyTargetHours: r.hourlyProfile.weeklyTargetHours,
      daysInMonth: r.daysInMonth,
      workedMinutes: r.workedMinutes,
      // Interns / hourly shifts are paid for hours worked beyond the eligible
      // target too — the same requirement attendance graded for the month.
      overtimeEligible: earnsOvertime(r.workerType),
      eligibleTargetHours:
        r.payroll && r.payroll.monthlyTargetHours > 0 ? r.payroll.monthlyTargetHours : null,
      overtimeThresholdHours: r.overtimeThresholdHours,
      ptExempt: r.input.ptExempt,
      tdsMonthly: r.input.tdsMonthly,
      advances: r.input.advances,
      pendingBalanceIn: r.input.pendingBalanceIn,
    });
  }

  // ── SCHEDULE-BASED PAY for the salaried full-timer (spec §14) ─────────────
  // Only monthly-CTC staff reach here. Applies when the month carries a
  // schedule-derived payroll view (app-graded months); frozen historical months
  // fall through to the legacy day-based path below and are never re-derived.
  if (r.payroll && r.payBasis === "monthly_ctc" && r.payroll.monthlyTargetHours > 0) {
    return computeScheduleHourlySalary({
      monthlySalary: r.annualCtc / 12,
      monthlyTargetHours: r.payroll.monthlyTargetHours,
      payableHoursRaw: r.payroll.payableHoursRaw,
      chargeableHalfDays: r.payroll.chargeableHalfDays,
      dailyTargetHours: r.payroll.dailyTargetHours,
      // A full-timer earns no cash overtime — the surplus stays credit against a
      // short week in the same month, so pass 0.
      overtimeHours: earnsOvertime(r.workerType) ? r.payroll.netSurplusHours : 0,
      ptExempt: r.input.ptExempt,
      tdsMonthly: r.input.tdsMonthly,
      advances: r.input.advances,
      pendingBalanceIn: r.input.pendingBalanceIn,
    });
  }
  if (r.payBasis === "fixed_fee") {
    return computeFixedFeeSalary({
      monthlyFee: r.feeProfile.monthlyFee,
      tdsMonthly: r.input.tdsMonthly,
      advances: r.input.advances,
      pendingBalanceIn: r.input.pendingBalanceIn,
    });
  }
  return computeSalary(r.input);
}

/** Assemble per-employee salary-compute inputs for a YYYY-MM month from the
 *  attendance summary + each employee's profile + advances + carry-forward.
 *  DB reads only — no writes. */
export async function assembleMonthInputs(month: string): Promise<MonthInputRow[]> {
  const dim = daysInMonth(month);
  const fy = fyForMonth(month);
  const today = localDateString("Asia/Kolkata");
  const [y, m] = month.split("-").map(Number) as [number, number];

  // Resolve payableDays (+ late marks) per employee from the ACTIVE source, so
  // salary always matches what the attendance report shows for that month:
  //  • August 2026 onward → the app punch grader (attendance_logs): live
  //    attendance, late-mark deductions apply.
  //  • July 2026 (the transition month) → the MERGED view (getMonthDashboardMerged
  //    = the report's own source: LOCKED sheet counts for sheet people + app-native
  //    graded joiners). This makes July salary == the July attendance report.
  //  • earlier → the frozen HR sheet mirror (totalDaysWorked), never re-derived,
  //    so already-paid historical pay is stable.
  // Resolve payableDays (+ late) per employee so salary always matches what the
  // ATTENDANCE REPORT shows for the month:
  //  • August 2026 onward → the app punch grader (real attendance_logs).
  //  • July 2026 → the MERGED view (`getMonthDashboardMerged` = the report's own
  //    source: locked sheet days for sheet people + app-graded joiners). Sir's
  //    call: July salary follows the July attendance report's PAYABLE column
  //    (not the old salary sheet), even though it's higher.
  //  • earlier → the frozen HR sheet mirror, never re-derived (paid history stable).
  // Late-mark payable deductions apply ONLY from the app-native era (Aug 2026+).
  // July is the transition month: its payable comes from the MERGED report, whose
  // grader already reflects lateness by grading late arrivals as half-days — so a
  // second late deduction here would double-count and push FINAL DAYS below the
  // attendance PAYABLE the user compares against. For July, FINAL DAYS == PAYABLE.
  // SUPERSEDED by Sir's HOURS RULE (2026-08): payable days are now earned from
  // WORKED HOURS (9h = 1 day, 54h = a full week — lib/attendance/hours-rule.ts).
  // A late arrival or an early exit already lands as fewer worked hours and
  // therefore fewer payable days, so charging the old "every 3 marks = ½ day"
  // cut on top would deduct twice for the same event. Late marks are still
  // COUNTED and shown on the attendance surfaces as information.
  const applyLate = false;
  const profiles = await listSalaryProfiles();
  // payableDays + late for day-based pay, plus workedMinutes for hourly (part-
  // time) pay — both come from the same attendance summary.
  let payableFor: (id: string) => { payableDays: number; late: number; workedMinutes: number };
  /**
   * Schedule-derived payroll view, per employee (spec §13). Populated ONLY for
   * app-graded months — the frozen sheet era keeps its day-based figures so
   * already-paid history never moves.
   */
  let payrollFor: (id: string) => MonthInputRow["payroll"] = () => undefined;
  // Expected (required) hours per employee — elapsed working days × daily target,
  // the SAME figure the Attendance page's plus-minus/overtime reads. Overtime pay
  // is worked beyond this, so My Salary and Attendance report one number.
  let otThresholdFor: (id: string) => number | undefined = () => undefined;
  if (month >= "2026-08") {
    const dash = await getMonthDashboard(y, m, today);
    const byId = new Map(dash.map((r) => [r.employeeId, r.summary]));
    const payrollById = new Map(dash.map((r) => [r.employeeId, r.payroll]));
    payableFor = (id) => ({ payableDays: byId.get(id)?.payableDays ?? 0, late: byId.get(id)?.late ?? 0, workedMinutes: byId.get(id)?.totalWorkedMinutes ?? 0 });
    otThresholdFor = (id) => {
      const pr = payrollById.get(id);
      if (!pr) return undefined;
      return pr.requiredElapsedMinutes / 60;
    };
    payrollFor = (id) => {
      const pr = payrollById.get(id);
      if (!pr) return undefined;
      return {
        monthlyTargetHours: pr.targetHours,
        // Precise hours in, rounded DOWN inside computeScheduleHourlySalary —
        // the exact figure stays available for reporting (spec §2).
        payableHoursRaw: pr.payableMinutesRaw / 60,
        dailyTargetHours: pr.dailyTargetMinutes / 60,
        chargeableHalfDays: pr.chargeableHalfDays,
        // Netted across the WHOLE month by `payableHoursForMonth` — a short week
        // cancels a long one, so this is genuine extra time rather than a swing.
        netSurplusHours: pr.netSurplusMinutes / 60,
      };
    };
  } else if (month === "2026-07") {
    const dash = await getMonthDashboardMerged(y, m, today);
    const byId = new Map(dash.map((r) => [r.employeeId, r.summary]));
    payableFor = (id) => ({ payableDays: byId.get(id)?.payableDays ?? 0, late: byId.get(id)?.late ?? 0, workedMinutes: byId.get(id)?.totalWorkedMinutes ?? 0 });
  } else {
    const sheet = await getAttendanceSheetPayableMap(month);
    payableFor = (id) => ({ payableDays: sheet.get(id)?.totalDaysWorked ?? 0, late: 0, workedMinutes: 0 });
  }

  const rows: MonthInputRow[] = [];
  for (const p of profiles) {
    const { payableDays, late, workedMinutes } = payableFor(p.employeeId);
    const payroll = payrollFor(p.employeeId);
    const payBasis = payBasisFor(p.workerType);
    // part-timers are hourly and earn below the PT threshold → PT-exempt.
    const ptExempt = payBasis === "hourly" ? true : isPtExempt({
      employeeId: p.employeeId,
      designationName: p.designationName,
    });
    const [advances, pendingBalanceIn] = await Promise.all([
      sumAdvances(p.employeeId, month),
      lastDisbursedRemainder(p.employeeId, month),
    ]);
    // "hasProfile" = there's enough pay config to compute for THIS basis.
    const hasProfile =
      payBasis === "hourly" ? hourlyMonthlyAnchor({ annualCtc: p.annualCtc, monthlyPayAtTarget: p.monthlyPayAtTargetRaw ?? 0 }) > 0
      : payBasis === "fixed_fee" ? p.monthlyFee > 0
      : p.annualCtc > 0;
    rows.push({
      employeeId: p.employeeId,
      name: p.name,
      fy,
      month,
      daysInMonth: dim,
      annualCtc: p.annualCtc,
      hasProfile,
      payroll,
      input: {
        annualCtc: p.annualCtc,
        payableDays,
        daysInMonth: dim,
        ptExempt,
        tdsMonthly: p.tdsMonthly,
        lateMarksInMonth: applyLate ? late : 0,
        advances,
        pendingBalanceIn,
      },
      workerType: p.workerType,
      payBasis,
      workedMinutes,
      overtimeThresholdHours: otThresholdFor(p.employeeId),
      // RAW pay-at-target (null → 0) so the anchor can fall back to CTC/12 only
      // when it is genuinely unset — the admin's set value always wins.
      hourlyProfile: { monthlyPayAtTarget: p.monthlyPayAtTargetRaw ?? 0, weeklyTargetHours: p.weeklyTargetHours },
      feeProfile: { monthlyFee: p.monthlyFee },
    });
  }
  return rows;
}
