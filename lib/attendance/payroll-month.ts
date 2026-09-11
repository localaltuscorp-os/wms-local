// ONE EMPLOYEE, ONE MONTH, THE PAYROLL VIEW OF IT — the bridge every pay
// surface crosses between graded attendance and money.
//
// Pure (no DB, no Date) so it is unit-testable and so every caller reads one
// implementation.
//
// ── WHY THIS FILE EXISTS ───────────────────────────────────────────────────
// The sequence below — filter the graded days, reconcile the weeks, derive
// payable hours, measure the elapsed requirement — was written out THREE times
// against the same functions:
//
//   lib/queries/attendance-status.ts  getMonthDashboard's per-employee payroll
//                                     block (the one the salary engine reads)
//   lib/queries/attendance-summary.ts salaryLostForMonth  (the Attendance KPI)
//   lib/queries/attendance-summary.ts graceForMonth       (half-day grace)
//
// Three copies of an ordering that MATTERS: `payableHoursForMonth` takes the
// reconciliation as an input, the reconciliation takes the employee's resolved
// config, and the config decides what a day is worth. Get the sequence subtly
// wrong in one copy and that surface quietly prices a different month than the
// payslip does — which is the class of bug this codebase has already paid for
// more than once (see the notes in effective-config.ts and hours-rule.ts).
//
// So the sequence lives here, once, and the callers pass their day list in.
//
// ── WHAT IT DOES NOT DO ────────────────────────────────────────────────────
// No money. This module reports HOURS and DAYS; `lib/salary/compute.ts` prices
// them. That separation is deliberate and pre-existing (see spec §11 in
// hour-balance.ts) and is kept exactly as it was.

import {
  monthKeyOf,
  payableHoursForMonth,
  reconcileMonth,
  type GradedDayInput,
  type MonthReconciliation,
  type PayableHoursResult,
} from "./hour-balance";
import { expectsScheduledHours, weekKeyOf } from "./hours-rule";
import { payableDayValue } from "@/lib/salary/compute";
import type { EffectiveAttendanceConfig } from "./effective-config";

/**
 * The first month whose pay is derived from PUNCH-GRADED HOURS.
 *
 * Earlier months are frozen: their pay was computed the old day-based way from
 * the HR sheet mirror and has already been disbursed, so re-deriving them from
 * today's grader, today's schedule and today's holiday list would rewrite
 * history. Three files carried this string as a literal — the dashboard's
 * payroll gate, the Attendance KPI's "salary lost" gate and the breakup sync —
 * and a fourth (the daily salary report) would have made four. One name now.
 *
 * `SALARY_PUNCH_CUTOVER` in lib/salary/generate.ts is a DIFFERENT and earlier
 * boundary (2026-07, when synthetic sheet punches gave way to real ones); it is
 * about where the punches come from, not about which pay model applies.
 */
export const PAYROLL_HOURS_FROM = "2026-08";

/** Is this month's pay derived from graded hours rather than frozen history? */
export function isHoursPayrollMonth(month: string): boolean {
  return month >= PAYROLL_HOURS_FROM;
}

/**
 * The sentinel for days before the employee joined. Restated here rather than
 * imported so this module stays free of the server-only query layer — it is a
 * one-character constant and `lib/queries/attendance-status.ts` asserts the two
 * agree (see NOT_JOINED_CODE there).
 */
const NOT_JOINED = "–";

/** A graded day, as much of one as the payroll view needs. */
export interface PayrollDayInput {
  /** yyyy-mm-dd */
  logDate: string;
  code: string;
  dayValue: number;
  workedMinutes: number;
  late: boolean;
  leftEarly: boolean;
  isWeeklyOff: boolean;
}

/** The payroll-facing slice of a graded month, per employee. */
export interface EmployeePayrollMonth extends PayableHoursResult {
  /** One scheduled day in minutes (9h full-time, 5h part-time). */
  dailyTargetMinutes: number;
  /** Hours REQUIRED so far = elapsed working days × daily target (holidays/offs
   *  excluded) — the self-view's requiredElapsedHours. Overtime is worked beyond
   *  this, so My Salary and the Attendance page report one overtime figure. */
  requiredElapsedMinutes: number;
  /** Half-days charged at 50% — the 4th onward; the first three are waived. */
  chargeableHalfDays: number;
  /**
   * Days of approved UNPAID leave. Carried alongside the hours rather than
   * folded into them: an LWP day leaves the TARGET (so no hour deficit is
   * invented and nothing is marked absent) and is charged ONCE by the salary
   * engine — see `payableHoursForMonth` and `computeScheduleHourlySalary`.
   */
  unpaidLeaveDays: number;
  /** Surplus/deficit carried inside this calendar month only. */
  monthlyHourBalanceMinutes: number;
  /**
   * Σ day-values over the ELAPSED days of the month — the full-timer's pay
   * input (spec §4). `computeDailySalary` multiplies it by
   * `monthlySalary ÷ calendarDaysInMonth`.
   *
   * A complete 31-day month sums to 31 and pays the salary exactly, because
   * weekly offs, holidays, paid leave and comp-off are all worth a full day and
   * only absence and unpaid leave are worth nothing.
   */
  payableDayValue: number;
  /**
   * How many gradeable days of this month have ELAPSED.
   *
   * The denominator that makes `payableDayValue` legible: a month is complete
   * when the two are equal, and the gap between them is what was missed. Read
   * by the finance dashboard so "salary lost" is measured over the days that
   * have happened rather than over a whole month that has not.
   */
  elapsedGradedDays: number;
}

/** Everything the sequence produced, so a caller can read any stage of it. */
export interface PayrollMonthView {
  /** yyyy-mm */
  month: string;
  /** The gradeable days, in the shape the hour engine takes. */
  graded: GradedDayInput[];
  /** Week-by-week reconciliation, including the signed carry. */
  recon: MonthReconciliation;
  /** Target / actual / payable hours for the month. */
  hours: PayableHoursResult;
  /** The flattened view the salary engine and the dashboard read. */
  payroll: EmployeePayrollMonth;
}

export interface PayrollMonthOptions {
  /** yyyy-mm, or any yyyy-mm-dd inside it. */
  month: string;
  /** This employee's resolved schedule + targets. */
  cfg: Pick<
    EffectiveAttendanceConfig,
    "weeklyTargetMinutes" | "waiverThresholdMinutes" | "workingDaysPerWeek" | "dailyTargetMinutes"
  >;
  /** "Today" (yyyy-mm-dd) — bounds `requiredElapsedMinutes` so a future working
   *  day is never counted as hours already owed. */
  refTodayISO: string;
}

/**
 * Reconcile one employee's month and derive its payable hours.
 *
 * `days` is whatever the caller wants included — the whole month for a payroll
 * or KPI figure, elapsed days only where a surface deliberately reports on the
 * month so far. Days before the employee joined are dropped here, always: they
 * are not gradeable, and every previous copy of this sequence dropped them too.
 */
export function payrollMonthFor(
  days: PayrollDayInput[],
  opts: PayrollMonthOptions,
): PayrollMonthView {
  const { cfg, refTodayISO } = opts;
  const month = monthKeyOf(opts.month.length > 7 ? opts.month : `${opts.month}-01`);

  // Days that are gradeable AND have happened. Both filters matter and they
  // are different questions: "not joined" is a day this person was not employed
  // for, "after today" is a day nobody has lived yet. Applying the elapsed bound
  // HERE rather than only inside `reconcileMonth` is what keeps
  // `payableHoursForMonth` in step with it — that function credits paid leave
  // and counts unpaid leave by walking the same list, and crediting a paid leave
  // booked for next Tuesday would pay for it today.
  const joined = days.filter((d) => d.code !== NOT_JOINED && d.logDate <= refTodayISO);
  const graded: GradedDayInput[] = joined.map((d) => ({
    date: d.logDate,
    weekKey: weekKeyOf(d.logDate),
    code: d.code,
    dayValue: d.dayValue,
    workedMinutes: d.workedMinutes,
    late: d.late,
    leftEarly: d.leftEarly,
  }));

  // `refTodayISO` bounds the reconciliation to the month SO FAR (spec §3): a
  // future working day has no punches, grades "A", and would otherwise owe a
  // full day's target the employee has not been asked for yet. A closed month's
  // days are all in the past, so nothing is excluded and it reconciles whole.
  const recon = reconcileMonth(graded, {
    month,
    weeklyTargetMinutes: cfg.weeklyTargetMinutes,
    waiverThresholdMinutes: cfg.waiverThresholdMinutes,
    workingDaysPerWeek: cfg.workingDaysPerWeek,
    refTodayISO,
  });
  const hours = payableHoursForMonth(graded, recon, cfg.dailyTargetMinutes);

  // Hours the employee was REQUIRED to work so far — elapsed working days ×
  // daily target — through the SAME shared predicate the self-view uses
  // (hours-rule.expectsScheduledHours) rather than a hand-copied code list.
  // Two copies of "which days owe hours" is two answers, and this one had
  // already drifted once: it counted a WORKED holiday as a required day, which
  // the salary target never did.
  // (`joined` is already bounded to elapsed days above, so there is no second
  // date test here — one rule, applied once.)
  const requiredElapsedMinutes =
    joined.filter((d) => !d.isWeeklyOff && expectsScheduledHours(d.code)).length *
    cfg.dailyTargetMinutes;

  return {
    month,
    graded,
    recon,
    hours,
    payroll: {
      ...hours,
      dailyTargetMinutes: cfg.dailyTargetMinutes,
      requiredElapsedMinutes,
      chargeableHalfDays: recon.chargeableHalfDays,
      unpaidLeaveDays: hours.unpaidLeaveDays,
      monthlyHourBalanceMinutes: recon.monthlyHourBalanceMinutes,
      // `joined` is already bounded to elapsed, gradeable days, so this is the
      // month SO FAR — the same set every other figure above was derived from.
      payableDayValue: payableDayValue(joined, refTodayISO),
      elapsedGradedDays: joined.length,
    },
  };
}
