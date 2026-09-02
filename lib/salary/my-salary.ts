import "server-only";
import { refreshOpenMonthRun } from "./refresh-open-month";
import { myRuns } from "@/lib/queries/salary";
import { mySalaryBreakup } from "@/lib/queries/salary-breakup";
import { isHourlyShift, asWorkerType, type WorkerType } from "@/lib/attendance/worker-type";
import { localDateString } from "@/lib/format";
import {
  NOT_JOINED_CODE,
  employeeEffectiveConfig,
  getEmployeeMonthStatus,
} from "@/lib/queries/attendance-status";
import { OFF_CODES } from "@/lib/queries/attendance-summary";
import { getOrgSettings } from "@/lib/queries/org-settings";
import { db } from "@/lib/db";
import { employees } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { MonthCell } from "@/components/attendance/month-calendar";

/**
 * MY SALARY — what one employee sees about their OWN pay.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * The page used to read `salary_breakup` alone — a mirror table written only
 * when an admin clicks Generate Salary. That made it show real rows produced by
 * STALE logic, which is worse than showing nothing: August rows read
 * `present = 0` beside `final_working_days = 5`, `worked_hours = null`, and a
 * figure computed the old day-based way. Plausible, and wrong.
 *
 * ── THREE TIERS, NEWEST FIRST ──────────────────────────────────────────────
 *   1. THE OPEN MONTH   → computed live, right now, through the same
 *      `assembleMonthInputs` + `computeForRow` that Generate Salary uses. The
 *      page and the payslip therefore cannot disagree, and the current month is
 *      never blank waiting on somebody to press a button.
 *   2. CLOSED MONTHS    → the stored `salary_runs` row. A payslip has to keep
 *      saying what it said on the day it was paid; re-deriving it later would
 *      read today's attendance and today's rate, both of which move.
 *   3. OLDER STILL      → the legacy `salary_breakup` row, read-only. Runs only
 *      go back to 2026-04 while the breakup table has 2026-01 onward; without
 *      this tier an employee silently loses months of their own history.
 *
 * A month is only ever taken from ONE tier — the first that has it.
 */

/** One month of an employee's own pay, whichever tier it came from. */
export interface MySalaryMonth {
  /** "2026-08" */
  month: string;
  /** "August 2026" */
  label: string;
  designation: string | null;
  companyName: string | null;
  /** Where the figures came from — drives the "live" badge on the card. */
  source: "live" | "run" | "legacy";

  // Money. `base + overtimeAmount === gross`, always.
  monthlyCtc: number;
  baseAmount: number;
  overtimeAmount: number;
  /**
   * The attendance-driven reduction from the monthly figure. For a full-timer
   * that is (monthlyCtc − baseEarned); for HOURLY staff it is ALWAYS ₹0 — they
   * are paid per hour and have no fixed monthly to fall short of. Computed here,
   * server-side, so it is the SAME "Salary Lost" the Attendance KPI shows (the
   * view must never re-derive it in the browser).
   */
  attendanceDeduction: number;
  gross: number;
  pt: number;
  advance: number;
  previousPending: number;
  finalPayment: number;
  salaryGiven: number | null;
  paid: boolean;

  // Hours — populated for the hourly shifts; null for everyone else.
  hourly: boolean;
  workedHours: number | null;
  targetHours: number | null;
  overtimeHours: number;
  hourlyRate: number | null;

  /**
   * The graded calendar for this month, ready for `<MonthCalendar>`.
   *
   * Carried on the month rather than fetched when a history row is opened: the
   * grading pass that produces the day counts produces these cells too, so
   * building them here costs nothing extra and clicking a month stays instant.
   */
  cells: MonthCell[];
  /** This employee's OWN weekly target. Never let the calendar fall back to its
   *  54h default for someone on a 27h week. */
  weekTargetMinutes: number | null;

  // Days — the classic view, for worker types whose pay does not track hours.
  present: number;
  absent: number;
  halfDay: number;
  finalWorkingDays: number;
  daysInMonth: number;
  remarks: string | null;
}

const num = (v: string | number | null | undefined): number =>
  v == null ? 0 : Number(v) || 0;

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, 1)).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** The month currently in progress, in the company's timezone. */
export function currentMonthKey(now: Date = new Date()): string {
  return localDateString("Asia/Kolkata", now).slice(0, 7);
}

/**
 * Every month of this employee's pay, newest first.
 *
 * `workerType` decides only how the month is PRESENTED (hours vs days) — never
 * what it is worth. The money always comes from the payroll engine.
 */
export async function loadMySalaryMonths(
  employeeId: string,
  workerType: string | null | undefined,
  now: Date = new Date(),
): Promise<MySalaryMonth[]> {
  const wt: WorkerType = asWorkerType(workerType);
  const hourly = isHourlyShift(wt);
  const open = currentMonthKey(now);

  // ── ONE NUMBER, EVERYWHERE ───────────────────────────────────────────
  // This page used to COMPUTE the open month and show a figure that existed
  // nowhere else — the payslip and the Accounts salary module read the stored
  // run, which was only as current as the last Generate Salary. Same arithmetic,
  // different moment, two different answers, and only one of them visible to the
  // employee.
  //
  // Now the computation WRITES what it derives, so reading this page refreshes
  // the row those other surfaces already read. Everything below is a plain read
  // of stored rows. Fail-soft and throttled — see refreshOpenMonthRun; a refusal
  // (paid out, recomputed moments ago) simply leaves the stored run in place.
  await refreshOpenMonthRun(employeeId, open, now);

  // The two stored tiers load independently. If one fails — a column the DB has
  // not been migrated for yet, a stale pooled connection — it costs only its own
  // months and the remaining tiers still render. The merge below already treats
  // an empty tier as "nothing to overwrite", so [] is a complete answer here.
  const [runs, legacy] = await Promise.all([
    myRuns(employeeId).catch((err) => {
      console.error("[my-salary] runs tier failed for", employeeId, err);
      return [];
    }),
    mySalaryBreakup(employeeId).catch((err) => {
      console.error("[my-salary] legacy tier failed for", employeeId, err);
      return [];
    }),
  ]);

  const byMonth = new Map<string, MySalaryMonth>();

  // Tier 3 first, so the better tiers overwrite it rather than the reverse.
  for (const r of legacy) {
    const month = String(r.month).slice(0, 7);
    byMonth.set(month, {
      month,
      label: monthLabel(month),
      designation: r.designation ?? null,
      companyName: r.companyName ?? null,
      source: "legacy",
      monthlyCtc: num(r.monthlyCtc),
      // Legacy rows predate overtime entirely, so everything is base.
      baseAmount: num(r.payableAfterLeave),
      overtimeAmount: 0,
      attendanceDeduction: Math.max(0, Math.round(num(r.monthlyCtc) - num(r.payableAfterLeave))),
      gross: num(r.payableAfterLeave),
      pt: num(r.pt),
      advance: num(r.advance),
      previousPending: num(r.previousPending),
      finalPayment: num(r.finalPayment),
      salaryGiven: r.salaryGiven == null ? null : num(r.salaryGiven),
      paid: r.paid ?? false,
      hourly: false,
      workedHours: r.workedHours == null ? null : num(r.workedHours),
      targetHours: null,
      overtimeHours: 0,
      hourlyRate: null,
      cells: [],
      weekTargetMinutes: null,
      present: num(r.present),
      absent: num(r.absent),
      halfDay: num(r.halfDay),
      // NOT `final_working_days`. That column is a Σ of day VALUES — present +
      // half/2 + weekly offs + holidays — which is a PAY quantity: 559 of the
      // 667 stored rows match that formula, only 23 match a plain count. Using
      // it as the denominator of "worked X of Y days" compares a count against
      // a weighted sum, so June read "21 of 26.5".
      //
      // present + halfDay + absent is the count of days that were expected to
      // be worked and got graded, by construction — weekly offs, holidays and
      // pre-joining days are in none of the three. It makes the KPI row
      // reconcile for the legacy tier exactly as it does for the punch tier.
      finalWorkingDays: num(r.present) + num(r.halfDay) + num(r.absent),
      daysInMonth: num(r.daysInMonth),
      remarks: r.remarks ?? null,
    });
  }

  // Tier 2 — the authoritative record of what was generated.
  for (const r of runs) {
    const overtimeAmount = r.overtimeAmount ?? 0;
    byMonth.set(r.month, {
      month: r.month,
      label: monthLabel(r.month),
      designation: r.designationName ?? null,
      companyName: r.payingEntityName ?? null,
      source: "run",
      monthlyCtc: r.annualCtc / 12,
      baseAmount: r.gross - overtimeAmount,
      overtimeAmount,
      // Hourly staff never "lose" salary (paid per hour → ₹0); a full-timer's
      // loss is the monthly shortfall, rounded to the rupee EXACTLY as the
      // Attendance KPI does (Math.round) so the two never differ by a paisa.
      attendanceDeduction: hourly ? 0 : Math.max(0, Math.round(r.annualCtc / 12 - (r.gross - overtimeAmount))),
      gross: r.gross,
      pt: r.pt,
      advance: r.advances,
      previousPending: r.pendingBalanceIn,
      finalPayment: r.netPayable,
      salaryGiven: r.disbursedAmount,
      paid: r.disbursed,
      hourly,
      // The engine's frozen figures, read straight off the stored run (0211) —
      // the view and the payslip therefore show the SAME hours and rate. NULL
      // on runs generated before the columns existed; the view omits the hours
      // block rather than printing a confident 0h.
      workedHours: r.workedHours,
      targetHours: r.targetHours,
      overtimeHours: r.overtimeHours ?? 0,
      hourlyRate: r.hourlyRate,
      cells: [],
      weekTargetMinutes: null,
      present: r.payableDays,
      absent: 0,
      halfDay: 0,
      finalWorkingDays: r.payableDays - r.lateDeductionDays,
      daysInMonth: r.daysInMonth,
      remarks: null,
    });
  }

  // Tier 1 — the open month always wins.
  const months = [...byMonth.values()].sort((a, b) => b.month.localeCompare(a.month));
  return withRealAttendance(employeeId, months, now);
}

/**
 * Replace the attendance figures with what the ATTENDANCE engine actually
 * graded.
 *
 * ── WHY THE SALARY BREAKDOWN CANNOT SUPPLY THESE ───────────────────────────
 * `computeForRow` returns a PAY breakdown, and pay is not attendance. It carries
 * `payableDays` and `effectiveDays` but has no notion of "absent" or "half day"
 * at all — which is why those two were hard-coded to 0 here, and why every
 * employee saw a zero for them however much they had actually missed.
 *
 * Worse for the hourly shifts: on the hourly and schedule-based bases the
 * breakdown sets `payableDays` to 0 by construction, because those months are
 * priced in hours. The days grid then read 0 / 0 / 0 / 0 for exactly the people
 * whose month was fullest. That is the screen this function exists to fix.
 *
 * ── FAIL-SOFT, PER MONTH ───────────────────────────────────────────────────
 * `allSettled`, and a month whose grading fails keeps the figures it already
 * had. A salary page that cannot render because the attendance engine hiccuped
 * would be a worse outcome than a stale day count, and the MONEY on this page
 * never comes from here.
 *
 * COST: one grading pass per month shown, run in parallel. The list is a handful
 * of months for one person, not a roster.
 */
async function withRealAttendance(
  employeeId: string,
  months: MySalaryMonth[],
  now: Date,
): Promise<MySalaryMonth[]> {
  if (months.length === 0) return months;
  const refTodayISO = localDateString("Asia/Kolkata", now);

  // The viewer's OWN weekly target, resolved through the same config resolver
  // the grader uses. Read once for all months — it is a property of the person,
  // not the month, and the calendar must never show a 27h week against 54h.
  const [org, empRow] = await Promise.all([
    getOrgSettings().catch(() => null),
    db.query.employees.findFirst({ where: eq(employees.id, employeeId) }).catch(() => null),
  ]);
  const weekTargetMinutes = empRow ? employeeEffectiveConfig(empRow, org).weeklyTargetMinutes : null;

  const graded = await Promise.allSettled(
    months.map((m) => {
      const [y, mo] = m.month.split("-").map(Number);
      return getEmployeeMonthStatus(employeeId, y ?? 0, mo ?? 0, refTodayISO);
    }),
  );

  return months.map((m, i) => {
    const g = graded[i];
    if (!g || g.status !== "fulfilled") {
      console.error("[my-salary] attendance grading failed for", m.month);
      return m;
    }
    const s = g.value.summary;
    const workedHours = s.totalWorkedMinutes / 60;

    // ── ELAPSED DAYS ONLY ───────────────────────────────────────────────
    // `MonthSummary` counts the WHOLE month, and the grader marks every future
    // working day "A" because it has no punches yet. Read straight, it reports
    // someone as absent for days that have not happened: on 26 August this page
    // called Om absent for the 27th, 29th and 31st.
    //
    // The KPI strip on the Attendance page escapes this because `summarize`
    // skips `!d.elapsed`. Doing the same here is what makes the two screens
    // agree — and `OFF_CODES` is imported rather than restated so "what is a
    // working day" has one definition.
    const elapsed = g.value.days.filter(
      (d) => d.logDate <= refTodayISO && d.code !== NOT_JOINED_CODE,
    );
    const workingDays = elapsed.filter((d) => !d.isWeeklyOff && !OFF_CODES.has(d.code));
    // These three PARTITION `workingDays`, so the KPI row always adds up. A day
    // is worked (full or holiday-worked), half, or absent — nothing else is an
    // expected working day by the time the off codes are gone.
    const presentDays = workingDays.filter((d) => d.dayValue >= 1).length;
    const halfDays = workingDays.filter((d) => d.dayValue === 0.5).length;
    const absentDays = workingDays.filter((d) => d.dayValue === 0).length;

    // ── MONTHS THE ENGINE HAS NO RECORD OF ──────────────────────────────
    // Zero elapsed working days means the punch engine knows nothing about this
    // month for this person — every day graded "not joined", or the month has
    // not started. That is NOT the same statement as "they worked none of it",
    // and overwriting with 0/0/0 turns an absence of evidence into a confident
    // and wrong claim on their own payslip.
    //
    // It is the normal case for anyone whose history predates their app
    // account. Rutvisha Mehta's employee row was created 2026-08-27, while her
    // March–August record was imported from the HR sheet on 2026-08-02; the
    // legacy tier loads those real figures out of `salary_breakup` and this
    // function was then flattening all six months to zero.
    //
    // So keep what the row already carries. `cells` stays empty too: the view
    // guards on `cells.length > 0` and omits the calendar, which is honest —
    // drawing 31 "not joined" squares would not be.
    if (workingDays.length === 0) return m;

    return {
      ...m,
      // Same mapping the Attendance page uses, so the two calendars can never
      // disagree about what a day looked like.
      cells: g.value.days.map((d) => ({
        date: d.logDate,
        day: Number(d.logDate.slice(8, 10)),
        weekday: d.weekday,
        code: d.code,
        late: d.late,
        leftEarly: d.leftEarly,
        isWeeklyOff: d.isWeeklyOff,
        inAt: d.inAt,
        outAt: d.outAt,
        workedMinutes: d.workedMinutes,
        future: d.logDate > refTodayISO,
      })),
      weekTargetMinutes,
      // A worked holiday counts as a day present (dayValue >= 1), so it is
      // already inside `presentDays` — counted from the day rows rather than
      // added on afterwards, which is how it can never be double-counted.
      present: presentDays,
      absent: absentDays,
      halfDay: halfDays,
      // A COUNT of expected working days, not `payableDays` — that is a Σ of day
      // VALUES across the whole month (30 for Om, including holidays and weekly
      // offs), which made "worked X of Y" compare a count against a weighted sum.
      finalWorkingDays: workingDays.length,
      // Keep the engine's own figure when it produced one (the hourly bases
      // compute PAYABLE hours, which is not the same as hours at a desk); fall
      // back to what was actually worked, which is what the half-day shifts on a
      // monthly CTC have no other source for.
      workedHours: m.workedHours ?? (workedHours > 0 ? round1(workedHours) : null),
    };
  });
}

const round1 = (n: number): number => Math.round(n * 10) / 10;
