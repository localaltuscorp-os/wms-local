import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { attendanceWeekAck, employees, salaryProfiles } from "@/db/schema";
import { NOT_JOINED_CODE, getEmployeeMonthStatus } from "@/lib/queries/attendance-status";
import { asWorkerType, hourlyMonthlyAnchor, payBasisFor } from "@/lib/attendance/worker-type";
import { calendarHourlyRate } from "@/lib/salary/compute";
import { weeklyTargetMinutesFor } from "@/lib/attendance/hours-rule";
import { resolveEffectiveConfig } from "@/lib/attendance/effective-config";
import {
  computeWeekLoss,
  reportedWeekFor,
  type WeekLoss,
  type WeekLossDay,
  type WeekLossPay,
} from "@/lib/attendance/week-loss";

/**
 * THE MONDAY REPORT — last week's attendance loss and money loss for one person,
 * plus whether they still owe an acknowledgement.
 *
 * Shown on the first punch of a new week (not strictly Monday: someone on leave
 * on Monday sees it the first day they actually punch), and the check-IN is
 * blocked until they dismiss it. See `app/(app)/attendance/actions.ts`.
 *
 * ── FAIL-OPEN, ALWAYS ──────────────────────────────────────────────────────
 * Every function here degrades to "nothing to show / already acknowledged"
 * rather than throwing. This module sits on the daily-critical punch path, and
 * this codebase has already paid for the alternative once: see the note in
 * app/(app)/attendance/page.tsx about 2026-07-27, when a database hiccup in a
 * gate locked the workforce out of attendance. A report that cannot be computed
 * must never be a locked door.
 */

/** The report plus the state the gate and the dialog need. */
export interface WeekReportState {
  /** Null when there is nothing to report (no graded days at all last week —
   *  a new joiner, or someone who was not employed yet). */
  loss: WeekLoss | null;
  /** True when the person has not yet dismissed this week's report. */
  pending: boolean;
  /** The Monday of the week being reported. */
  weekStart: string;
}

/** The rupee rates for one employee, read from their salary profile. */
async function payFor(employeeId: string, daysInMonth: number): Promise<WeekLossPay> {
  const none: WeekLossPay = {
    basis: "monthly_ctc",
    perDay: 0,
    hourlyRate: 0,
    weeklyTargetMinutes: 0,
  };
  try {
    const [row] = await db
      .select({
        workerType: employees.workerType,
        weeklyTargetMinutes: employees.weeklyTargetMinutes,
        // Schedule slice — needed to price the week against THIS employee's own
        // day length instead of a fixed 9h.
        weeklyOff: employees.weeklyOff,
        attOfficialStart: employees.attOfficialStart,
        attOfficialEnd: employees.attOfficialEnd,
        attLateAfter: employees.attLateAfter,
        attEarlyBefore: employees.attEarlyBefore,
        attFullDayMinutes: employees.attFullDayMinutes,
        attHalfDayMinutes: employees.attHalfDayMinutes,
        annualCtc: salaryProfiles.annualCtc,
        monthlyPayAtTarget: salaryProfiles.monthlyPayAtTarget,
        weeklyTargetHours: salaryProfiles.weeklyTargetHours,
        monthlyFee: salaryProfiles.monthlyFee,
      })
      .from(employees)
      .leftJoin(salaryProfiles, eq(salaryProfiles.employeeId, employees.id))
      .where(eq(employees.id, employeeId))
      .limit(1);
    if (!row) return none;

    // `payBasisFor` is the app's single branch point for "how is this person
    // paid" (lib/attendance/worker-type.ts) — the salary engine reads the same
    // one, so the report can never price someone on a basis their payslip does
    // not use.
    const basis = payBasisFor(asWorkerType(row.workerType));

    // One attendance day, in minutes, for THIS employee — 9h full-time, 4.5h
    // part-time. Without it a part-timer's complete 27h week divides by 9h and
    // reports a 3-day shortfall that gets priced as real money lost.
    const dailyTargetMinutes = resolveEffectiveConfig(row).dailyTargetMinutes;

    if (basis === "fixed_fee") return { ...none, basis, dailyTargetMinutes };

    if (basis === "hourly") {
      // THE canonical rate (calendarHourlyRate) with the same monthly anchor the
      // payslip uses (monthlyPayAtTarget, falling back to CTC/12 only when the
      // field is genuinely unset), so a week's shortfall is priced exactly as
      // the payslip would price it.
      const monthlyPay = hourlyMonthlyAnchor({
        annualCtc: Number(row.annualCtc ?? 0),
        monthlyPayAtTarget: Number(row.monthlyPayAtTarget ?? 0),
      });
      const weeklyTargetMinutes = weeklyTargetMinutesFor(
        row.weeklyTargetHours != null
          ? Number(row.weeklyTargetHours) * 60
          : row.weeklyTargetMinutes,
      );
      const hourlyRate = calendarHourlyRate(monthlyPay, weeklyTargetMinutes / 60, daysInMonth);
      return { basis, perDay: 0, hourlyRate, weeklyTargetMinutes, dailyTargetMinutes };
    }

    // monthly_ctc — the same per-day rate computeSalary uses.
    const annual = Number(row.annualCtc ?? 0);
    const perDay = daysInMonth > 0 ? annual / 12 / daysInMonth : 0;
    return { basis, perDay, hourlyRate: 0, weeklyTargetMinutes: 0, dailyTargetMinutes };
  } catch {
    return none;
  }
}

/** Calendar days in the yyyy-mm of `ymd`. */
function daysInMonthOf(ymd: string): number {
  const y = Number(ymd.slice(0, 4));
  const m = Number(ymd.slice(5, 7));
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/**
 * The graded days of [from, to] for one employee.
 *
 * A Mon-Sun week can straddle a month boundary, so this reads the month status
 * for the month of each end and merges — two reads at most, one on the common
 * path where the week sits inside a single month.
 */
async function gradedDays(
  employeeId: string,
  from: string,
  to: string,
  refToday: string,
): Promise<WeekLossDay[]> {
  const months = [...new Set([from.slice(0, 7), to.slice(0, 7)])];
  const out: WeekLossDay[] = [];
  for (const ym of months) {
    const y = Number(ym.slice(0, 4));
    const m = Number(ym.slice(5, 7));
    // Sequential on purpose: this loop runs at most twice (a week straddling a
    // month boundary), and both reads hit the same employee's attendance.
    const status = await getEmployeeMonthStatus(employeeId, y, m, refToday);
    for (const d of status.days) {
      if (d.logDate < from || d.logDate > to) continue;
      // "not joined" days are not attendance — the person did not yet work here,
      // so they can neither be present nor lose anything.
      if (d.code === NOT_JOINED_CODE) continue;
      out.push({
        logDate: d.logDate,
        code: d.code,
        dayValue: d.dayValue,
        workedMinutes: d.workedMinutes,
        late: d.late,
        leftEarly: d.leftEarly,
      });
    }
  }
  out.sort((a, b) => a.logDate.localeCompare(b.logDate));
  return out;
}

/**
 * Build last week's report for `employeeId`, relative to `today` (yyyy-mm-dd in
 * the employee's timezone).
 *
 * Returns null when the week held no graded days at all — there is nothing
 * honest to report, and a dialog reading "0 days lost" to someone who had not
 * joined yet is noise, not accountability.
 */
export async function loadWeekLossReport(
  employeeId: string,
  today: string,
): Promise<WeekLoss | null> {
  try {
    const { weekStart, weekEnd } = reportedWeekFor(today);
    const days = await gradedDays(employeeId, weekStart, weekEnd, today);
    if (days.length === 0) return null;
    const pay = await payFor(employeeId, daysInMonthOf(weekStart));
    return computeWeekLoss(weekStart, weekEnd, days, pay);
  } catch {
    return null;
  }
}

/** Has this person already dismissed the report for `weekStart`? */
export async function hasAcknowledgedWeek(
  employeeId: string,
  weekStart: string,
): Promise<boolean> {
  try {
    const [row] = await db
      .select({ id: attendanceWeekAck.id })
      .from(attendanceWeekAck)
      .where(
        and(
          eq(attendanceWeekAck.employeeId, employeeId),
          eq(attendanceWeekAck.weekStart, weekStart),
        ),
      )
      .limit(1);
    return !!row;
  } catch {
    // FAIL-OPEN: an unreadable acknowledgement table must not block the punch.
    return true;
  }
}

/**
 * The gate's question, answered in one call: is a report owed, and what is it?
 *
 * `pending` is what the punch gate reads; `loss` is what the dialog renders.
 * Both are safe to ignore — see the fail-open note at the top of this file.
 */
export async function getWeekReportState(
  employeeId: string,
  today: string,
): Promise<WeekReportState> {
  const { weekStart } = reportedWeekFor(today);
  const loss = await loadWeekLossReport(employeeId, today);
  // Nothing to report ⇒ nothing to acknowledge. Never strand a new joiner behind
  // a dialog about a week they were not here for.
  if (!loss) return { loss: null, pending: false, weekStart };
  const acked = await hasAcknowledgedWeek(employeeId, weekStart);
  return { loss, pending: !acked, weekStart };
}

/**
 * Record the dismissal. Idempotent by the unique (employee, week) index — a
 * double-click or two racing tabs land on the same row.
 *
 * The figures are stored as they were SHOWN (see the migration's note): this is
 * an audit record of what the person read, not a pointer to be re-derived after
 * someone edits the attendance behind it.
 */
export async function acknowledgeWeek(
  employeeId: string,
  weekStart: string,
  shown: { daysLost: number; moneyLost: number },
): Promise<void> {
  await db
    .insert(attendanceWeekAck)
    .values({
      employeeId,
      weekStart,
      daysLost: String(shown.daysLost),
      moneyLost: String(shown.moneyLost),
    })
    .onConflictDoNothing({
      target: [attendanceWeekAck.employeeId, attendanceWeekAck.weekStart],
    });
}
