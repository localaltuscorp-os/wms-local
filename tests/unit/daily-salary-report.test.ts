import { describe, it, expect } from "vitest";
import { computeDayCode } from "@/lib/attendance/status";
import {
  resolveEffectiveConfig,
  toAttendanceSchedule,
} from "@/lib/attendance/effective-config";
import { payrollMonthFor } from "@/lib/attendance/payroll-month";
import { computeDailySalary, computeHourlySalary } from "@/lib/salary/compute";
import { hourlyMonthlyAnchor } from "@/lib/attendance/worker-type";
import {
  applyLedgerView,
  buildDayLedger,
  filterLedgerDays,
  hm,
  inr,
  isFiltered,
  ledgerReconciles,
  LEDGER_FILTER_NONE,
  LEDGER_RECONCILE_TOLERANCE,
  signedHm,
  signedInr,
  shortDate,
  shortDow,
  sortLedgerDays,
  viewTotals,
  type DayLedger,
  type LedgerDay,
  type LedgerDayInput,
  type LedgerPay,
} from "@/lib/salary/day-ledger";

/**
 * THE DAILY SALARY REPORT — one month, attributed day by day.
 *
 * ── WHAT THIS FILE IS ACTUALLY TESTING ─────────────────────────────────────
 * Not "does the component render". The report makes ONE claim that matters and
 * it is arithmetic: that the per-day rupees it shows an employee add up to the
 * gross on their payslip. Everything else on the screen is a formatting detail;
 * that claim is the product.
 *
 * So every money test here drives the REAL chain end to end —
 *
 *     computeDayCode            (the actual grader, day by day)
 *       → payrollMonthFor       (the actual reconciliation + payable hours)
 *         → computeScheduleHourlySalary / computeHourlySalary
 *                               (the actual payroll engine)
 *           → buildDayLedger    (the attribution under test)
 *
 * — and then asserts `reconciliation.residual` is under a rupee. Nothing is
 * stubbed. If the engine's rules change, these fail, which is the point: the
 * ledger is a derived view and it has no licence to drift from its source.
 *
 * The §19 scenario list drives the cases: no holidays, several holidays, paid
 * leave, unpaid leave, half day, absence, full day, surplus, weekly deficit,
 * WFH / on field / client site, worked holiday, missing check-in, missing
 * check-out, multiple weeks, filters, sorting, monthly totals, reconciliation.
 */

/* ────────────────────────────────────────────────────────────────────────────
   The employees and the month
   ──────────────────────────────────────────────────────────────────────────── */

/** A standard full-timer: 10:00–19:00 (9h), Mon–Sat, Sunday off, 54h week. */
const FULL_TIME = {
  workerType: "full_time",
  attOfficialStart: "10:00:00",
  attOfficialEnd: "19:00:00",
  attLateAfter: null,
  attEarlyBefore: null,
  weeklyOff: 0,
};

/** An hourly shift with an admin-set 30h week — priced by hours worked. */
const SHIFT_30H = {
  workerType: "second_half",
  attOfficialStart: "15:00:00",
  attOfficialEnd: "20:00:00",
  attLateAfter: null,
  attEarlyBefore: null,
  weeklyTargetMinutes: 30 * 60,
  weeklyOff: 0,
};

const FT = resolveEffectiveConfig(FULL_TIME);
const FT_SCHED = toAttendanceSchedule(FT);
const PT = resolveEffectiveConfig(SHIFT_30H);
const PT_SCHED = toAttendanceSchedule(PT);

/**
 * August 2026. Chosen because 1 August is a SATURDAY, so the month opens with a
 * two-day partial week (Sat 1 – Sun 2) exactly like the spec's own §2 example
 * — "WEEK 1 · 01 Aug – 02 Aug". That partial week is where a naive weekly
 * grouping goes wrong, so it is worth having in every fixture.
 */
const MONTH = "2026-08";
const MONTH_LABEL = "August 2026";
/** The last day, so a fully-elapsed month is graded against its own end. */
const EOM = "2026-08-31";

const MONTHLY_SALARY = 54_000;
const SHIFT_MONTHLY = 12_000;
/** August's real length. The daily model divides by THIS, never by 30 (spec §4). */
const DAYS_IN_MONTH = 31;

function daysOfMonth(month: string): string[] {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: last }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}

function weekdayOf(ymd: string): number {
  return new Date(`${ymd}T00:00:00Z`).getUTCDay();
}

function clock(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

interface Punch {
  inAt: string | null;
  outAt: string | null;
}

interface MonthSpec {
  holidays?: readonly string[];
  leave?: Readonly<Record<string, "paid" | "unpaid">>;
  /** Approved remote-work mode per date. Display only — never money. */
  remote?: Readonly<Record<string, string>>;
  /** Explicit punches for a date, overriding the default full day. */
  punches?: Readonly<Record<string, Punch>>;
  /** Worked minutes for an ordinary day. Default: the employee's full day. */
  workedMinutes?: (ymd: string) => number;
  /** A part-time fixture grades against the shift schedule. */
  shift?: boolean;
  /**
   * Today, for a month in progress. Days after it get NO punches, which is
   * the only realistic fixture: the grader marks a future working day "A"
   * precisely because nothing has been recorded against it yet.
   */
  refTodayISO?: string;
}

/**
 * Grade a whole month through the REAL day engine, mirroring
 * `lib/queries/attendance-status.gradeMonth` — holiday-over-leave precedence
 * included, so a holiday inside an approved leave does not burn the leave.
 */
function gradeMonth(spec: MonthSpec = {}): LedgerDayInput[] {
  const cfg = spec.shift ? PT : FT;
  const sched = spec.shift ? PT_SCHED : FT_SCHED;
  const holidays = new Set(spec.holidays ?? []);
  const leave = spec.leave ?? {};
  const remote = spec.remote ?? {};
  const punches = spec.punches ?? {};
  const startMin = 10 * 60;
  const worked = spec.workedMinutes ?? (() => cfg.dailyTargetMinutes);

  return daysOfMonth(MONTH).map((ymd) => {
    const wd = weekdayOf(ymd);
    const isWeeklyOff = wd === cfg.weeklyOff;
    const isHoliday = holidays.has(ymd);
    // A holiday wins over leave: you do not spend a leave day on a day off.
    const onLeave = isHoliday ? null : (leave[ymd] ?? null);

    const reached = spec.refTodayISO == null || ymd <= spec.refTodayISO;
    let punch: Punch;
    if (punches[ymd]) {
      punch = punches[ymd]!;
    } else if (reached && !isWeeklyOff && !isHoliday && !onLeave) {
      const mins = worked(ymd);
      punch =
        mins > 0
          ? { inAt: clock(startMin), outAt: clock(startMin + mins) }
          : { inAt: null, outAt: null };
    } else {
      punch = { inAt: null, outAt: null };
    }

    const g = computeDayCode(punch, sched, { isWeeklyOff, isHoliday, leave: onLeave }, "23:59");
    return {
      logDate: ymd,
      weekday: wd,
      code: g.code,
      dayValue: g.dayValue,
      workedMinutes: g.workedMinutes,
      inAt: punch.inAt,
      outAt: punch.outAt,
      isWeeklyOff,
      late: g.late,
      leftEarly: g.leftEarly,
      lateWaived: g.lateWaived,
      remoteMode: remote[ymd] ?? null,
    };
  });
}

/**
 * Run a graded month all the way through the payroll engine and build the
 * ledger from what the engine actually produced.
 *
 * This IS the production wiring — `lib/salary/my-salary.ts` does the same three
 * calls with the same arguments — so a divergence between the report and the
 * payslip shows up here first.
 */
function ledgerFor(
  days: LedgerDayInput[],
  opts: { refTodayISO?: string; monthlySalary?: number } = {},
): DayLedger {
  const refTodayISO = opts.refTodayISO ?? EOM;
  const monthlySalary = opts.monthlySalary ?? MONTHLY_SALARY;
  const { recon, hours, payroll } = payrollMonthFor(days, {
    month: MONTH,
    cfg: FT,
    refTodayISO,
  });
  // THE FULL-TIMER'S MODEL (spec §4) — exactly what `computeForRow` runs:
  // monthlySalary / calendar days, times the elapsed day-values.
  const b = computeDailySalary({
    monthlySalary,
    daysInMonth: DAYS_IN_MONTH,
    payableDayValue: payroll.payableDayValue,
    ptExempt: true,
    tdsMonthly: 0,
    advances: 0,
    pendingBalanceIn: 0,
  });
  const pay: LedgerPay = {
    mode: "daily",
    dailyRate: monthlySalary / DAYS_IN_MONTH,
    gross: b.gross,
  };
  return buildDayLedger({
    month: MONTH,
    monthLabel: MONTH_LABEL,
    days,
    cfg: { dailyTargetMinutes: FT.dailyTargetMinutes, weeklyTargetMinutes: FT.weeklyTargetMinutes },
    recon,
    hours,
    pay,
    refTodayISO,
  });
}

/** The same, for an hourly shift through `computeHourlySalary`. */
function shiftLedgerFor(
  days: LedgerDayInput[],
  opts: { refTodayISO?: string } = {},
): DayLedger {
  const refTodayISO = opts.refTodayISO ?? EOM;
  const { recon, hours } = payrollMonthFor(days, { month: MONTH, cfg: PT, refTodayISO });
  const workedMinutes = days.reduce((s, d) => s + d.workedMinutes, 0);
  const anchor = hourlyMonthlyAnchor({ annualCtc: 0, monthlyPayAtTarget: SHIFT_MONTHLY });
  const b = computeHourlySalary({
    monthlyPayAtTarget: anchor,
    weeklyTargetHours: PT.weeklyTargetMinutes / 60,
    daysInMonth: 31,
    workedMinutes,
    overtimeEligible: true, // every hourly shift earns surplus
    eligibleTargetHours: hours.targetHours > 0 ? hours.targetHours : null,
    ptExempt: true,
    tdsMonthly: 0,
    advances: 0,
    pendingBalanceIn: 0,
  });
  const pay: LedgerPay = {
    mode: "hours_worked",
    hourlyRate: b.hourlyRate ?? 0,
    gross: b.gross,
    monthlyAnchor: anchor,
    surplusPaid: true,
  };
  return buildDayLedger({
    month: MONTH,
    monthLabel: MONTH_LABEL,
    days,
    cfg: { dailyTargetMinutes: PT.dailyTargetMinutes, weeklyTargetMinutes: PT.weeklyTargetMinutes },
    recon,
    hours,
    pay,
    refTodayISO,
  });
}

const dayAt = (l: DayLedger, date: string): LedgerDay => {
  const d = l.days.find((x) => x.date === date);
  if (!d) throw new Error(`no ledger row for ${date}`);
  return d;
};

/** The claim the whole report rests on. */
function expectReconciles(l: DayLedger): void {
  expect(l.reconciliation).not.toBeNull();
  expect(Math.abs(l.reconciliation!.residual)).toBeLessThan(1);
}

/* ══════════════════════════════════════════════════════════════════════════
   1. THE RECONCILIATION — the report's one load-bearing claim
   ══════════════════════════════════════════════════════════════════════════ */

describe("the daily rupees add up to the payslip", () => {
  it("a clean month with no holidays reconciles to the engine's gross", () => {
    const l = ledgerFor(gradeMonth());
    expectReconciles(l);
    // A complete month pays the full monthly salary, so the attribution has to
    // land on it and not merely near it.
    expect(l.reconciliation!.gross).toBeCloseTo(MONTHLY_SALARY, 0);
  });

  it("reconciles with MULTIPLE holidays in the month", () => {
    // Three holidays, one of them inside the opening partial week.
    const l = ledgerFor(gradeMonth({ holidays: ["2026-08-01", "2026-08-15", "2026-08-26"] }));
    expectReconciles(l);
    expect(l.reconciliation!.gross).toBeCloseTo(MONTHLY_SALARY, 0);
  });

  it("reconciles with paid leave", () => {
    const l = ledgerFor(gradeMonth({ leave: { "2026-08-11": "paid", "2026-08-12": "paid" } }));
    expectReconciles(l);
  });

  it("reconciles with unpaid leave — the case that DOES cost money", () => {
    const l = ledgerFor(gradeMonth({ leave: { "2026-08-11": "unpaid" } }));
    expectReconciles(l);
    expect(l.reconciliation!.gross).toBeLessThan(MONTHLY_SALARY);
  });

  it("reconciles with half days, absences and a surplus all in one month", () => {
    const l = ledgerFor(
      gradeMonth({
        workedMinutes: (ymd) => {
          const d = Number(ymd.slice(8, 10));
          if (d === 5 || d === 6 || d === 7 || d === 10 || d === 11) return 5 * 60; // half days
          if (d === 13 || d === 14) return 0; // absences
          if (d === 18 || d === 19) return 11 * 60; // long days
          return 9 * 60;
        },
      }),
    );
    expectReconciles(l);
  });

  it("reconciles a month in PROGRESS, graded mid-month", () => {
    const l = ledgerFor(gradeMonth({ refTodayISO: "2026-08-12" }), {
      refTodayISO: "2026-08-12",
    });
    expectReconciles(l);
    // Half the month worked, so nothing like the full salary yet.
    expect(l.reconciliation!.gross).toBeLessThan(MONTHLY_SALARY);
    expect(l.reconciliation!.gross).toBeGreaterThan(0);
  });

  it("reconciles an OPEN month that already has approved future leave", () => {
    // The engine credits an approved paid leave and charges an approved unpaid
    // one for the WHOLE month, dates ahead of today included. This is the case
    // that broke when `future` was allowed to zero a row.
    const l = ledgerFor(
      gradeMonth({
        refTodayISO: "2026-08-12",
        leave: { "2026-08-20": "paid", "2026-08-21": "unpaid" },
      }),
      { refTodayISO: "2026-08-12" },
    );
    expectReconciles(l);
    const pl = dayAt(l, "2026-08-20");
    expect(pl.future).toBe(true);
    // Known facts keep their real status rather than hiding behind Upcoming.
    expect(pl.status).toBe("paid_leave");
    // A future PAID leave is a known fact, but it has not been earned YET —
    // the daily model pays a day when the day arrives, so the column is blank
    // rather than ₹0 (which would read as "you earned nothing that day").
    expect(pl.earned).toBeNull();
    expect(dayAt(l, "2026-08-21").status).toBe("unpaid_leave");
    // The ADJ. column compares a day with a normal one, and 21 August has not
    // happened. Nothing has been earned there yet, so there is nothing to
    // compare — blank, rather than a confident "−₹1,741.94" for a loss the
    // employee has not taken.
    expect(dayAt(l, "2026-08-21").earned).toBeNull();
    expect(dayAt(l, "2026-08-21").adjustment).toBeNull();
  });

  it("reconciles a month with nothing worked at all — the weekly offs still pay", () => {
    const l = ledgerFor(gradeMonth({ workedMinutes: () => 0 }));
    expectReconciles(l);
    // NOT zero, and that is the daily model working correctly: a weekly off is
    // a paid day that owes no work (spec §4). August 2026 has five Sundays, so
    // someone who worked none of it still earns those five days.
    const dailyRate = MONTHLY_SALARY / DAYS_IN_MONTH;
    expect(l.reconciliation!.gross).toBeCloseTo(dailyRate * 5, 0);
  });

  it("unpaid leave simply earns nothing — it can never drive pay negative", () => {
    // On the daily model an unpaid day is worth 0, not a charge levied against
    // other days, so "the deduction exceeded the earnings" is not a state that
    // can arise. Pay is a SUM of non-negative day-values and floors at zero by
    // construction rather than by a clamp.
    const l = ledgerFor(
      gradeMonth({
        workedMinutes: () => 0,
        leave: { "2026-08-11": "unpaid", "2026-08-12": "unpaid", "2026-08-13": "unpaid" },
      }),
    );
    expectReconciles(l);
    expect(l.reconciliation!.chargesBeyondEarnings).toBe(0);
    expect(l.reconciliation!.gross).toBeGreaterThanOrEqual(0);
    for (const d of ["2026-08-11", "2026-08-12", "2026-08-13"]) {
      expect(dayAt(l, d).earned).toBe(0);
    }
  });

  it("reconciles a worked holiday, which is credited rather than counted", () => {
    const l = ledgerFor(
      gradeMonth({
        holidays: ["2026-08-15"],
        punches: { "2026-08-15": { inAt: "10:00", outAt: "18:00" } },
      }),
    );
    expectReconciles(l);
    const hp = dayAt(l, "2026-08-15");
    expect(hp.code).toBe("HP");
    // The hours were worked, but they are not hours toward the target: the day
    // is paid at the daily target instead. Both facts are visible.
    expect(hp.workedMinutes).toBe(8 * 60);
    expect(hp.requiredMinutes).toBeNull();
    expect(hp.payableMinutes).toBe(FT.dailyTargetMinutes);
  });

  it("reconciles an HOURLY SHIFT through computeHourlySalary", () => {
    const l = shiftLedgerFor(gradeMonth({ shift: true }));
    expectReconciles(l);
    expect(l.mode).toBe("hours_worked");
  });

  it("reconciles an hourly shift that worked well past its target", () => {
    const l = shiftLedgerFor(
      gradeMonth({ shift: true, workedMinutes: () => 8 * 60 }), // 8h against a 5h day
    );
    expectReconciles(l);
    // Surplus is paid on this basis, so it is inside the rows rather than on a
    // line of its own — that is what makes the double-count impossible.
    expect(l.reconciliation!.additionalHoursPay).toBe(0);
    expect(l.reconciliation!.surplusNotPayable).toBe(0);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   2. THE ENGINE'S MONTH-LEVEL EFFECTS ARE NAMED, NOT HIDDEN
   ══════════════════════════════════════════════════════════════════════════ */

describe("month-level effects are reported as their own lines", () => {
  it("a full-timer's surplus is never money, and never quietly hidden either", () => {
    // Every day 11h against a 9h target — a large month-end surplus. On the
    // daily model it cannot become pay because pay does not read hours at all,
    // so there is no "surplus not payable" line to report: the day was already
    // worth exactly one day.
    const l = ledgerFor(gradeMonth({ workedMinutes: () => 11 * 60 }));
    expectReconciles(l);
    expect(l.reconciliation!.surplusNotPayable).toBe(0);
    expect(l.reconciliation!.additionalHoursPay).toBe(0);
    // A complete month pays the full salary and not a rupee more, however long
    // the days were.
    expect(l.reconciliation!.gross).toBeCloseTo(MONTHLY_SALARY, 0);
    // And the rows still show what was worked: the report does not quietly
    // shave the hours to make the money come out.
    expect(dayAt(l, "2026-08-10").workedMinutes).toBe(11 * 60);
    expect(dayAt(l, "2026-08-10").balanceMinutes).toBe(2 * 60);
  });

  it("has no whole-hour round-down to explain — days are not hours", () => {
    // 8h37m every day. Under the retired hourly engine the stray 37 minutes
    // were floored away and the lost pay had to be reported as its own line.
    // A day is a day, so nothing is lost and the line is structurally zero.
    const l = ledgerFor(gradeMonth({ workedMinutes: () => 8 * 60 + 37 }));
    expectReconciles(l);
    expect(l.reconciliation!.roundedDownToWholeHours).toBe(0);
  });

  it("a half day earns HALF a day, on every half day — no grace, no separate charge", () => {
    // Six half-days. The retired engine waived the first three and then levied
    // a charge for the rest; the daily model has no such step. Every half day
    // is simply worth 0.5 of the daily rate, which is both simpler and what the
    // spec asks for (§4).
    const halves = new Set([3, 4, 5, 6, 7, 8].map((d) => `2026-08-${String(d).padStart(2, "0")}`));
    const l = ledgerFor(
      gradeMonth({
        workedMinutes: (ymd) => (halves.has(ymd) ? 5 * 60 : 6 * 60),
      }),
    );
    expectReconciles(l);
    const dailyRate = MONTHLY_SALARY / DAYS_IN_MONTH;
    for (const ymd of halves) {
      const d = dayAt(l, ymd);
      expect(d.code).toBe("H/D");
      expect(d.earned).toBeCloseTo(dailyRate / 2, 2);
      // And the ADJ. column says what it cost, measured against a normal day.
      expect(d.standardEarning).toBeCloseTo(dailyRate, 2);
      expect(d.adjustment).toBeCloseTo(-dailyRate / 2, 2);
    }
    // Every OTHER day reads flat: under the daily model a full day, a weekly off
    // and a declared holiday are all worth exactly one daily rate.
    for (const d of l.days) {
      const expected = d.code === "H/D" ? -dailyRate / 2 : d.code === "A" ? -dailyRate : 0;
      expect(d.adjustment ?? 0).toBeCloseTo(expected, 2);
    }
    // AND IT IS STILL NOT A CHARGE. The earning already nets it, so none of it
    // may reach the arithmetic that closes on the gross — otherwise every half
    // day would be docked twice (spec §5).
    expect(l.reconciliation!.attributedAdjustment).toBe(0);
  });

  it("an unpaid-leave day earns nothing — the zero IS the deduction", () => {
    const l = ledgerFor(gradeMonth({ leave: { "2026-08-11": "unpaid" } }));
    const lwp = dayAt(l, "2026-08-11");
    expect(lwp.code).toBe("LWP");
    expect(lwp.earned).toBe(0);
    // The ADJ. column says what the day cost — a whole daily rate — while the
    // money itself stays entirely inside `earned`. Both are true at once, and
    // only one of them is arithmetic: see `attributedAdjustment` below.
    expect(lwp.standardEarning).toBeCloseTo(MONTHLY_SALARY / DAYS_IN_MONTH, 2);
    expect(lwp.adjustment).toBeCloseTo(-MONTHLY_SALARY / DAYS_IN_MONTH, 2);
    expect(l.reconciliation!.attributedAdjustment).toBe(0);
    // Exactly one day's pay less than a month with no unpaid leave.
    const clean = ledgerFor(gradeMonth());
    expect(clean.reconciliation!.gross - l.reconciliation!.gross).toBeCloseTo(
      MONTHLY_SALARY / DAYS_IN_MONTH,
      1,
    );
  });

  it("does NOT charge half-days or unpaid leave on the hours_worked basis", () => {
    // `computeHourlySalary` takes neither input, so attributing either would be
    // a deduction the payslip never made.
    const l = shiftLedgerFor(
      gradeMonth({
        shift: true,
        workedMinutes: () => 2 * 60,
        leave: { "2026-08-11": "unpaid" },
      }),
    );
    expectReconciles(l);
    // The rows DO compare each day with a scheduled one — that is what the ADJ.
    // column is — and on this basis the difference is real money in both
    // directions. What must stay zero is the part that reaches the GROSS:
    // `computeHourlySalary` takes neither a half-day count nor an unpaid-leave
    // count, so charging either to the money would be a deduction the payslip
    // never made.
    expect(l.reconciliation!.attributedAdjustment).toBe(0);
    // 2h against a 5h shift, every day: short, and visibly so.
    expect(dayAt(l, "2026-08-10").adjustment!).toBeLessThan(0);
    // And the unpaid leave earned nothing while costing a scheduled day.
    const lwp = dayAt(l, "2026-08-11");
    expect(lwp.earned).toBe(0);
    expect(lwp.adjustment).toBeCloseTo(-(l.hourlyRate! * PT.dailyTargetMinutes) / 60, 2);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   3. SPECIAL DAYS (spec §10)
   ══════════════════════════════════════════════════════════════════════════ */

describe("special days say the right thing", () => {
  it("a holiday requires nothing, and is PAID a normal day (spec §4)", () => {
    const l = ledgerFor(gradeMonth({ holidays: ["2026-08-15"] }));
    const h = dayAt(l, "2026-08-15");
    expect(h.status).toBe("holiday");
    expect(h.inAt).toBeNull();
    expect(h.outAt).toBeNull();
    expect(h.requiredMinutes).toBeNull();
    expect(h.balanceMinutes).toBeNull();
    // A declared holiday is a paid day off, so it earns the full daily salary
    // while owing no hours. Under the retired hourly model it earned via a
    // credited-hours detour; now it is simply a day worth 1.0.
    expect(h.earned).toBeCloseTo(MONTHLY_SALARY / DAYS_IN_MONTH, 2);
    expect(h.adjustment).toBe(0);
    expect(h.notes.join(" ")).toContain("No hours were required");
  });

  it("a holiday SHRINKS the month's target and costs nothing", () => {
    const clean = ledgerFor(gradeMonth());
    const withHoliday = ledgerFor(gradeMonth({ holidays: ["2026-08-19"] }));
    expect(withHoliday.engine.targetMinutes).toBeLessThan(clean.engine.targetMinutes);
    // A complete month is still paid in full — the holiday removed the hours
    // but not the day's pay (spec §8).
    expect(withHoliday.reconciliation!.gross).toBeCloseTo(clean.reconciliation!.gross, 0);
    // And there is no hourly rate on this basis to be raised or lowered.
    expect(withHoliday.hourlyRate).toBeNull();
    expect(withHoliday.dailyRate).toBeCloseTo(MONTHLY_SALARY / DAYS_IN_MONTH, 2);
  });

  it("paid leave is paid a normal day and requires nothing", () => {
    const l = ledgerFor(gradeMonth({ leave: { "2026-08-11": "paid" } }));
    const pl = dayAt(l, "2026-08-11");
    expect(pl.status).toBe("paid_leave");
    expect(pl.requiredMinutes).toBeNull();
    expect(pl.adjustment).toBe(0);
    expect(pl.earned).toBeCloseTo(MONTHLY_SALARY / DAYS_IN_MONTH, 2);
  });

  it("paid leave never reduces a full month's pay", () => {
    const clean = ledgerFor(gradeMonth());
    const withLeave = ledgerFor(gradeMonth({ leave: { "2026-08-11": "paid" } }));
    expect(withLeave.reconciliation!.gross).toBeCloseTo(clean.reconciliation!.gross, 0);
  });

  it("unpaid leave requires nothing, is not absent, and shows its deduction", () => {
    const l = ledgerFor(gradeMonth({ leave: { "2026-08-11": "unpaid" } }));
    const lwp = dayAt(l, "2026-08-11");
    expect(lwp.status).toBe("unpaid_leave");
    expect(lwp.status).not.toBe("absent");
    expect(lwp.requiredMinutes).toBeNull();
    expect(lwp.earned).toBe(0);
    // The ₹0 earning IS the money. The ADJ. figure beside it is the comparison
    // with a normal day, and it is never added on top — that would charge the
    // day twice (spec §5).
    expect(lwp.adjustment).toBeCloseTo(-MONTHLY_SALARY / DAYS_IN_MONTH, 2);
    expect(l.reconciliation!.attributedAdjustment).toBe(0);
    expect(lwp.notes.join(" ")).toContain("not marked absent");
  });

  it("a weekly off requires nothing and cannot create a deficit", () => {
    const l = ledgerFor(gradeMonth());
    const sunday = dayAt(l, "2026-08-02");
    expect(sunday.status).toBe("weekly_off");
    expect(sunday.requiredMinutes).toBeNull();
    expect(sunday.balanceMinutes).toBeNull();
  });

  it("shows the remote-work type without changing a single figure", () => {
    const remote = {
      "2026-08-10": "wfh",
      "2026-08-11": "field",
      "2026-08-12": "client_site",
    };
    const plain = ledgerFor(gradeMonth());
    const away = ledgerFor(gradeMonth({ remote }));

    expect(dayAt(away, "2026-08-10").place).toBe("wfh");
    expect(dayAt(away, "2026-08-11").place).toBe("field");
    expect(dayAt(away, "2026-08-12").place).toBe("client_site");
    expect(dayAt(away, "2026-08-13").place).toBe("office");

    // An approved remote day is an ordinary working day worked elsewhere: same
    // status, same hours, same pay. "Do not count remote-work approval itself
    // as hours worked."
    for (const date of Object.keys(remote)) {
      expect(dayAt(away, date).status).toBe(dayAt(plain, date).status);
      expect(dayAt(away, date).workedMinutes).toBe(dayAt(plain, date).workedMinutes);
      expect(dayAt(away, date).earned).toBe(dayAt(plain, date).earned);
    }
    expect(away.reconciliation!.gross).toBe(plain.reconciliation!.gross);
  });

  it("a missing check-out is half a day, not a zero, and says so", () => {
    const l = ledgerFor(
      gradeMonth({ punches: { "2026-08-10": { inAt: "10:00", outAt: null } } }),
    );
    const d = dayAt(l, "2026-08-10");
    expect(d.code).toBe("H/D");
    expect(d.missingCheckOut).toBe(true);
    expect(d.notes.join(" ")).toContain("No check-out recorded");
    expectReconciles(l);
  });

  it("a missing check-in is half a day, not an absence, and says so", () => {
    const l = ledgerFor(
      gradeMonth({ punches: { "2026-08-10": { inAt: null, outAt: "19:00" } } }),
    );
    const d = dayAt(l, "2026-08-10");
    expect(d.code).toBe("H/D");
    expect(d.status).not.toBe("absent");
    expect(d.missingCheckIn).toBe(true);
    expect(d.notes.join(" ")).toContain("No check-in recorded");
    expectReconciles(l);
  });

  it("an absence is an absence: nothing worked, the full day owed", () => {
    const l = ledgerFor(
      gradeMonth({ workedMinutes: (ymd) => (ymd === "2026-08-13" ? 0 : 9 * 60) }),
    );
    const a = dayAt(l, "2026-08-13");
    expect(a.status).toBe("absent");
    expect(a.workedMinutes).toBe(0);
    expect(a.requiredMinutes).toBe(FT.dailyTargetMinutes);
    expect(a.balanceMinutes).toBe(-FT.dailyTargetMinutes);
    expect(a.earned).toBe(0);
  });

  it("labels a clearly long day OVERTIME without moving any money", () => {
    const l = ledgerFor(
      gradeMonth({ workedMinutes: (ymd) => (ymd === "2026-08-10" ? 9 * 60 + 45 : 9 * 60) }),
    );
    const ot = dayAt(l, "2026-08-10");
    expect(ot.status).toBe("overtime");
    expect(ot.code).toBe("P"); // the same graded code as a Full Day
    expect(ot.balanceMinutes).toBe(45);
    // The surplus is real and shown; whether it is PAID is the engine's call.
    expect(dayAt(l, "2026-08-11").status).toBe("full_day");
  });

  it("does not shout OVERTIME over a handful of minutes", () => {
    const l = ledgerFor(
      gradeMonth({ workedMinutes: (ymd) => (ymd === "2026-08-10" ? 9 * 60 + 5 : 9 * 60) }),
    );
    expect(dayAt(l, "2026-08-10").status).toBe("full_day");
    // …but the balance still tells the truth.
    expect(dayAt(l, "2026-08-10").balanceMinutes).toBe(5);
  });

  it("shows a future working day as Upcoming, never as Absent", () => {
    const l = ledgerFor(gradeMonth({ refTodayISO: "2026-08-12" }), {
      refTodayISO: "2026-08-12",
    });
    const future = dayAt(l, "2026-08-25");
    // The grader really did call it "A" — this is the trap being avoided.
    expect(future.code).toBe("A");
    expect(future.status).toBe("upcoming");
    expect(future.future).toBe(true);
    expect(future.balanceMinutes).toBeNull();
    // BLANK, not ₹0. "Not earned yet" and "earned nothing" are different
    // sentences, and printing the second on a day that has not happened would
    // tell someone on the 12th that they had already lost the 25th.
    expect(future.earned).toBeNull();
    expect(future.notes.join(" ")).toContain("has not happened yet");
  });

  it("keeps a future HOLIDAY labelled a holiday, not Upcoming", () => {
    // A declared holiday next Tuesday is a known fact on the calendar, and the
    // most useful thing the rest of the month has to say.
    const l = ledgerFor(
      gradeMonth({ refTodayISO: "2026-08-12", holidays: ["2026-08-25"] }),
      { refTodayISO: "2026-08-12" },
    );
    const h = dayAt(l, "2026-08-25");
    expect(h.future).toBe(true);
    expect(h.status).toBe("holiday");
    expect(h.requiredMinutes).toBeNull();
    expect(dayAt(l, "2026-08-30").status).toBe("weekly_off"); // a future Sunday
  });

  it("drops the days before the employee joined entirely", () => {
    const days = gradeMonth().map((d, i) => (i < 5 ? { ...d, code: "–", dayValue: 0, workedMinutes: 0 } : d));
    const l = ledgerFor(days);
    expect(l.days.some((d) => d.date <= "2026-08-05")).toBe(false);
    expect(l.days[0]!.date).toBe("2026-08-06");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   4. WEEKS (spec §2, §11)
   ══════════════════════════════════════════════════════════════════════════ */

describe("weeks", () => {
  it("opens August 2026 with the two-day partial week the spec shows", () => {
    const l = ledgerFor(gradeMonth());
    expect(l.weeks[0]!.index).toBe(1);
    expect(l.weeks[0]!.rangeLabel).toBe("01 Aug – 02 Aug");
    expect(l.weeks[0]!.days.map((d) => d.date)).toEqual(["2026-08-01", "2026-08-02"]);
    // …then full Monday-anchored weeks.
    expect(l.weeks[1]!.rangeLabel).toBe("03 Aug – 09 Aug");
    expect(l.weeks[1]!.days).toHaveLength(7);
  });

  it("numbers the weeks 1..N in calendar order and covers every day exactly once", () => {
    const l = ledgerFor(gradeMonth());
    expect(l.weeks.map((w) => w.index)).toEqual(l.weeks.map((_, i) => i + 1));
    const seen = l.weeks.flatMap((w) => w.days.map((d) => d.date));
    expect(seen).toEqual(l.days.map((d) => d.date));
    expect(new Set(seen).size).toBe(seen.length);
  });

  it("uses the SAME week buckets as the hour engine's reconciliation", () => {
    const days = gradeMonth();
    const { recon } = payrollMonthFor(days, { month: MONTH, cfg: FT, refTodayISO: EOM });
    const l = ledgerFor(days);
    // Every ledger week that owed hours has an engine week behind it, and their
    // targets and actuals agree — which is what lets the week header quote the
    // engine and the rows sum to it.
    for (const w of l.weeks) {
      if (w.totals.requiredMinutes === 0) continue;
      expect(w.engine).not.toBeNull();
      expect(w.totals.requiredMinutes).toBe(w.engine!.targetMinutes);
      expect(w.totals.workedMinutes).toBe(
        recon.weeks.find((e) => e.weekKey === w.weekKey)!.actualMinutes,
      );
    }
  });

  it("a week total is the sum of the rows under it", () => {
    const l = ledgerFor(
      gradeMonth({
        workedMinutes: (ymd) => (Number(ymd.slice(8, 10)) % 3 === 0 ? 5 * 60 : 9 * 60),
      }),
    );
    for (const w of l.weeks) {
      const worked = w.days.reduce((s, d) => s + (d.requiredMinutes != null ? d.workedMinutes : 0), 0);
      const earned = w.days.reduce((s, d) => s + (d.earned ?? 0), 0);
      expect(w.totals.workedMinutes).toBe(worked);
      expect(w.totals.earned!).toBeCloseTo(earned, 2);
      expect(w.totals.balanceMinutes).toBe(w.totals.workedMinutes - w.totals.requiredMinutes);
    }
  });

  it("the month total is the sum of the weeks", () => {
    const l = ledgerFor(gradeMonth({ holidays: ["2026-08-15"], leave: { "2026-08-11": "paid" } }));
    const sum = (pick: (t: (typeof l.weeks)[number]["totals"]) => number) =>
      l.weeks.reduce((s, w) => s + pick(w.totals), 0);
    expect(l.totals.workedMinutes).toBe(sum((t) => t.workedMinutes));
    expect(l.totals.requiredMinutes).toBe(sum((t) => t.requiredMinutes));
    expect(l.totals.earned!).toBeCloseTo(sum((t) => t.earned ?? 0), 1);
  });

  it("counts a worked day off separately from hours toward the target", () => {
    const l = ledgerFor(
      gradeMonth({
        holidays: ["2026-08-15"],
        punches: { "2026-08-15": { inAt: "10:00", outAt: "18:00" } },
      }),
    );
    expect(l.totals.offDayWorkedMinutes).toBe(8 * 60);
    // …and it stays OUT of the figure the balance is measured against, so the
    // balance column still adds up.
    expect(l.totals.balanceMinutes).toBe(l.totals.workedMinutes - l.totals.requiredMinutes);
  });

  it("does not count a future day's requirement as already owed", () => {
    const mid = ledgerFor(gradeMonth({ refTodayISO: "2026-08-12" }), {
      refTodayISO: "2026-08-12",
    });
    const full = ledgerFor(gradeMonth());
    expect(mid.totals.requiredMinutes).toBeLessThan(full.totals.requiredMinutes);
    // Which is what keeps a month in progress from reading as a huge deficit.
    expect(mid.totals.balanceMinutes).toBe(0);
  });

  it("carries the engine's signed week-to-week balance for the detail view", () => {
    // A short week followed by a long one: the surplus lowers the later target.
    const l = ledgerFor(
      gradeMonth({
        workedMinutes: (ymd) => (ymd >= "2026-08-03" && ymd <= "2026-08-08" ? 7 * 60 : 11 * 60),
      }),
    );
    // The month's FIRST week is the two-day 01–02 Aug portion, so that is the
    // one that starts at zero — a balance never crosses a month boundary.
    expect(l.weeks[0]!.engine!.carryInMinutes).toBe(0);
    const w2 = l.weeks.find((w) => w.rangeLabel === "03 Aug – 09 Aug")!;
    const w3 = l.weeks.find((w) => w.rangeLabel === "10 Aug – 16 Aug")!;
    // 01 Aug is a Saturday worked 11h against a 9h prorated target, so week 2
    // opens with that 2h surplus banked.
    expect(w2.engine!.carryInMinutes).toBe(2 * 60);
    // Week 2 then ran 7h days and handed a deficit forward, which RAISES what
    // week 3 had to produce.
    expect(w3.engine!.carryInMinutes).toBeLessThan(0);
    expect(w3.engine!.effectiveTargetMinutes).toBeGreaterThan(w3.engine!.targetMinutes);
    // …and the carry really is the previous week's closing balance.
    const closing =
      w2.engine!.carryInMinutes + (w2.totals.workedMinutes - w2.engine!.targetMinutes);
    expect(w3.engine!.carryInMinutes).toBe(closing);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   5. FILTERS AND SORTING (spec §12, §13)
   ══════════════════════════════════════════════════════════════════════════ */

describe("filters", () => {
  const build = () =>
    ledgerFor(
      gradeMonth({
        holidays: ["2026-08-15"],
        leave: { "2026-08-11": "paid", "2026-08-12": "unpaid" },
        remote: { "2026-08-10": "wfh", "2026-08-13": "field" },
        workedMinutes: (ymd) => (ymd === "2026-08-18" ? 5 * 60 : 9 * 60),
      }),
    );

  it("reports whether anything is actually filtered", () => {
    expect(isFiltered(LEDGER_FILTER_NONE)).toBe(false);
    expect(isFiltered({ ...LEDGER_FILTER_NONE, status: "half_day" })).toBe(true);
    expect(isFiltered({ ...LEDGER_FILTER_NONE, week: 3 })).toBe(true);
    expect(isFiltered({ ...LEDGER_FILTER_NONE, place: "wfh" })).toBe(true);
  });

  it("shows everything when nothing is set", () => {
    const l = build();
    const weeks = applyLedgerView(l, LEDGER_FILTER_NONE, "date_asc");
    expect(weeks).toHaveLength(l.weeks.length);
    expect(weeks.flatMap((w) => w.days)).toHaveLength(l.days.length);
    expect(weeks.every((w) => w.hiddenDays === 0)).toBe(true);
  });

  it("filters by status", () => {
    const l = build();
    const weeks = applyLedgerView(l, { ...LEDGER_FILTER_NONE, status: "half_day" }, "date_asc");
    const days = weeks.flatMap((w) => w.days);
    expect(days.map((d) => d.date)).toEqual(["2026-08-18"]);
  });

  it("filters by work type", () => {
    const l = build();
    const wfh = applyLedgerView(l, { ...LEDGER_FILTER_NONE, place: "wfh" }, "date_asc");
    expect(wfh.flatMap((w) => w.days).map((d) => d.date)).toEqual(["2026-08-10"]);
    const field = applyLedgerView(l, { ...LEDGER_FILTER_NONE, place: "field" }, "date_asc");
    expect(field.flatMap((w) => w.days).map((d) => d.date)).toEqual(["2026-08-13"]);
  });

  it("filters by week, keeping that week's own number", () => {
    const l = build();
    const weeks = applyLedgerView(l, { ...LEDGER_FILTER_NONE, week: 3 }, "date_asc");
    expect(weeks).toHaveLength(1);
    expect(weeks[0]!.index).toBe(3);
    expect(weeks[0]!.rangeLabel).toBe(l.weeks[2]!.rangeLabel);
  });

  it("combines filters — the spec's own example, Half Day AND a week", () => {
    const l = build();
    const halfDayWeek = l.weeks.find((w) => w.days.some((d) => d.date === "2026-08-18"))!.index;

    const hit = applyLedgerView(
      l,
      { ...LEDGER_FILTER_NONE, status: "half_day", week: halfDayWeek },
      "date_asc",
    );
    expect(hit.flatMap((w) => w.days).map((d) => d.date)).toEqual(["2026-08-18"]);

    // The same status in a week that has none must come back EMPTY, not
    // fall back to showing the week.
    const miss = applyLedgerView(
      l,
      { ...LEDGER_FILTER_NONE, status: "half_day", week: 1 },
      "date_asc",
    );
    expect(miss).toHaveLength(0);
  });

  it("drops weeks the filter empties rather than rendering hollow accordions", () => {
    const l = build();
    const weeks = applyLedgerView(l, { ...LEDGER_FILTER_NONE, status: "unpaid_leave" }, "date_asc");
    expect(weeks).toHaveLength(1);
    expect(weeks[0]!.days.map((d) => d.date)).toEqual(["2026-08-12"]);
    // …and the week it kept reports how much it is hiding.
    expect(weeks[0]!.hiddenDays).toBe(l.weeks[weeks[0]!.index - 1]!.days.length - 1);
  });

  it("recomputes week totals over the FILTERED rows", () => {
    const l = build();
    const weeks = applyLedgerView(l, { ...LEDGER_FILTER_NONE, status: "full_day" }, "date_asc");
    for (const w of weeks) {
      expect(w.days.every((d) => d.status === "full_day")).toBe(true);
      expect(w.totals.workedMinutes).toBe(w.days.reduce((s, d) => s + d.workedMinutes, 0));
      // A header describing days that are not under it is the bug this prevents.
      expect(w.totals.counts.half_day).toBeUndefined();
    }
  });

  it("totals a filtered view across its weeks", () => {
    const l = build();
    const weeks = applyLedgerView(l, { ...LEDGER_FILTER_NONE, status: "full_day" }, "date_asc");
    const t = viewTotals(weeks, true);
    expect(t.workedMinutes).toBe(
      weeks.flatMap((w) => w.days).reduce((s, d) => s + d.workedMinutes, 0),
    );
  });

  it("filters days by week index through the shared predicate", () => {
    const l = build();
    const kept = filterLedgerDays(l.days, { ...LEDGER_FILTER_NONE, week: 2 }, (date) =>
      l.weeks.find((w) => w.days.some((d) => d.date === date))!.index,
    );
    expect(kept).toEqual(l.weeks[1]!.days);
  });
});

describe("sorting", () => {
  const days = (): LedgerDay[] =>
    ledgerFor(
      gradeMonth({
        workedMinutes: (ymd) => {
          const d = Number(ymd.slice(8, 10));
          return d === 10 ? 11 * 60 : d === 11 ? 5 * 60 : 9 * 60;
        },
      }),
    ).days;

  it("orders by date, both ways", () => {
    const asc = sortLedgerDays(days(), "date_asc").map((d) => d.date);
    const desc = sortLedgerDays(days(), "date_desc").map((d) => d.date);
    expect(asc).toEqual([...asc].sort());
    expect(desc).toEqual([...asc].reverse());
  });

  it("orders by hours, both ways", () => {
    const hi = sortLedgerDays(days(), "hours_desc");
    expect(hi[0]!.date).toBe("2026-08-10"); // the 11h day
    const lo = sortLedgerDays(days(), "hours_asc");
    expect(lo[0]!.workedMinutes).toBe(0); // a Sunday
    expect(hi.map((d) => d.workedMinutes)).toEqual(
      [...hi.map((d) => d.workedMinutes)].sort((a, b) => b - a),
    );
  });

  it("orders by earning, both ways", () => {
    const rows = days();
    const hi = sortLedgerDays(rows, "earned_desc");
    const lo = sortLedgerDays(rows, "earned_asc");
    // Highest first, lowest first — asserted as an ORDERING rather than by
    // naming a date, because which date earns most is a property of the pay
    // model and this test is about the sort.
    const earned = (d: LedgerDay) => d.earned ?? -1;
    expect(earned(hi[0]!)).toBe(Math.max(...rows.map(earned)));
    expect(earned(lo[0]!)).toBe(Math.min(...rows.map(earned)));
    expect(earned(hi[0]!)).toBeGreaterThan(earned(lo[0]!));
  });

  it("is a TOTAL order — equal rows fall back to the date, never reshuffle", () => {
    const src = days();
    const a = sortLedgerDays(src, "hours_desc").map((d) => d.date);
    const b = sortLedgerDays([...src].reverse(), "hours_desc").map((d) => d.date);
    expect(a).toEqual(b);
  });

  it("never mutates its input", () => {
    const src = days();
    const before = src.map((d) => d.date);
    sortLedgerDays(src, "date_desc");
    expect(src.map((d) => d.date)).toEqual(before);
  });

  it("sorts a month with no money view without treating null as zero", () => {
    const l = attendanceOnlyLedger();
    const sorted = sortLedgerDays(l.days, "earned_desc");
    expect(sorted).toHaveLength(l.days.length);
    expect(sorted.every((d) => d.earned === null)).toBe(true);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   6. THE MONTH WITH NO MONEY VIEW
   ══════════════════════════════════════════════════════════════════════════ */

function attendanceOnlyLedger(): DayLedger {
  const days = gradeMonth();
  const { recon, hours } = payrollMonthFor(days, { month: MONTH, cfg: FT, refTodayISO: EOM });
  return buildDayLedger({
    month: MONTH,
    monthLabel: MONTH_LABEL,
    days,
    cfg: { dailyTargetMinutes: FT.dailyTargetMinutes, weeklyTargetMinutes: FT.weeklyTargetMinutes },
    recon,
    hours,
    pay: { mode: "attendance_only", note: "Your pay is a fixed monthly retainer." },
    refTodayISO: EOM,
  });
}

describe("a month whose pay does not decompose into days", () => {
  it("shows the attendance in full and the money as unknown — never as zero", () => {
    const l = attendanceOnlyLedger();
    expect(l.mode).toBe("attendance_only");
    expect(l.hourlyRate).toBeNull();
    expect(l.reconciliation).toBeNull();
    expect(l.moneyNote).toContain("retainer");
    // Attendance is real…
    expect(l.days.length).toBeGreaterThan(27);
    expect(l.totals.workedMinutes).toBeGreaterThan(0);
    expect(l.totals.requiredMinutes).toBeGreaterThan(0);
    // …and the money is explicitly absent, on every row and in every total.
    expect(l.days.every((d) => d.earned === null && d.adjustment === null)).toBe(true);
    expect(l.totals.earned).toBeNull();
    expect(l.totals.adjustment).toBeNull();
    expect(l.weeks.every((w) => w.totals.earned === null)).toBe(true);
  });

  it("still groups, filters and sorts", () => {
    const l = attendanceOnlyLedger();
    expect(l.weeks.length).toBeGreaterThan(3);
    const weeks = applyLedgerView(l, { ...LEDGER_FILTER_NONE, status: "weekly_off" }, "date_asc");
    expect(weeks.flatMap((w) => w.days).every((d) => d.status === "weekly_off")).toBe(true);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   7. FORMATTERS — shared by the server and the browser
   ══════════════════════════════════════════════════════════════════════════ */

describe("formatting", () => {
  it("writes hours the way a clock reads, never as a decimal", () => {
    expect(hm(8 * 60 + 42)).toBe("8h 42m");
    expect(hm(9 * 60)).toBe("9h");
    expect(hm(45)).toBe("45m");
    expect(hm(0)).toBe("0h");
    expect(hm(-(3 * 60 + 28))).toBe("-3h 28m");
  });

  it("always signs a balance, including zero (spec §6)", () => {
    expect(signedHm(45)).toBe("+45m");
    expect(signedHm(-18)).toBe("-18m");
    expect(signedHm(0)).toBe("+0h");
    expect(signedHm(-(3 * 60 + 28))).toBe("-3h 28m");
  });

  it("formats rupees in Indian grouping", () => {
    expect(inr(1234567)).toBe("₹12,34,567");
    expect(inr(1500.5)).toBe("₹1,500.50");
    expect(inr(0)).toBe("₹0");
  });

  it("shows an adjustment of nothing as a dash, not as ₹0", () => {
    expect(signedInr(0)).toBe("—");
    expect(signedInr(null)).toBe("—");
    expect(signedInr(-450)).toBe("−₹450");
    expect(signedInr(120)).toBe("+₹120");
  });

  it("keeps dates compact and 24-hour, as the spec asks", () => {
    expect(shortDate("2026-08-10")).toBe("10 Aug");
    expect(shortDate("2026-12-01")).toBe("01 Dec");
    expect(shortDow(1)).toBe("Mon");
    expect(shortDow(0)).toBe("Sun");
    // The grader stores "HH:mm" in 24h already, so the report never converts.
    const l = ledgerFor(gradeMonth({ punches: { "2026-08-10": { inAt: "10:21", outAt: "19:03" } } }));
    expect(dayAt(l, "2026-08-10").inAt).toBe("10:21");
    expect(dayAt(l, "2026-08-10").outAt).toBe("19:03");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   8. THE SELF-CHECK — a ledger that cannot add up refuses to show money
   ══════════════════════════════════════════════════════════════════════════ */

describe("ledgerReconciles", () => {
  /** Build a ledger against a DELIBERATELY wrong gross, as a stale run would. */
  function withGross(gross: number): DayLedger {
    const days = gradeMonth();
    const { recon, hours } = payrollMonthFor(days, {
      month: MONTH,
      cfg: FT,
      refTodayISO: EOM,
    });
    return buildDayLedger({
      month: MONTH,
      monthLabel: MONTH_LABEL,
      days,
      cfg: {
        dailyTargetMinutes: FT.dailyTargetMinutes,
        weeklyTargetMinutes: FT.weeklyTargetMinutes,
      },
      recon,
      hours,
      pay: {
        mode: "daily",
        dailyRate: MONTHLY_SALARY / DAYS_IN_MONTH,
        gross,
      },
      refTodayISO: EOM,
    });
  }

  it("accepts a month whose rows really do add up", () => {
    const l = ledgerFor(gradeMonth());
    expect(ledgerReconciles(l)).toBe(true);
    expect(Math.abs(l.reconciliation!.residual)).toBeLessThanOrEqual(
      LEDGER_RECONCILE_TOLERANCE,
    );
  });

  it("leaves comfortable headroom over honest rounding drift", () => {
    // Measured against every real employee-month of Aug + Sep 2026, the worst
    // honest residual was ₹0.73. If this tolerance ever needs raising, the
    // attribution has changed and that is worth noticing.
    expect(LEDGER_RECONCILE_TOLERANCE).toBeGreaterThanOrEqual(1);
    expect(LEDGER_RECONCILE_TOLERANCE).toBeLessThan(10);
  });

  it("REJECTS a month whose stored gross was computed from other attendance", () => {
    // A frozen run against a month that has since gained a backfilled punch:
    // the hours say one thing, the payslip another, and no per-day split can
    // honestly bridge them.
    const l = withGross(31_000);
    expect(Math.abs(l.reconciliation!.residual)).toBeGreaterThan(
      LEDGER_RECONCILE_TOLERANCE,
    );
    expect(ledgerReconciles(l)).toBe(false);
  });

  it("rejects a run that was never generated properly (gross ₹0)", () => {
    // Real case: several stored August 2026 runs carry a gross of ₹0 against a
    // month with hundreds of worked hours.
    expect(ledgerReconciles(withGross(0))).toBe(false);
  });

  it("accepts a ledger with no money view at all", () => {
    // Nothing to disagree with, and the attendance in it is just as real.
    expect(ledgerReconciles(attendanceOnlyLedger())).toBe(true);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   9. THE `ADJ.` COLUMN — what a day cost, or what it added
   ══════════════════════════════════════════════════════════════════════════

   The column was blank on every row of every report, because it only ever
   carried the retired `hours_schedule` engine's two charges and nothing
   produces that mode any more. It now answers the question an employee
   actually asks of it: how did this day compare with a normal one?

   The baseline differs by pay model, and it has to — see THE `ADJ.` COLUMN in
   day-ledger.ts. What must hold on BOTH is that the figure is descriptive:
   `earned` already nets it, so it may never be added to the gross. Every test
   below asserts that alongside the number itself. */

describe("the ADJ. column compares a day with a normal one", () => {
  const DAILY_RATE = MONTHLY_SALARY / DAYS_IN_MONTH;

  it("shows a full daily rate lost on unpaid leave, and nothing on paid leave", () => {
    const l = ledgerFor(
      gradeMonth({ leave: { "2026-08-11": "unpaid", "2026-08-12": "paid" } }),
    );
    expectReconciles(l);

    const lwp = dayAt(l, "2026-08-11");
    expect(lwp.status).toBe("unpaid_leave");
    expect(lwp.adjustment).toBeCloseTo(-DAILY_RATE, 2);

    // Paid leave is a PAID day under the daily model — it earns the full rate,
    // so it reads flat. A negative here would tell someone their approved leave
    // had cost them money.
    const pl = dayAt(l, "2026-08-12");
    expect(pl.status).toBe("paid_leave");
    expect(pl.earned).toBeCloseTo(DAILY_RATE, 2);
    expect(pl.adjustment).toBeCloseTo(0, 2);
  });

  it("shows an absence at a full daily rate and a holiday at nothing", () => {
    const l = ledgerFor(
      gradeMonth({
        holidays: ["2026-08-13"],
        workedMinutes: (ymd) => (ymd === "2026-08-11" ? 0 : FT.dailyTargetMinutes),
      }),
    );
    expect(dayAt(l, "2026-08-11").status).toBe("absent");
    expect(dayAt(l, "2026-08-11").adjustment).toBeCloseTo(-DAILY_RATE, 2);
    // A declared holiday pays the full daily rate, so it is not a loss — and a
    // weekly off is the same. Neither may show as one.
    expect(dayAt(l, "2026-08-13").adjustment).toBeCloseTo(0, 2);
    expect(dayAt(l, "2026-08-02").status).toBe("weekly_off");
    expect(dayAt(l, "2026-08-02").adjustment).toBeCloseTo(0, 2);
  });

  it("NEVER turns a full-timer's extra hours into a positive adjustment", () => {
    // 11h every day against a 9h schedule. The surplus reconciles next week's
    // target and is never money (spec §15), so the column must stay flat —
    // printing +₹ here would promise pay the payslip will not contain.
    const l = ledgerFor(gradeMonth({ workedMinutes: () => 11 * 60 }));
    expectReconciles(l);
    const d = dayAt(l, "2026-08-10");
    expect(d.status).toBe("overtime");
    expect(d.balanceMinutes).toBe(2 * 60); // the hours ARE shown, in the hours column
    expect(d.adjustment).toBeCloseTo(0, 2);
    expect(l.days.every((x) => (x.adjustment ?? 0) === 0)).toBe(true);
    expect(l.reconciliation!.gross).toBeCloseTo(MONTHLY_SALARY, 0);
  });

  it("DOES pay an hourly shift's overtime, and says so in the column", () => {
    // The other half of the same rule. `computeHourlySalary` buys every worked
    // hour at one rate for an hourly shift (`surplusPaid`), so here the extra
    // hours are real rupees and the column is where they show up. Intern OT is
    // untouched by the full-timer's model — spec §7.
    const l = shiftLedgerFor(
      gradeMonth({
        shift: true,
        workedMinutes: (ymd) => (ymd === "2026-08-10" ? 7 * 60 : 5 * 60),
      }),
    );
    expectReconciles(l);
    const rate = l.hourlyRate!;
    const scheduled = (rate * PT.dailyTargetMinutes) / 60;

    const ot = dayAt(l, "2026-08-10");
    expect(ot.workedMinutes).toBe(7 * 60);
    expect(ot.standardEarning).toBeCloseTo(scheduled, 2);
    expect(ot.earned).toBeCloseTo(rate * 7, 2);
    expect(ot.adjustment).toBeCloseTo(rate * 2, 2); // two hours over, paid
    expect(ot.adjustmentReason).toContain("hourly rate");

    // An ordinary 5h day reads flat, which is what makes the +₹ above legible.
    expect(dayAt(l, "2026-08-11").adjustment).toBeCloseTo(0, 2);
    // And none of it reaches the gross as a separate line.
    expect(l.reconciliation!.attributedAdjustment).toBe(0);
  });

  it("counts a day off somebody worked as entirely extra", () => {
    // Sunday 9 August is the weekly off. Nothing was owed, so the baseline is
    // ₹0 and every hour worked is on top of the schedule.
    const l = shiftLedgerFor(
      gradeMonth({
        shift: true,
        punches: { "2026-08-09": { inAt: "15:00", outAt: "18:00" } },
      }),
    );
    expectReconciles(l);
    const sunday = dayAt(l, "2026-08-09");
    expect(sunday.workedMinutes).toBe(3 * 60);
    expect(sunday.standardEarning).toBe(0);
    expect(sunday.adjustment).toBeCloseTo(l.hourlyRate! * 3, 2);
    expect(sunday.adjustment!).toBeGreaterThan(0);
  });

  it("charges an hourly worker's leave against a scheduled day", () => {
    // The DISCREPANCY on `hours_worked`, made visible instead of silent: this
    // basis pays for hours WORKED, so an approved leave day earns nothing while
    // the month's target still counts it. The employee can now see the cost.
    const l = shiftLedgerFor(
      gradeMonth({ shift: true, leave: { "2026-08-11": "paid" } }),
    );
    const pl = dayAt(l, "2026-08-11");
    expect(pl.status).toBe("paid_leave");
    expect(pl.earned).toBe(0);
    expect(pl.adjustment).toBeCloseTo(-(l.hourlyRate! * PT.dailyTargetMinutes) / 60, 2);
    expect(pl.adjustmentReason).toContain("hours actually worked");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   10. EVERY WEEK CARRIES ITS OWN EARNINGS
   ══════════════════════════════════════════════════════════════════════════ */

describe("weekly earnings", () => {
  it("gives every week an earned total, and they sum to the month", () => {
    const l = ledgerFor(gradeMonth());
    expect(l.weeks.length).toBeGreaterThan(1);
    for (const w of l.weeks) {
      expect(w.totals.earned).not.toBeNull();
      expect(w.totals.earned!).toBeGreaterThan(0);
    }
    const sum = l.weeks.reduce((s, w) => s + (w.totals.earned ?? 0), 0);
    expect(sum).toBeCloseTo(l.totals.earned ?? 0, 1);
    // And the month's own total IS the payslip's gross, to within the paise
    // that rounding each visible row to two decimals costs.
    expect(Math.abs(l.totals.earned! - l.reconciliation!.gross)).toBeLessThan(
      LEDGER_RECONCILE_TOLERANCE,
    );
  });

  it("keeps the money on a FILTERED week's totals", () => {
    // `applyLedgerView` tested `hourlyRate != null`, which is null under the
    // daily model — so filtering to "half day" blanked every week header while
    // the rows underneath it carried rupees.
    const halves = new Set(["2026-08-04", "2026-08-05"]);
    const l = ledgerFor(
      gradeMonth({
        workedMinutes: (ymd) => (halves.has(ymd) ? 5 * 60 : FT.dailyTargetMinutes),
      }),
    );
    const views = applyLedgerView(
      l,
      { ...LEDGER_FILTER_NONE, status: "half_day" },
      "date_asc",
    );
    expect(views.length).toBeGreaterThan(0);
    for (const w of views) expect(w.totals.earned).not.toBeNull();
    const t = viewTotals(views, l.hasMoney);
    expect(t.earned!).toBeCloseTo((MONTHLY_SALARY / DAYS_IN_MONTH / 2) * halves.size, 1);
    expect(t.adjustment!).toBeCloseTo(-(MONTHLY_SALARY / DAYS_IN_MONTH / 2) * halves.size, 1);
  });
});

describe("a day the month has not reached carries no money at all", () => {
  it("blanks both columns on an OPEN month's upcoming days, on either basis", () => {
    // Caught live rather than in a fixture: an hourly shift's upcoming days were
    // rendering "−₹136.10 · ₹0" — a full day's shortfall charged against a
    // Friday that had not happened, and a confident ₹0 beside it.
    const REF = "2026-08-12";
    for (const l of [
      ledgerFor(gradeMonth({ refTodayISO: REF }), { refTodayISO: REF }),
      shiftLedgerFor(gradeMonth({ shift: true, refTodayISO: REF }), { refTodayISO: REF }),
    ]) {
      expectReconciles(l);
      const upcoming = l.days.filter((d) => d.future && d.status === "upcoming");
      expect(upcoming.length).toBeGreaterThan(5);
      for (const d of upcoming) {
        expect(d.earned).toBeNull();
        expect(d.adjustment).toBeNull();
        expect(d.standardEarning).toBeNull();
      }
      // Elapsed days are unaffected — the bound is on the future, not on money.
      expect(dayAt(l, "2026-08-10").earned).not.toBeNull();
    }
  });
});
