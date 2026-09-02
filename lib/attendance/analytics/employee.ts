import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees } from "@/db/schema";
import {
  getEmployeeMonthStatus,
  NOT_JOINED_CODE,
  type DayRow,
  type MonthSummary,
} from "@/lib/queries/attendance-status";
import {
  getSelfAttendanceSummary,
  type SelfAttendanceSummary,
} from "@/lib/queries/attendance-summary";
import { getLeaveBalance, type LeaveBalance } from "@/lib/queries/leave";
import { listCompOff, type CompOffRow } from "@/lib/queries/comp-off";
import { resolveEffectiveConfig } from "@/lib/attendance/effective-config";
import { getOrgSettings } from "@/lib/queries/org-settings";
import {
  computeWorkforceHealth,
  type WorkforceHealth,
} from "@/lib/attendance/analytics/health-score";
import { attendanceRatio, punctualityRatio } from "@/lib/attendance/analytics/org";
import type { MonthCell } from "@/components/attendance/month-calendar";

/**
 * PER-EMPLOYEE attendance analytics — the personal counterpart to the org-wide
 * `loadOrgAttendanceAnalytics`. Server-only. Reuses the existing engines end to
 * end (no new grading, no raw-punch reads):
 *
 *   • `getEmployeeMonthStatus` → the graded per-day rows + raw MonthSummary for
 *     the viewed month (drives the calendar, hours-trend, streak, per-person
 *     Workforce Health Score, and the "today" punch ring).
 *   • `getSelfAttendanceSummary` → the rolling week/month/last-3-month scorecard
 *     with the 54h-waiver + salary-reduced ₹ figures (drives the KPI strip +
 *     self-view period cards).
 *   • `getLeaveBalance` + `listCompOff` → the leave/comp-off context cards.
 *
 * Everything is folded to plain, client-safe shapes so the dashboard components
 * (which already accept these contracts) render without re-deriving anything.
 */

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Codes that count as "showed up and worked" for streaks. */
const PRESENT_CODES = new Set(["P", "HP"]);
/** Codes that neither build nor break a streak (legitimate non-working days). */
const NEUTRAL_CODES = new Set(["W/O", "H", "PL", "CO", NOT_JOINED_CODE]);

/** Days a person actually worked — the per-day-rate denominator. */
function attendedDays(s: MonthSummary): number {
  return s.present + s.halfDay + s.holidayPresent + s.holidayHalfDay;
}

export interface AttendanceStreak {
  /** Consecutive present days counting back from the most recent elapsed day. */
  current: number;
  /** Longest present run anywhere in the loaded month. */
  longest: number;
}

export interface HoursTrendPoint {
  date: string;
  minutes: number;
  hours: number;
}

export interface TodayPunch {
  inLabel: string | null;
  outLabel: string | null;
  /** Full ISO timestamps (IST) so the live worked-hours ring can tick. */
  inISO: string | null;
  outISO: string | null;
  workedMinutes: number;
  code: string;
}

export interface EmployeeAttendanceAnalytics {
  employeeId: string;
  name: string;
  department: string | null;
  /** True when the id resolved to no employee row (renders an empty state). */
  notFound: boolean;
  year: number;
  month: number;
  monthLabel: string;
  targetHoursPerDay: number;
  /** THIS employee's weekly requirement in minutes (27h part-time, 54h full). */
  weeklyTargetMinutes: number;

  /** Graded per-day rows + raw tally for the viewed month. */
  days: DayRow[];
  summary: MonthSummary;

  /** Rolling week / this-month / last-month / last-3-month scorecard (waiver + ₹). */
  periods: SelfAttendanceSummary;

  /** Paid-leave balance for the current cycle. */
  leave: LeaveBalance;
  /** Comp-off ledger folded to counts + rows. */
  compOff: { total: number; open: number; redeemed: number; rows: CompOffRow[] };

  /** Per-person Workforce Health Score (same engine as the org dashboard). */
  health: WorkforceHealth;
  streak: AttendanceStreak;
  hoursTrend: HoursTrendPoint[];

  /** Month calendar cells for <MonthCalendar/>. */
  calendar: MonthCell[];

  /** Today's punch (only when the viewed month contains today), else null. */
  today: TodayPunch | null;

  /** Headline rates for the hero + gauge. */
  rates: {
    attendancePct: number;
    punctualityPct: number;
    avgHoursPerDay: number;
    /** On-time vs late attended-day counts (feeds the semicircle Gauge). */
    onTimeDays: number;
    lateDays: number;
  };
}

/** Consecutive-present streak (current + longest) over the elapsed month days. */
function computeStreaks(days: DayRow[], todayISO: string): AttendanceStreak {
  const elapsed = days.filter(
    (d) => d.logDate <= todayISO && d.code !== NOT_JOINED_CODE,
  );
  let longest = 0;
  let run = 0;
  for (const d of elapsed) {
    if (PRESENT_CODES.has(d.code)) {
      run += 1;
      if (run > longest) longest = run;
    } else if (NEUTRAL_CODES.has(d.code)) {
      // legitimate off day — carry the run without incrementing
    } else {
      run = 0;
    }
  }

  let current = 0;
  for (let i = elapsed.length - 1; i >= 0; i--) {
    const c = elapsed[i]!.code;
    if (PRESENT_CODES.has(c)) current += 1;
    else if (NEUTRAL_CODES.has(c)) continue;
    else break;
  }

  return { current, longest };
}

/** Map a graded DayRow → the calendar cell shape MonthCalendar expects. */
function toCell(row: DayRow, todayISO: string): MonthCell {
  return {
    date: row.logDate,
    day: Number(row.logDate.slice(8, 10)),
    weekday: row.weekday,
    code: row.code,
    late: row.late,
    leftEarly: row.leftEarly,
    isWeeklyOff: row.isWeeklyOff,
    inAt: row.inAt,
    outAt: row.outAt,
    workedMinutes: row.workedMinutes,
    future: row.logDate > todayISO,
  };
}

/**
 * Load the full personal attendance analytics bundle for one employee + month.
 *
 * @param employeeId  the employee to profile.
 * @param year        calendar year of the viewed month.
 * @param month       1-12.
 * @param refTodayISO caller's "today" (YYYY-MM-DD, IST) — the live-row anchor.
 */
export async function loadEmployeeAttendanceAnalytics(
  employeeId: string,
  year: number,
  month: number,
  refTodayISO: string,
): Promise<EmployeeAttendanceAnalytics> {
  const [emp, org, status, periods, leave, compOffRows] = await Promise.all([
    db
      .select({
        id: employees.id,
        name: employees.name,
        department: employees.department,
        // Schedule slice — the analytics page must measure this employee against
        // THEIR OWN targets. It used to read the org-wide att_full_day_hours,
        // which showed a part-timer a full-timer's 9h day.
        workerType: employees.workerType,
        weeklyOff: employees.weeklyOff,
        attOfficialStart: employees.attOfficialStart,
        attOfficialEnd: employees.attOfficialEnd,
        attLateAfter: employees.attLateAfter,
        attEarlyBefore: employees.attEarlyBefore,
        attFullDayMinutes: employees.attFullDayMinutes,
        attHalfDayMinutes: employees.attHalfDayMinutes,
        weeklyTargetMinutes: employees.weeklyTargetMinutes,
      })
      .from(employees)
      .where(eq(employees.id, employeeId))
      .limit(1)
      .then((r) => r[0] ?? null),
    getOrgSettings(),
    getEmployeeMonthStatus(employeeId, year, month, refTodayISO),
    getSelfAttendanceSummary(employeeId),
    getLeaveBalance(employeeId, refTodayISO),
    listCompOff(employeeId),
  ]);

  // Resolved through the SAME resolver the grader uses, so the dashboard can
  // never show a target the engine is not actually grading against.
  const cfg = resolveEffectiveConfig(emp ?? {}, {
    attLateAfter: org.attLateAfter,
    attEarlyBefore: org.attEarlyBefore,
    attFullDayHours: org.attFullDayHours,
    attHalfDayHours: org.attHalfDayHours,
  });
  const targetHoursPerDay = cfg.dailyTargetMinutes / 60;
  const weeklyTargetMinutes = cfg.weeklyTargetMinutes;
  const monthLabel = `${MONTHS[month - 1]} ${year}`;

  const summary = status.summary;
  const attended = attendedDays(summary);
  const avgHoursPerDay =
    attended > 0 ? summary.totalWorkedMinutes / 60 / attended : 0;
  const attPct = Math.round(attendanceRatio(summary) * 100);
  const punctPct = Math.round(punctualityRatio(summary) * 100);

  const health = computeWorkforceHealth({
    attendanceRate: attendanceRatio(summary),
    punctualityRate: punctualityRatio(summary),
    avgHoursPerDay,
    targetHoursPerDay,
    incompleteRate:
      attended > 0 ? summary.incomplete / (attended + summary.incomplete) : 0,
    unpaidLeaveRate:
      summary.payableDays > 0
        ? summary.unpaidLeave / (summary.payableDays + summary.unpaidLeave)
        : 0,
    earlyLeaveRate: attended > 0 ? summary.leftEarly / attended : 0,
  });

  const streak = computeStreaks(status.days, refTodayISO);

  // Hours trend: elapsed, joined, non-weekly-off days → per-day worked hours.
  const hoursTrend: HoursTrendPoint[] = status.days
    .filter(
      (d) =>
        d.logDate <= refTodayISO &&
        d.code !== NOT_JOINED_CODE &&
        !d.isWeeklyOff,
    )
    .map((d) => ({
      date: d.logDate,
      minutes: d.workedMinutes,
      hours: Math.round((d.workedMinutes / 60) * 10) / 10,
    }));

  const calendar = status.days.map((d) => toCell(d, refTodayISO));

  // Today's punch — only when the viewed month actually contains today.
  const todayRow = status.days.find((d) => d.logDate === refTodayISO) ?? null;
  const today: TodayPunch | null = todayRow
    ? {
        inLabel: todayRow.inAt,
        outLabel: todayRow.outAt,
        // IST wall-clock → ISO (+05:30); the whole app is IST-anchored.
        inISO: todayRow.inAt ? `${todayRow.logDate}T${todayRow.inAt}:00+05:30` : null,
        outISO: todayRow.outAt ? `${todayRow.logDate}T${todayRow.outAt}:00+05:30` : null,
        workedMinutes: todayRow.workedMinutes,
        code: todayRow.code,
      }
    : null;

  const openCompOff = compOffRows.filter((c) => c.status === "open").length;
  const redeemedCompOff = compOffRows.filter((c) => c.status === "redeemed").length;

  return {
    employeeId,
    name: emp?.name ?? "Unknown employee",
    department: emp?.department ?? null,
    notFound: emp == null,
    year,
    month,
    monthLabel,
    targetHoursPerDay,
    weeklyTargetMinutes,
    days: status.days,
    summary,
    periods,
    leave,
    compOff: {
      total: compOffRows.length,
      open: openCompOff,
      redeemed: redeemedCompOff,
      rows: compOffRows,
    },
    health,
    streak,
    hoursTrend,
    calendar,
    today,
    rates: {
      attendancePct: attPct,
      punctualityPct: punctPct,
      avgHoursPerDay: Math.round(avgHoursPerDay * 10) / 10,
      onTimeDays: Math.max(0, attended - summary.late),
      lateDays: summary.late,
    },
  };
}
