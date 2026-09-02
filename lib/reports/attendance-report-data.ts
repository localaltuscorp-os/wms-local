import "server-only";
import {
  getEmployeeMonthStatus,
  NOT_JOINED_CODE,
  type DayRow,
} from "@/lib/queries/attendance-status";
import { summarize, type AttendanceSummary, type SummaryDay } from "@/lib/attendance/summary";
import { mondayOf, currentWeekStart, istYmd } from "@/lib/weekly-goals/week";
import type { DayLine, AttnTotals } from "@/lib/email/report-emails";

/**
 * Shared builder that turns the graded attendance engine into the per-day rows +
 * period totals the report emails render. Mirrors `getSelfAttendanceSummary`'s
 * mapping (weekly-54h waiver + 3-marks deduction live in `summarize`) so the
 * reports agree exactly with the on-screen self-view — no second source of truth.
 */

const OFF_CODES = new Set(["W/O", "H", "PL", "CO", "LWP"]);
const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function isWorkingDay(row: DayRow): boolean {
  return row.code !== NOT_JOINED_CODE && !OFF_CODES.has(row.code);
}

function toSummaryDay(row: DayRow, todayIso: string): SummaryDay {
  const offDay = row.isWeeklyOff || OFF_CODES.has(row.code) || row.code === NOT_JOINED_CODE;
  return {
    date: row.logDate,
    weekKey: mondayOf(row.logDate),
    offDay,
    elapsed: row.logDate <= todayIso,
    result: {
      code: row.code as SummaryDay["result"]["code"],
      dayValue: row.dayValue,
      late: row.late,
      leftEarly: row.leftEarly,
      lateWaived: row.lateWaived,
      workedMinutes: row.workedMinutes,
    },
  };
}

function perDayRateFor(days: DayRow[], monthlyGross: number): number {
  const workingDays = days.filter(isWorkingDay).length;
  if (monthlyGross <= 0 || workingDays <= 0) return 0;
  return monthlyGross / workingDays;
}

/** "2026-07-14" + weekday 1 → "Mon 14 Jul". */
function dayLabel(row: DayRow): string {
  const [, m, d] = row.logDate.split("-");
  return `${WEEKDAY[row.weekday] ?? "?"} ${Number(d)} ${MONTH[Number(m) - 1] ?? ""}`.trim();
}

/** Show elapsed, joined, non-weekly-off days (P / H / A …) — the actionable rows. */
function toDayLines(rows: DayRow[], todayIso: string): DayLine[] {
  return rows
    .filter((r) => r.logDate <= todayIso && r.code !== NOT_JOINED_CODE && !r.isWeeklyOff && !OFF_CODES.has(r.code))
    .map((r) => ({ date: dayLabel(r), inAt: r.inAt, outAt: r.outAt, code: r.code, late: r.late, leftEarly: r.leftEarly }));
}

function toTotals(s: AttendanceSummary): AttnTotals {
  return {
    presentDays: s.presentDays,
    lateDays: s.lateDays,
    earlyDays: s.earlyDays,
    halfDays: s.halfDays,
    absentDays: s.absentDays,
    workedHours: s.workedHours,
    salaryReduced: s.salaryReduced,
  };
}

/** The just-ended (Mon→Sun) week's report for one employee. `monthlyGross` = annualCtc/12. */
export async function weekReportFor(
  employeeId: string,
  monthlyGross: number,
  now: Date = new Date(),
): Promise<{ weekStart: string; weekEnd: string; days: DayLine[]; totals: AttnTotals }> {
  const todayIso = istYmd(now);
  const [y, m] = todayIso.split("-").map(Number) as [number, number];
  const lastY = m === 1 ? y - 1 : y;
  const lastM = m === 1 ? 12 : m - 1;
  const [thisMonth, lastMonth] = await Promise.all([
    getEmployeeMonthStatus(employeeId, y, m, todayIso),
    getEmployeeMonthStatus(employeeId, lastY, lastM, todayIso),
  ]);
  const weekStart = currentWeekStart();
  const rows = [...lastMonth.days, ...thisMonth.days].filter((d) => d.logDate >= weekStart && d.logDate <= todayIso);
  const rate = perDayRateFor(thisMonth.days, monthlyGross);
  return {
    weekStart,
    weekEnd: todayIso,
    days: toDayLines(rows, todayIso),
    totals: toTotals(summarize(rows.map((d) => toSummaryDay(d, todayIso)), rate)),
  };
}

/** A completed month's report for one employee. `refTodayIso` grades the month. */
export async function monthReportFor(
  employeeId: string,
  year: number,
  month: number,
  monthlyGross: number,
  refTodayIso: string,
): Promise<{ days: DayLine[]; totals: AttnTotals }> {
  const status = await getEmployeeMonthStatus(employeeId, year, month, refTodayIso);
  const rate = perDayRateFor(status.days, monthlyGross);
  return {
    days: toDayLines(status.days, refTodayIso),
    totals: toTotals(summarize(status.days.map((d) => toSummaryDay(d, refTodayIso)), rate)),
  };
}
