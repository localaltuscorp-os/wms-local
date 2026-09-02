/**
 * Attendance PERIOD summary — the numbers Sir wants on the self-view + salary:
 * "how many of how many days present, late, early, half-days, hours/day, and how
 * much salary got reduced." Pure so it's unit-testable; the query layer feeds it
 * pre-computed per-day results (from computeDayCode) + the per-day salary rate.
 *
 * The period-level rule lives HERE (it is not per-day):
 *  • HOURS RULE (2026-08, supersedes the old all-or-nothing 54h waiver): a week's
 *    ORDINARY attendance days are earned from worked hours at 9h per day — 54h
 *    earns a full 6-day week, 45h earns 5 days, and everything in between is
 *    proportional to the nearest half day. Credited days (paid leave, comp-off,
 *    holidays, weekly off, holiday-working) keep their own value. The shared
 *    implementation is lib/attendance/hours-rule.ts, which the SALARY engine
 *    reads too, so the self-view and the payslip can never disagree.
 *  • The older "every 3 late/early marks costs ½ day" deduction is retired: the
 *    hours already capture a late arrival or an early exit, so deducting again
 *    would charge twice for one event. Marks are still surfaced as information.
 */
import type { DayCodeResult } from "./status";
import {
  daysFromMinutes,
  isOrdinaryAttendanceDay,
  WEEK_TARGET_MINUTES,
} from "./hours-rule";

export { WEEK_TARGET_MINUTES };

export interface SummaryDay {
  /** yyyy-mm-dd (IST). */
  date: string;
  /** Monday of this day's week, yyyy-mm-dd — the 54h-waiver bucket. */
  weekKey: string;
  /** Off / holiday days don't count toward working days or marks. */
  offDay: boolean;
  /** True once the day is in the past (don't count future days of the month). */
  elapsed: boolean;
  result: DayCodeResult;
}

export interface AttendanceSummary {
  workingDays: number; // elapsed, non-off days expected in
  presentDays: number; // Σ day value AFTER the weekly waiver (full 1 / half 0.5)
  lateDays: number; // late-check-in marks after waiver
  earlyDays: number; // early-check-out marks after waiver
  halfDays: number; // half-day marks after waiver
  absentDays: number; // full absences
  workedHours: number; // total, 1-dp
  avgHoursPerDay: number; // over days present, 1-dp
  markDeductionDays: number; // floor((late+early)/3) × 0.5
  deductionDays: number; // (workingDays − presentDays) + markDeductionDays
  payableDays: number; // workingDays − deductionDays (before any wave-off)
  salaryReduced: number; // deductionDays × perDayRate, rounded
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function summarize(days: SummaryDay[], perDayRate: number): AttendanceSummary {
  // Group the elapsed, non-off days by week so we can test the 54h target.
  const byWeek = new Map<string, SummaryDay[]>();
  for (const d of days) {
    if (d.offDay || !d.elapsed) continue;
    const arr = byWeek.get(d.weekKey);
    if (arr) arr.push(d);
    else byWeek.set(d.weekKey, [d]);
  }

  let workingDays = 0;
  let presentDays = 0;
  let lateDays = 0;
  let earlyDays = 0;
  let halfDays = 0;
  let absentDays = 0;
  let workedMinutes = 0;

  for (const [, week] of byWeek) {
    // Sir's HOURS RULE — the week's ORDINARY attendance days are earned from
    // worked hours (9h = 1 day, so 54h = a full 6-day week, 45h = 5 days);
    // credited days (PL / CO / holiday / W-O / holiday-working) keep their own
    // value. See lib/attendance/hours-rule.ts — the salary engine reads the
    // identical rule, so this page and the payslip can never disagree.
    let ordinaryMinutes = 0;
    let ordinaryDays = 0;

    for (const d of week) {
      workingDays += 1;
      workedMinutes += d.result.workedMinutes;
      const isAbsent = d.result.code === "A";
      const isHalf = d.result.dayValue === 0.5;

      if (isOrdinaryAttendanceDay(d.result.code)) {
        ordinaryMinutes += d.result.workedMinutes;
        ordinaryDays += 1;
      } else {
        presentDays += d.result.dayValue;
      }

      // Marks stay VISIBLE (they tell the employee what happened) but no longer
      // drive a deduction — short hours are already reflected in the day-count.
      if (isAbsent) absentDays += 1;
      if (isHalf) halfDays += 1;
      if (d.result.late && !d.result.lateWaived) lateDays += 1;
      if (d.result.leftEarly && !d.result.lateWaived) earlyDays += 1;
    }

    presentDays += daysFromMinutes(ordinaryMinutes, ordinaryDays);
  }

  // The old "every 3 marks costs ½ day" cut is SUBSUMED by the hours rule: a late
  // arrival or early exit already shows up as fewer worked hours, so charging for
  // it again would deduct twice for one event.
  const markDeductionDays = 0;
  presentDays = Math.round(presentDays * 2) / 2;
  const deductionDays = Math.max(0, workingDays - presentDays);
  const payableDays = presentDays;
  const salaryReduced = Math.round(deductionDays * perDayRate);
  const daysCounted = presentDays > 0 ? presentDays : 1;

  return {
    workingDays,
    presentDays: round1(presentDays),
    lateDays,
    earlyDays,
    halfDays,
    absentDays,
    workedHours: round1(workedMinutes / 60),
    avgHoursPerDay: round1(workedMinutes / 60 / daysCounted),
    markDeductionDays,
    deductionDays: round1(deductionDays),
    payableDays: round1(payableDays),
    salaryReduced,
  };
}
