import "server-only";
import {
  getEmployeeMonthStatus,
  NOT_JOINED_CODE,
  type DayRow,
} from "@/lib/queries/attendance-status";
import { summarize, type AttendanceSummary, type SummaryDay } from "@/lib/attendance/summary";
import { mondayOf, currentWeekStart, istYmd } from "@/lib/weekly-goals/week";
import { db } from "@/lib/db";
import { employees } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getOrgSettings } from "@/lib/queries/org-settings";
import { employeeEffectiveConfig } from "@/lib/queries/attendance-status";
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

/**
 * This employee's own day length in minutes, from the ONE resolver the grader
 * and the salary engine share.
 *
 * `summarize` used to divide by a hard 9h here, so a part-timer's complete 27h
 * week reported 3 days earned out of 6 in the report emails — a phantom
 * shortfall on the very document that tells someone how their week went. The
 * on-screen self-view already passes this; the reports were the surface still
 * defaulting. Fail-soft to the full-time day, which is what the default was.
 */
async function dayMinutesFor(employeeId: string): Promise<number | undefined> {
  try {
    const [org, emp] = await Promise.all([
      getOrgSettings().catch(() => null),
      db.query.employees.findFirst({ where: eq(employees.id, employeeId) }),
    ]);
    return emp ? employeeEffectiveConfig(emp, org).dailyTargetMinutes : undefined;
  } catch {
    return undefined;
  }
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
  const dayMinutes = await dayMinutesFor(employeeId);
  return {
    weekStart,
    weekEnd: todayIso,
    days: toDayLines(rows, todayIso),
    totals: toTotals(summarize(rows.map((d) => toSummaryDay(d, todayIso)), rate, dayMinutes)),
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
  const dayMinutes = await dayMinutesFor(employeeId);
  return {
    days: toDayLines(status.days, refTodayIso),
    totals: toTotals(summarize(status.days.map((d) => toSummaryDay(d, refTodayIso)), rate, dayMinutes)),
  };
}
