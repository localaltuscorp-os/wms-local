import "server-only";
import { refreshSalaryRun } from "./refresh-run";
import { myRuns } from "@/lib/queries/salary";
import { mySalaryBreakup } from "@/lib/queries/salary-breakup";
import {
  isHourlyShift,
  asWorkerType,
  payBasisFor,
  type WorkerType,
} from "@/lib/attendance/worker-type";
import {
  isHoursPayrollMonth,
  payrollMonthFor,
} from "@/lib/attendance/payroll-month";
import {
  buildDayLedger,
  ledgerReconciles,
  type DayLedger,
  type LedgerPay,
} from "@/lib/salary/day-ledger";
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

  /**
   * THE DAILY SALARY REPORT for this month — every day, grouped into weeks,
   * with the day's hours, its balance and its share of the month's pay.
   *
   * Built from the SAME grading pass that produces `cells` (see
   * `withRealAttendance`), so it costs no extra query: the days are already in
   * hand and the ledger is pure arithmetic over them plus the money already on
   * this object.
   *
   * Null when the month cannot be attributed day by day at all — a month the
   * punch engine has no record of, or one whose grading failed. A month whose
   * PAY does not decompose (a retainer, a frozen pre-cutover month) still gets
   * a ledger: it carries the real attendance with the money columns explicitly
   * blank and a note saying why. See lib/salary/day-ledger.ts.
   */
  ledger: DayLedger | null;

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
/**
 * WHICH MONTHS COME BACK WITH A DAILY LEDGER ATTACHED.
 *
 * Building one is free — it is pure arithmetic over days this loader has
 * already graded to draw the calendar. SENDING one is not: a month of rows is
 * about 30KB of serialised payload, so a nine-month history would inline a
 * quarter of a megabyte into the page for the eight months nobody is looking
 * at.
 *
 * So the page asks for the month it is about to show, and
 * `loadMonthLedger` fetches another when the employee picks one. The default
 * is deliberately NONE rather than ALL: a caller that forgets to ask gets a
 * small payload, never a silently enormous one.
 */
export interface MySalaryOptions {
  /** Months (yyyy-mm) to attach a ledger to, or "first" for the newest. */
  ledgerMonths?: readonly string[] | "first" | "none";
}

export async function loadMySalaryMonths(
  employeeId: string,
  workerType: string | null | undefined,
  now: Date = new Date(),
  opts: MySalaryOptions = {},
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
  // of stored rows. Fail-soft and throttled — see refreshSalaryRun; a refusal
  // (paid out, recomputed moments ago) simply leaves the stored run in place.
  await refreshSalaryRun(employeeId, open, now);

  let months = await loadStoredMonths(employeeId, hourly);

  // `months` is newest-first, so "first" is the month the page opens on. Pinned
  // to a value rather than read through `months` on every call, because the
  // refresh below may replace that array.
  const want = opts.ledgerMonths ?? "none";
  const firstMonth = months[0]?.month;
  const ledgerFor: (month: string) => boolean =
    want === "none"
      ? () => false
      : want === "first"
        ? (m) => m === firstMonth
        : (m) => want.includes(m);

  // ── A MONTH ABOUT TO BE BROKEN DOWN DAY BY DAY MUST BE CURRENT ───────
  // The Daily Salary Report attributes the STORED run's rupees across the days
  // as graded RIGHT NOW. For the open month those agree, because the refresh
  // above just recomputed it. A closed month is where they drift: attendance
  // keeps moving underneath a run issued weeks ago — a backfilled punch, a leave
  // approved late, a holiday declared afterwards — and when the two cannot be
  // reconciled `buildDayLedger` correctly refuses to print per-day money and the
  // employee gets a report with every rupee column blank. Verified in
  // production: 23 of 25 stored August 2026 runs no longer matched the month as
  // graded.
  //
  // Since closed runs are no longer frozen (spec §10), the fix is to bring the
  // month the employee actually asked to see up to date rather than to withhold
  // its figures. Only months a ledger was requested for — a page view still
  // costs exactly one recompute, not one per month of history — and only rows
  // that came from `salary_runs`, since the legacy tier has no run to refresh.
  //
  // `refreshSalaryRun` never touches `disbursed`, `disbursed_amount` or
  // `approved_by_id`, so what was PAID is untouched; what changes is what was
  // owed. Fail-soft: an outcome that is not "refreshed" simply leaves the
  // stored run in place and the report falls back to attendance-only.
  const restale = months
    .filter((m) => m.source === "run" && m.month !== open && ledgerFor(m.month))
    .map((m) => m.month);
  if (restale.length > 0) {
    const outcomes = await Promise.all(
      restale.map((m) => refreshSalaryRun(employeeId, m, now)),
    );
    if (outcomes.includes("refreshed")) months = await loadStoredMonths(employeeId, hourly);
  }

  return withRealAttendance(employeeId, months, wt, now, ledgerFor);
}

/**
 * THE TWO STORED TIERS, MERGED — a pure read, callable twice.
 *
 * Split out of `loadMySalaryMonths` for exactly that: the caller recomputes a
 * closed run when the report is about to attribute it, and then has to read the
 * merged months back. Doing it through one function is what keeps the money on
 * the card and the money in the report from ever coming from two different
 * reads.
 */
async function loadStoredMonths(
  employeeId: string,
  hourly: boolean,
): Promise<MySalaryMonth[]> {
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
      ledger: null,
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
      ledger: null,
      present: r.payableDays,
      absent: 0,
      halfDay: 0,
      finalWorkingDays: r.payableDays - r.lateDeductionDays,
      daysInMonth: r.daysInMonth,
      remarks: null,
    });
  }

  // Tier 1 — the open month always wins.
  return [...byMonth.values()].sort((a, b) => b.month.localeCompare(a.month));
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
  wt: WorkerType,
  now: Date,
  /** Which months should carry a daily ledger — see MySalaryOptions. */
  wantLedger: (month: string) => boolean,
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
  // The WHOLE resolved config, not just the weekly target: the daily target is
  // what a "/ 9h" in the report means, and the reconciliation divides by it.
  const cfg = empRow ? employeeEffectiveConfig(empRow, org) : null;
  const weekTargetMinutes = cfg?.weeklyTargetMinutes ?? null;

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

    // ── THE DAILY SALARY REPORT ─────────────────────────────────────────
    // Built here because everything it needs is already here: the graded days
    // this function just fetched, the employee's resolved schedule, and the
    // month's authoritative money sitting on `m` (read off the stored run, the
    // one the payslip and Accounts also read). No second query, and above all
    // no second calculation — `buildDayLedger` ATTRIBUTES the engine's figures,
    // it does not recompute them. See lib/salary/day-ledger.ts.
    //
    // Fail-soft like everything else in this function: a ledger that cannot be
    // built costs the report, never the page or the money above it.
    let ledger: DayLedger | null = null;
    if (cfg && wantLedger(m.month)) {
      try {
        const { recon, hours } = payrollMonthFor(g.value.days, {
          month: m.month,
          cfg,
          refTodayISO,
        });
        const base = {
          month: m.month,
          monthLabel: m.label,
          days: g.value.days,
          cfg: {
            dailyTargetMinutes: cfg.dailyTargetMinutes,
            weeklyTargetMinutes: cfg.weeklyTargetMinutes,
          },
          recon,
          hours,
          refTodayISO,
        };
        const attributed = buildDayLedger({ ...base, pay: ledgerPayFor(m, wt) });

        // ── THE MONEY HAS TO ADD UP, OR IT DOES NOT GET SHOWN ─────────
        // The rupees come from the STORED run — the figure on the payslip and
        // in the card above this report. The hours come from grading the month
        // right now. For the open month those agree, because
        // `refreshSalaryRun` above recomputed the run from this very
        // attendance moments ago.
        //
        // A CLOSED month is different by design: its run is frozen as it was
        // issued, while attendance keeps moving underneath it (a backfilled
        // punch, a leave approved later, a holiday added, a profile edited).
        // Verified against production: 23 of 25 stored August 2026 runs no
        // longer matched the live grading, several by thousands of rupees.
        //
        // When the two cannot be reconciled, showing per-day earnings would put
        // a breakdown on screen that contradicts the payslip directly above it.
        // So the attendance stays — it is real, and it is the current record —
        // and the money is withheld with a reason. Self-healing: regenerate the
        // month's run and the columns come back.
        ledger = ledgerReconciles(attributed)
          ? attributed
          : buildDayLedger({
              ...base,
              pay: { mode: "attendance_only", note: STALE_RUN_NOTE },
            });
      } catch (err) {
        console.error("[my-salary] daily ledger failed for", m.month, err);
      }
    }

    return {
      ...m,
      ledger,
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
        remoteMode: d.remoteMode,
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

/**
 * WHICH ENGINE PAID THIS MONTH, and therefore how its rupees may be split
 * across days.
 *
 * The branch mirrors `computeForRow` (lib/salary/generate.ts) exactly, and it
 * has to: attributing a month with the wrong model would produce per-day
 * figures that do not add up to the payslip, which is the one thing the report
 * must never do. `payBasisFor` is the app's single "how is this person paid"
 * branch point and is read here rather than re-derived.
 *
 * Anything that cannot be attributed returns `attendance_only` WITH A REASON.
 * The attendance is still shown — it is real and it is graded — and the money
 * columns are blank rather than zero, because "we cannot break this down" and
 * "you earned nothing" are very different sentences to read on your own pay
 * page.
 */
function ledgerPayFor(m: MySalaryMonth, wt: WorkerType): LedgerPay {
  const basis = payBasisFor(wt);

  if (basis === "fixed_fee") {
    return {
      mode: "attendance_only",
      note:
        "Your pay is a fixed monthly retainer, so attendance does not change the amount " +
        "and there is no per-day share to show. Your hours are below for the record.",
    };
  }

  // Months before the hours-based payroll began were priced the old day-based
  // way from the HR sheet and have already been paid. Re-deriving them from
  // today's grader would rewrite history — see PAYROLL_HOURS_FROM.
  if (!isHoursPayrollMonth(m.month)) {
    return {
      mode: "attendance_only",
      note:
        "This month was finalised before pay moved to an hourly basis, so its salary " +
        "cannot be broken down by day. The attendance below is still your graded record.",
    };
  }

  // ── THE FULL-TIMER'S DAILY MODEL (spec §4) ───────────────────────────────
  // Paid by the calendar day, so the per-day attribution is the engine's own
  // arithmetic replayed term by term rather than a share worked backwards out
  // of a monthly figure. `daysInMonth` comes off the run, which stored the
  // month's real length — never an assumed 30.
  if (basis === "monthly_ctc") {
    if (!(m.monthlyCtc > 0) || !(m.daysInMonth > 0)) {
      return {
        mode: "attendance_only",
        note:
          "This month's salary record does not carry a monthly figure, so a per-day breakdown " +
          "is not available. The attendance below is still your graded record.",
      };
    }
    return {
      mode: "daily",
      dailyRate: m.monthlyCtc / m.daysInMonth,
      gross: m.gross,
    };
  }

  // No rate on the run — a row generated before the column existed (0211), or a
  // month with no pay configuration at all. Inventing a rate to fill the
  // columns would be the exact failure this report exists to prevent.
  if (m.hourlyRate == null || !(m.hourlyRate > 0)) {
    return {
      mode: "attendance_only",
      note:
        "This month's salary record does not carry an hourly rate, so a per-day breakdown " +
        "is not available. The attendance below is still your graded record.",
    };
  }

  if (basis === "hourly") {
    // `computeHourlySalary`: paid for hours actually worked, at one rate, with
    // no cap — every worker on this basis is `isHourlyShift`, and therefore
    // `earnsOvertime`, so the monthly cap in that function is unreachable for
    // them and the anchor it would compare against is never read.
    return {
      mode: "hours_worked",
      hourlyRate: m.hourlyRate,
      gross: m.gross,
      monthlyAnchor: 0,
      surplusPaid: true,
    };
  }

  // Unreachable today: `payBasisFor` returns exactly three values and all three
  // are handled above. Kept as an honest fallback rather than a cast, so a
  // FOURTH pay basis added later degrades to "we cannot break this down"
  // instead of being attributed by whichever branch happened to fall through.
  return {
    mode: "attendance_only",
    note:
      "This month was paid on a basis this report does not know how to break down by day. " +
      "The attendance below is still your graded record.",
  };
}

/**
 * ONE month's daily ledger, for the month picker.
 *
 * Goes through `loadMySalaryMonths` rather than reimplementing the tiering,
 * the open-month refresh and the pay-basis branch. That costs a grading pass
 * per month in the employee's history — exactly what a My Salary page view
 * already costs, so this is not a new order of work — and it buys the one
 * thing that matters here: the report can never be assembled from a different
 * set of inputs than the card above it.
 *
 * Returns null for a month with no attributable record, which the view
 * renders as "no report" rather than as an error.
 */
export async function loadMonthLedger(
  employeeId: string,
  workerType: string | null | undefined,
  month: string,
  now: Date = new Date(),
): Promise<DayLedger | null> {
  const months = await loadMySalaryMonths(employeeId, workerType, now, {
    ledgerMonths: [month],
  });
  return months.find((m) => m.month === month)?.ledger ?? null;
}

/**
 * Shown when the stored run cannot be reconciled against the current graded
 * month. Deliberately factual: it explains WHY the columns are blank without
 * suggesting the payslip is wrong, because it is not — it is the record of
 * what was issued, and it is the authoritative figure either way.
 */
const STALE_RUN_NOTE =
  "The salary recorded for this month was worked out from an earlier attendance record, so it " +
  "cannot be broken down day by day against your current one. The attendance and hours below " +
  "are up to date; the salary shown above is the amount on your payslip.";
