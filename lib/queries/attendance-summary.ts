import "server-only";
import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, remoteWorkRequests, salaryBreakup, salaryProfiles } from "@/db/schema";
import { weekKeyOf } from "@/lib/attendance/hours-rule";
import { resolveEffectiveConfig } from "@/lib/attendance/effective-config";
import { reconcileMonth, monthKeyOf, payableHoursForMonth } from "@/lib/attendance/hour-balance";
import { getOrgSettings } from "@/lib/queries/org-settings";
import {
  getEmployeeMonthStatus,
  NOT_JOINED_CODE,
  type DayRow,
} from "@/lib/queries/attendance-status";
import {
  summarize,
  type AttendanceSummary,
  type SummaryDay,
} from "@/lib/attendance/summary";
import { mondayOf, currentWeekStart, istYmd } from "@/lib/weekly-goals/week";
import { computeScheduleHourlySalary } from "@/lib/salary/compute";
import { asWorkerType, payBasisFor, earnsOvertime } from "@/lib/attendance/worker-type";

/**
 * Self-view attendance summary — the personal "how am I doing / how much salary
 * did I lose" numbers Sir wants every employee to see on their punch screen.
 *
 * We DON'T re-query raw punches: we lean entirely on `getEmployeeMonthStatus`
 * (which already folds punches → graded per-day rows) for the current and prior
 * month, then feed the shared pure `summarize` engine (weekly-54h waiver +
 * 3-marks-½-day deduction live in there). The only extra read is ONE row from
 * `salary_profiles` for the per-day rupee rate.
 */

/** Codes that are NOT working days — they don't count toward the expected
 *  working-day denominator, don't earn marks, and are skipped by `summarize`
 *  (weekly-off, holiday, paid/unpaid leave, comp-off). */
/** Codes that are NOT an expected working day: weekly off, holiday, approved
 *  leave, comp-off. Exported so consumers reuse it rather than restating it —
 *  a second opinion about what counts as a working day is a second set of
 *  numbers. (lib/reports/attendance-report-data.ts still keeps its own copy.) */
export const OFF_CODES = new Set(["W/O", "H", "PL", "CO", "LWP"]);

/**
 * One period on the KPI bar: the graded summary plus the hours picture.
 *
 * `AttendanceSummary` is left alone — the salary engine and the report emails
 * read it too, and none of them want these fields. The KPI bar's extras are
 * layered on here instead.
 */
export interface SelfPeriod extends AttendanceSummary {
  /** Target for the WHOLE period: every non-off day in it x the daily target. */
  requiredHours: number;
  /**
   * Target for the days that have already ELAPSED. The difference between this
   * and `requiredHours` is what separates "still to do" from "behind".
   */
  requiredElapsedHours: number;
  /** Simply requiredHours - workedHours. What is left of the period's target. */
  hoursToGo: number;
  /**
   * PLUS-MINUS HOURS — worked minus what was due on the days already elapsed.
   * SIGNED: positive is surplus/overtime, negative is hours to recover. One
   * number rather than two, because "+24.7" and "-8.5" are the same measurement
   * read from opposite sides, and a pair of clamped fields let the two drift.
   */
  hoursBalance: number;
  /** max(0, hoursBalance) — the surplus half, for the breakdown table. */
  extraHours: number;
  /** max(0, -hoursBalance) — the shortfall half. Was "hoursToRecover". */
  lessHours: number;
  /** Days worked on a holiday or weekly off (code "HP"), already paid double. */
  extraDaysWorked: number;
  /**
   * Half-days that cost nothing: the 3-per-month allowance plus any the
   * weekly-hours waiver absorbed. MONTH-SCOPED by nature — the allowance resets
   * monthly — so the week view reports its containing month's figure.
   */
  graceDays: number;
  /** Days an admin explicitly waived off (salary_breakup.waive_off_days). */
  condonedDays: number;
  /** Approved days away from the office, by mode (migration 0205). */
  wfhDays: number;
  fieldDays: number;
  clientSiteDays: number;
}

/** The four selectable periods. A named union rather than `keyof` the summary,
 *  which also carries non-period fields and so cannot be indexed with safely. */
export type SelfPeriodKey = "thisWeek" | "thisMonth" | "lastMonth" | "last3Months";

export interface SelfAttendanceSummary {
  thisWeek: SelfPeriod;
  thisMonth: SelfPeriod;
  lastMonth: SelfPeriod;
  /** Rolling trend: this month-to-date + the two prior full months, evaluated
   *  as ONE span so the weekly-54h waiver stays intact across month borders. */
  last3Months: SelfPeriod;
  /** The employee's daily hours target, for rendering "x h / y h" honestly. */
  dailyTargetHours: number;
}

/** (year, month 1-12) shifted back `n` calendar months, wrap-safe. */
function monthBack(year: number, month: number, n: number): { year: number; month: number } {
  const idx = year * 12 + (month - 1) - n;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}

/** A day counts toward the FULL-month working-day denominator when it is a real,
 *  joined, non-off day (Present/Absent/Half/Incomplete/Holiday-worked). */
function isWorkingDay(row: DayRow): boolean {
  return row.code !== NOT_JOINED_CODE && !OFF_CODES.has(row.code);
}

/** Map a graded month-status row onto the pure summary engine's per-day shape.
 *  Off / holiday / leave / pre-join days are marked `offDay` so `summarize`
 *  excludes them from working days and from the mark tallies. */
function toSummaryDay(row: DayRow, todayIso: string): SummaryDay {
  const offDay =
    row.isWeeklyOff || OFF_CODES.has(row.code) || row.code === NOT_JOINED_CODE;
  return {
    date: row.logDate,
    weekKey: mondayOf(row.logDate),
    offDay,
    elapsed: row.logDate <= todayIso,
    result: {
      // `summarize` only reads `result` for non-off, elapsed days; the pre-join
      // sentinel "–" is always offDay, so this cast is safe.
      code: row.code as SummaryDay["result"]["code"],
      dayValue: row.dayValue,
      late: row.late,
      leftEarly: row.leftEarly,
      lateWaived: row.lateWaived,
      workedMinutes: row.workedMinutes,
    },
  };
}

/** Per-day rupee rate for a month: monthlyGross ÷ that month's full working-day
 *  count. Returns 0 when there's no CTC or no working days (never divide-by-0). */
function perDayRateFor(days: DayRow[], monthlyGross: number): number {
  const workingDays = days.filter(isWorkingDay).length;
  if (monthlyGross <= 0 || workingDays <= 0) return 0;
  return monthlyGross / workingDays;
}

/** A day the employee is EXPECTED to work: not a weekly off, not a holiday,
 *  not leave, not before joining. This is the denominator that makes "Effective
 *  Days Worked" and the hours target exclude holidays and weekly offs. */
function isRequiredDay(row: DayRow): boolean {
  return !row.isWeeklyOff && !OFF_CODES.has(row.code) && row.code !== NOT_JOINED_CODE;
}

/** Approved remote-work days in [from,to], counted per mode. */
type RemoteDay = { workDate: string; workMode: string };
function remoteCounts(rows: RemoteDay[], from: string, to: string) {
  let wfhDays = 0;
  let fieldDays = 0;
  let clientSiteDays = 0;
  for (const r of rows) {
    if (r.workDate < from || r.workDate > to) continue;
    if (r.workMode === "wfh") wfhDays += 1;
    else if (r.workMode === "field") fieldDays += 1;
    else if (r.workMode === "client_site") clientSiteDays += 1;
  }
  return { wfhDays, fieldDays, clientSiteDays };
}

/**
 * Layer the hours picture and the remote-day counts onto a graded summary.
 *
 * `periodRows` is the WHOLE period (future days included) and drives the target;
 * only elapsed days drive the shortfall. Counting the target from elapsed days
 * alone would make a Monday morning read "0h / 9h" on a six-day week and call it
 * complete by Tuesday.
 */
function enrich(
  base: AttendanceSummary,
  periodRows: DayRow[],
  todayIso: string,
  dailyTargetHours: number,
  remote: { wfhDays: number; fieldDays: number; clientSiteDays: number },
  forgiven: { graceDays: number; condonedDays: number },
): SelfPeriod {
  const requiredDays = periodRows.filter(isRequiredDay);
  const requiredHours = round1(requiredDays.length * dailyTargetHours);
  const requiredElapsedHours = round1(
    requiredDays.filter((d) => d.logDate <= todayIso).length * dailyTargetHours,
  );
  // Signed, and derived ONCE so the two halves below can never disagree.
  const hoursBalance = round1(base.workedHours - requiredElapsedHours);

  // ── EFFECTIVE DAYS: THE SAME COUNT MY SALARY SHOWS ──────────────────────────
  // `summarize` reports `presentDays` as HOURS-RULE payable days (worked hours ÷
  // ~9h), so a month of short-but-present days reads e.g. 17.5 while the My
  // Salary page — and the payslip — count 21 days actually attended. Two screens,
  // one fact, two numbers. We recount here with the EXACT partition My Salary
  // uses (lib/salary/my-salary.ts): elapsed, joined, non-off days split into
  // present (dayValue ≥ 1) / half (0.5) / absent (0). `summarize` is deliberately
  // left alone, so the salary engine and report emails that read
  // `AttendanceSummary` directly are unaffected; only the KPI bar's `SelfPeriod`
  // is corrected, and it now agrees with My Salary day-for-day.
  const workingRows = periodRows.filter(
    (d) =>
      d.logDate <= todayIso &&
      d.code !== NOT_JOINED_CODE &&
      !d.isWeeklyOff &&
      !OFF_CODES.has(d.code),
  );
  const presentDays = workingRows.filter((d) => d.dayValue >= 1).length;
  const halfDays = workingRows.filter((d) => d.dayValue === 0.5).length;
  const absentDays = workingRows.filter((d) => d.dayValue === 0).length;

  return {
    ...base,
    requiredHours,
    requiredElapsedHours,
    hoursToGo: round1(Math.max(0, requiredHours - base.workedHours)),
    hoursBalance,
    extraHours: round1(Math.max(0, hoursBalance)),
    lessHours: round1(Math.max(0, -hoursBalance)),
    // "HP" is the code for a day worked on a holiday or weekly off. Counted from
    // the period's own rows rather than a running total, so each period answers
    // for itself.
    extraDaysWorked: periodRows.filter((d) => d.code === "HP").length,
    ...forgiven,
    ...remote,
    // Override AFTER the spread so the KPI's "Effective Days Worked" is the same
    // present / working-days count My Salary renders, not the hours-rule figure.
    presentDays,
    workingDays: workingRows.length,
    halfDays,
    absentDays,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** `ymd` + n days, UTC so it never drifts across a DST boundary. */
function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

/** Last day (YYYY-MM-DD) of a given year/month (month 1-12). */
function lastDayOfMonth(year: number, month: number): string {
  const day = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export async function getSelfAttendanceSummary(
  employeeId: string,
): Promise<SelfAttendanceSummary> {
  const todayIso = istYmd(new Date());
  const [curYear, curMonth] = todayIso.split("-").map(Number) as [number, number];

  const lastYear = curMonth === 1 ? curYear - 1 : curYear;
  const lastMonthNum = curMonth === 1 ? 12 : curMonth - 1;
  // The month before last — the third slice of the "Last 3 Months" trend.
  const m2 = monthBack(curYear, curMonth, 2);

  // The widest span any period covers — one read for the remote-work days.
  const spanFrom = `${m2.year}-${String(m2.month).padStart(2, "0")}-01`;
  const spanTo = lastDayOfMonth(curYear, curMonth);

  // Salary profile → monthly gross for the rupee reduction. Absent profile ⇒ 0.
  const [profile, emp, remoteRows, thisMonthStatus, lastMonthStatus, m2Status] = await Promise.all([
    db
      .select({
        annualCtc: salaryProfiles.annualCtc,
        monthlyPayAtTarget: salaryProfiles.monthlyPayAtTarget,
      })
      .from(salaryProfiles)
      .where(eq(salaryProfiles.employeeId, employeeId))
      .limit(1)
      .then((r) => r[0] ?? null),
    db
      .select({
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
    // Approved days away from the office. PENDING and REJECTED are excluded on
    // purpose: an unapproved request is a wish, and counting it would let anyone
    // inflate their own WFH tally just by asking.
    db
      .select({
        workDate: remoteWorkRequests.workDate,
        workMode: remoteWorkRequests.workMode,
      })
      .from(remoteWorkRequests)
      .where(
        and(
          eq(remoteWorkRequests.employeeId, employeeId),
          eq(remoteWorkRequests.status, "approved"),
          gte(remoteWorkRequests.workDate, spanFrom),
          lte(remoteWorkRequests.workDate, spanTo),
        ),
      ),
    getEmployeeMonthStatus(employeeId, curYear, curMonth, todayIso),
    // The whole prior month is elapsed — grade it against its last day.
    getEmployeeMonthStatus(
      employeeId,
      lastYear,
      lastMonthNum,
      lastDayOfMonth(lastYear, lastMonthNum),
    ),
    getEmployeeMonthStatus(employeeId, m2.year, m2.month, lastDayOfMonth(m2.year, m2.month)),
  ]);

  const annualCtc = profile ? Number(profile.annualCtc) : 0;
  const monthlyGross = annualCtc > 0 ? annualCtc / 12 : 0;

  // THE EMPLOYEE'S OWN SCHEDULE, from the one resolver the grader and the salary
  // engine already share. This replaces a weekly-target/6 approximation: the
  // resolver knows the real daily target for every archetype, so the KPI bar and
  // the payslip can never disagree about what a day is worth.
  const org = await getOrgSettings().catch(() => null);
  const cfg = resolveEffectiveConfig(emp ?? {}, {
    attLateAfter: org?.attLateAfter ?? null,
    attEarlyBefore: org?.attEarlyBefore ?? null,
    attFullDayHours: org?.attFullDayHours ?? null,
    attHalfDayHours: org?.attHalfDayHours ?? null,
  });
  const dailyTargetHours = round1(cfg.dailyTargetMinutes / 60);

  // ── SALARY LOST — the SAME reduction My Salary shows, not a day-shortfall ────
  // The KPI's "Salary Lost" must equal what the payslip actually deducts: ₹0 when
  // the employee is paid in full. So we reuse the salary engine LITERALLY — the
  // same `payableHoursForMonth` + `computeScheduleHourlySalary` the payslip runs —
  // and read the loss as (monthly salary − base earned). `summarize()`'s day
  // shortfall (worked-hours ÷ 9h vs working days) is NOT the pay model: a
  // present-but-short day is absorbed by the monthly hour rebalancing and the
  // base cap, so it loses nothing. Scoped to the app-graded era (2026-08+);
  // earlier months are frozen / already paid, so the live grader must never
  // invent a loss for them.
  const workerType = asWorkerType(emp?.workerType);
  const payBasis = payBasisFor(workerType);
  // Only a full-timer on a fixed monthly CTC can LOSE salary — an absence docks a
  // fixed figure. Hourly staff (part-time / half-day shift) are simply paid for
  // the hours they work, so there is no expected amount to fall short of; a
  // retainer never moves either. Both therefore report ₹0 lost.
  const monthlySalary =
    payBasis === "monthly_ctc" && profile ? Number(profile.annualCtc) / 12 : 0;

  const salaryLostForMonth = (rows: DayRow[], monthKey: string): number => {
    if (monthKey < "2026-08") return 0; // frozen/legacy months keep their paid figure
    if (payBasis !== "monthly_ctc" || !(monthlySalary > 0)) return 0; // hourly/retainer never "lose"
    const graded = rows
      .filter((d) => d.code !== NOT_JOINED_CODE)
      .map((d) => ({
        date: d.logDate,
        weekKey: weekKeyOf(d.logDate),
        code: d.code,
        dayValue: d.dayValue,
        workedMinutes: d.workedMinutes,
        late: d.late,
        leftEarly: d.leftEarly,
      }));
    if (!graded.length) return 0;

    const recon = reconcileMonth(graded, {
      month: monthKey,
      weeklyTargetMinutes: cfg.weeklyTargetMinutes,
      waiverThresholdMinutes: cfg.waiverThresholdMinutes,
      workingDaysPerWeek: cfg.workingDaysPerWeek,
    });
    const hours = payableHoursForMonth(graded, recon, cfg.dailyTargetMinutes);
    if (!(hours.targetHours > 0)) return 0;
    const bd = computeScheduleHourlySalary({
      monthlySalary,
      monthlyTargetHours: hours.targetHours,
      payableHoursRaw: hours.payableMinutesRaw / 60,
      dailyTargetHours: cfg.dailyTargetMinutes / 60,
      chargeableHalfDays: recon.chargeableHalfDays,
      overtimeHours: earnsOvertime(workerType) ? hours.netSurplusMinutes / 60 : 0,
      // PT / TDS / advances change only the net, never the base — pass none.
      ptExempt: true,
      tdsMonthly: 0,
      advances: 0,
      pendingBalanceIn: 0,
    });
    const base = bd.gross - (bd.overtimeAmount ?? 0);
    return Math.max(0, Math.round(monthlySalary - base));
  };

  const curMonthKey = `${curYear}-${String(curMonth).padStart(2, "0")}`;
  const lastMonthKey = `${lastYear}-${String(lastMonthNum).padStart(2, "0")}`;
  const m2Key = `${m2.year}-${String(m2.month).padStart(2, "0")}`;
  const curSalaryLost = salaryLostForMonth(thisMonthStatus.days, curMonthKey);
  const lastSalaryLost = salaryLostForMonth(lastMonthStatus.days, lastMonthKey);
  const m2SalaryLost = salaryLostForMonth(m2Status.days, m2Key);

  const remote = (remoteRows ?? []) as RemoteDay[];

  /**
   * GRACE for one month, via the SAME reconciliation the salary engine runs.
   * Both forgiveness routes count: the 3-per-month allowance (`warnedHalfDays`)
   * and half-days the weekly-hours waiver absorbed — which deliberately do not
   * consume a grace slot, so adding them is the only way the employee sees every
   * half-day that cost them nothing.
   */
  const graceForMonth = (rows: DayRow[], monthKey: string): number => {
    const graded = rows
      .filter((d) => monthKeyOf(d.logDate) === monthKey && d.logDate <= todayIso)
      .map((d) => ({
        date: d.logDate,
        weekKey: weekKeyOf(d.logDate),
        code: d.code,
        dayValue: d.dayValue,
        workedMinutes: d.workedMinutes,
        late: d.late,
        leftEarly: d.leftEarly,
      }));
    if (!graded.length) return 0;
    const r = reconcileMonth(graded, {
      month: monthKey,
      weeklyTargetMinutes: cfg.weeklyTargetMinutes,
      waiverThresholdMinutes: cfg.waiverThresholdMinutes,
      workingDaysPerWeek: cfg.workingDaysPerWeek,
    });
    return r.warnedHalfDays + r.waiverAbsorbedHalfDays;
  };

  // CONDONED — days an admin explicitly waived off. Read from salary_breakup,
  // which is where that decision is already recorded with its note and author;
  // inventing a second place to forgive a day would leave two answers.
  const condonedByMonth = new Map<string, number>();
  try {
    const waived = await db
      .select({ month: salaryBreakup.month, days: salaryBreakup.waiveOffDays })
      .from(salaryBreakup)
      .where(eq(salaryBreakup.employeeId, employeeId));
    for (const w of waived) {
      const key = String(w.month).slice(0, 7);
      condonedByMonth.set(key, (condonedByMonth.get(key) ?? 0) + Number(w.days ?? 0));
    }
  } catch {
    /* fail-soft: a missing waive-off read costs one number, never the page */
  }
  const condonedFor = (...months: string[]) =>
    months.reduce((n, m) => n + (condonedByMonth.get(m) ?? 0), 0);

  const thisMonthRate = perDayRateFor(thisMonthStatus.days, monthlyGross);
  const lastMonthRate = perDayRateFor(lastMonthStatus.days, monthlyGross);

  const monthFrom = `${curYear}-${String(curMonth).padStart(2, "0")}-01`;
  const monthTo = lastDayOfMonth(curYear, curMonth);
  const lastFrom = `${lastYear}-${String(lastMonthNum).padStart(2, "0")}-01`;
  const lastTo = lastDayOfMonth(lastYear, lastMonthNum);

  // ── This month ──
  const thisMonth = enrich(
    summarize(thisMonthStatus.days.map((d) => toSummaryDay(d, todayIso)), thisMonthRate),
    thisMonthStatus.days,
    todayIso,
    dailyTargetHours,
    remoteCounts(remote, monthFrom, monthTo),
    {
      graceDays: graceForMonth(thisMonthStatus.days, `${curYear}-${String(curMonth).padStart(2, "0")}`),
      condonedDays: condonedFor(`${curYear}-${String(curMonth).padStart(2, "0")}`),
    },
  );

  // ── Last month ──
  const lastMonth = enrich(
    summarize(lastMonthStatus.days.map((d) => toSummaryDay(d, todayIso)), lastMonthRate),
    lastMonthStatus.days,
    todayIso,
    dailyTargetHours,
    remoteCounts(remote, lastFrom, lastTo),
    {
      graceDays: graceForMonth(lastMonthStatus.days, `${lastYear}-${String(lastMonthNum).padStart(2, "0")}`),
      condonedDays: condonedFor(`${lastYear}-${String(lastMonthNum).padStart(2, "0")}`),
    },
  );

  // ── This week (Mon → today) — may straddle last & this month, so draw the
  //    week's days from BOTH loaded statuses. Reduction uses this month's rate. ──
  const weekStart = currentWeekStart();
  // The WHOLE week (Mon–Sun) sets the target; only elapsed days are graded. A
  // week's target must not shrink as the week goes on, or Monday reads "0h / 9h".
  const weekEnd = addDays(weekStart, 6);
  const allWeekRows = [...lastMonthStatus.days, ...thisMonthStatus.days].filter(
    (d) => d.logDate >= weekStart && d.logDate <= weekEnd,
  );
  const weekRows = allWeekRows.filter((d) => d.logDate <= todayIso);
  const thisWeek = enrich(
    summarize(weekRows.map((d) => toSummaryDay(d, todayIso)), thisMonthRate),
    allWeekRows,
    todayIso,
    dailyTargetHours,
    remoteCounts(remote, weekStart, weekEnd),
    // The grace allowance resets MONTHLY, so a week reports the month it sits
    // in. Prorating it to seven days would describe an allowance nobody has.
    {
      graceDays: graceForMonth(thisMonthStatus.days, `${curYear}-${String(curMonth).padStart(2, "0")}`),
      condonedDays: condonedFor(`${curYear}-${String(curMonth).padStart(2, "0")}`),
    },
  );

  // ── Last 3 months — one span (weeks stay intact across month borders).
  //    Future days in the current month are skipped by `summarize` (not elapsed).
  //    Rupee reduction uses this month's rate (monthly gross is constant; the
  //    per-day divisor barely moves month to month). ──
  const last3Rows = [...m2Status.days, ...lastMonthStatus.days, ...thisMonthStatus.days];
  const last3Months = enrich(
    summarize(last3Rows.map((d) => toSummaryDay(d, todayIso)), thisMonthRate),
    last3Rows,
    todayIso,
    dailyTargetHours,
    remoteCounts(remote, spanFrom, spanTo),
    {
      graceDays:
        graceForMonth(m2Status.days, `${m2.year}-${String(m2.month).padStart(2, "0")}`) +
        graceForMonth(lastMonthStatus.days, `${lastYear}-${String(lastMonthNum).padStart(2, "0")}`) +
        graceForMonth(thisMonthStatus.days, `${curYear}-${String(curMonth).padStart(2, "0")}`),
      condonedDays: condonedFor(`${m2.year}-${String(m2.month).padStart(2, "0")}`, `${lastYear}-${String(lastMonthNum).padStart(2, "0")}`, `${curYear}-${String(curMonth).padStart(2, "0")}`),
    },
  );

  // Override "Salary Lost" with the salary engine's real reduction (see
  // salaryLostForMonth). The current month drives This Week too (current-month
  // priority); Last 3 Months sums the app-graded months; frozen months add 0.
  thisMonth.salaryReduced = curSalaryLost;
  thisWeek.salaryReduced = curSalaryLost;
  lastMonth.salaryReduced = lastSalaryLost;
  last3Months.salaryReduced = curSalaryLost + lastSalaryLost + m2SalaryLost;

  return { thisWeek, thisMonth, lastMonth, last3Months, dailyTargetHours };
}
