import { describe, it, expect } from "vitest";
import { computeDayCode } from "@/lib/attendance/status";
import {
  resolveEffectiveConfig,
  toAttendanceSchedule,
} from "@/lib/attendance/effective-config";
import { payrollMonthFor } from "@/lib/attendance/payroll-month";
import {
  computeDailySalary,
  computeHourlySalary,
  payableDayValue,
} from "@/lib/salary/compute";
import {
  reconcileMonth,
  weeklyWorkedMinutes,
  type GradedDayInput,
} from "@/lib/attendance/hour-balance";
import { weekKeyOf } from "@/lib/attendance/hours-rule";
import { daysInMonth, monthsSpanned } from "@/lib/salary/period";
import { earnsOvertime, payBasisFor } from "@/lib/attendance/worker-type";

/**
 * THE DAILY SALARY MODEL — the pay rules as specified, asserted end to end.
 *
 * Every money test here drives the REAL chain:
 *
 *     computeDayCode        (the grader, day by day)
 *       → payrollMonthFor   (reconciliation + payable day-values + hours)
 *         → computeDailySalary / computeHourlySalary   (the payroll engine)
 *
 * Nothing is stubbed. The point of the file is that the rules an employee is
 * told ("a half day earns half", "a holiday is paid", "August surplus does not
 * follow you into September") are checked against the code that pays them,
 * rather than against a summary of it.
 */

/* ────────────────────────────────────────────────────────────────────────────
   Fixtures
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

/** An intern-style hourly shift: 30h week, paid for hours actually worked. */
const SHIFT = {
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
const PT = resolveEffectiveConfig(SHIFT);
const PT_SCHED = toAttendanceSchedule(PT);

function daysOfMonth(month: string): string[] {
  const n = daysInMonth(month);
  return Array.from({ length: n }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}

function weekdayOf(ymd: string): number {
  return new Date(`${ymd}T00:00:00Z`).getUTCDay();
}

function clock(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

interface MonthSpec {
  month: string;
  holidays?: readonly string[];
  leave?: Readonly<Record<string, "paid" | "unpaid">>;
  /** Worked minutes for an ordinary day. Default: the employee's full day. */
  workedMinutes?: (ymd: string) => number;
  /** Days after this get no punches — the honest shape of a month in progress. */
  refTodayISO?: string;
  shift?: boolean;
}

interface GradedDay {
  logDate: string;
  code: string;
  dayValue: number;
  workedMinutes: number;
  late: boolean;
  leftEarly: boolean;
  isWeeklyOff: boolean;
}

/** Grade a whole month through the REAL day engine. */
function gradeMonth(spec: MonthSpec): GradedDay[] {
  const cfg = spec.shift ? PT : FT;
  const sched = spec.shift ? PT_SCHED : FT_SCHED;
  const holidays = new Set(spec.holidays ?? []);
  const leave = spec.leave ?? {};
  const startMin = 10 * 60;
  const worked = spec.workedMinutes ?? (() => cfg.dailyTargetMinutes);

  return daysOfMonth(spec.month).map((ymd) => {
    const wd = weekdayOf(ymd);
    const isWeeklyOff = wd === cfg.weeklyOff;
    const isHoliday = holidays.has(ymd);
    // A holiday wins over leave: you do not spend a leave day on a day off.
    const onLeave = isHoliday ? null : (leave[ymd] ?? null);
    const reached = spec.refTodayISO == null || ymd <= spec.refTodayISO;

    let punch: { inAt: string | null; outAt: string | null } = { inAt: null, outAt: null };
    if (reached && !isWeeklyOff && !isHoliday && !onLeave) {
      const mins = worked(ymd);
      if (mins > 0) punch = { inAt: clock(startMin), outAt: clock(startMin + mins) };
    }

    const g = computeDayCode(punch, sched, { isWeeklyOff, isHoliday, leave: onLeave }, "23:59");
    return {
      logDate: ymd,
      code: g.code,
      dayValue: g.dayValue,
      workedMinutes: g.workedMinutes,
      late: g.late,
      leftEarly: g.leftEarly,
      isWeeklyOff,
    };
  });
}

/** Full pay for a graded month, exactly as `computeForRow` runs it. */
function payFor(
  days: GradedDay[],
  o: { month: string; monthlySalary: number; refTodayISO: string },
) {
  const { payroll } = payrollMonthFor(days, {
    month: o.month,
    cfg: FT,
    refTodayISO: o.refTodayISO,
  });
  return computeDailySalary({
    monthlySalary: o.monthlySalary,
    daysInMonth: daysInMonth(o.month),
    payableDayValue: payroll.payableDayValue,
    ptExempt: true,
    tdsMonthly: 0,
    advances: 0,
    pendingBalanceIn: 0,
  });
}

/* ══════════════════════════════════════════════════════════════════════════
   TEST 1-3 — THE DIVISOR IS THE MONTH'S OWN LENGTH
   ══════════════════════════════════════════════════════════════════════════ */

describe("the daily rate divides by CALENDAR days in THAT month", () => {
  const cases = [
    { month: "2026-08", days: 31, salary: 31_000, label: "a 31-day month" },
    { month: "2026-09", days: 30, salary: 30_000, label: "a 30-day month" },
    { month: "2027-02", days: 28, salary: 28_000, label: "a common-year February" },
    { month: "2028-02", days: 29, salary: 29_000, label: "a LEAP February" },
  ];

  for (const c of cases) {
    it(`${c.label} divides by ${c.days}, giving ₹1,000/day`, () => {
      expect(daysInMonth(c.month)).toBe(c.days);
      const b = computeDailySalary({
        monthlySalary: c.salary,
        daysInMonth: daysInMonth(c.month),
        payableDayValue: c.days, // a perfect month
        ptExempt: true,
        tdsMonthly: 0,
        advances: 0,
        pendingBalanceIn: 0,
      });
      expect(b.perDay).toBe(1000);
      // A complete month pays exactly the monthly salary — no more, no less.
      expect(b.gross).toBeCloseTo(c.salary, 2);
    });
  }

  it("is never a hardcoded 30 or 31 — September and August differ", () => {
    const sept = computeDailySalary({
      monthlySalary: 30_000,
      daysInMonth: daysInMonth("2026-09"),
      payableDayValue: 1,
      ptExempt: true,
      tdsMonthly: 0,
      advances: 0,
      pendingBalanceIn: 0,
    });
    const aug = computeDailySalary({
      monthlySalary: 30_000,
      daysInMonth: daysInMonth("2026-08"),
      payableDayValue: 1,
      ptExempt: true,
      tdsMonthly: 0,
      advances: 0,
      pendingBalanceIn: 0,
    });
    expect(sept.perDay).toBe(1000);
    expect(aug.perDay).toBeCloseTo(967.74, 2);
    expect(sept.perDay).not.toBe(aug.perDay);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   TEST 1 (continued) — WHAT EACH KIND OF DAY EARNS
   ══════════════════════════════════════════════════════════════════════════ */

describe("₹31,000 over 31 days — every day type earns exactly what it should", () => {
  const MONTH = "2026-08";
  const SALARY = 31_000;
  const RATE = 1000;
  const EOM = "2026-08-31";

  /** One day of a given value, priced. */
  const earn = (dayValue: number) =>
    computeDailySalary({
      monthlySalary: SALARY,
      daysInMonth: daysInMonth(MONTH),
      payableDayValue: dayValue,
      ptExempt: true,
      tdsMonthly: 0,
      advances: 0,
      pendingBalanceIn: 0,
    }).gross;

  it("Present (P) earns one full daily salary", () => {
    expect(earn(1)).toBe(RATE);
  });

  it("Half Day (H/D) earns half", () => {
    expect(earn(0.5)).toBe(RATE / 2);
  });

  it("Absent (A) earns ₹0 — one full daily salary is lost", () => {
    expect(earn(0)).toBe(0);
    expect(RATE - earn(0)).toBe(RATE);
  });

  it("Holiday (H) earns the normal daily salary, with no work required", () => {
    const days = gradeMonth({ month: MONTH, holidays: ["2026-08-19"] });
    const holiday = days.find((d) => d.logDate === "2026-08-19")!;
    expect(holiday.code).toBe("H");
    expect(holiday.dayValue).toBe(1);
    expect(holiday.workedMinutes).toBe(0);
    expect(earn(holiday.dayValue)).toBe(RATE);
  });

  it("Weekly Off (W/O) earns the normal daily salary", () => {
    const days = gradeMonth({ month: MONTH });
    const sunday = days.find((d) => d.logDate === "2026-08-02")!;
    expect(sunday.code).toBe("W/O");
    expect(sunday.dayValue).toBe(1);
    expect(earn(sunday.dayValue)).toBe(RATE);
  });

  it("Paid Leave (PL) earns the normal daily salary", () => {
    const days = gradeMonth({ month: MONTH, leave: { "2026-08-19": "paid" } });
    const pl = days.find((d) => d.logDate === "2026-08-19")!;
    expect(pl.code).toBe("PL");
    expect(pl.dayValue).toBe(1);
    expect(earn(pl.dayValue)).toBe(RATE);
  });

  it("Unpaid Leave (LWP) earns ₹0", () => {
    const days = gradeMonth({ month: MONTH, leave: { "2026-08-19": "unpaid" } });
    const lwp = days.find((d) => d.logDate === "2026-08-19")!;
    expect(lwp.code).toBe("LWP");
    expect(lwp.dayValue).toBe(0);
    expect(earn(lwp.dayValue)).toBe(0);
  });

  it("a perfect month pays exactly ₹31,000 — offs and holidays included", () => {
    const days = gradeMonth({ month: MONTH, holidays: ["2026-08-19"] });
    const b = payFor(days, { month: MONTH, monthlySalary: SALARY, refTodayISO: EOM });
    expect(b.gross).toBeCloseTo(SALARY, 2);
  });

  it("one absence costs exactly one day, and nothing else moves", () => {
    const clean = gradeMonth({ month: MONTH });
    const withAbsence = gradeMonth({
      month: MONTH,
      workedMinutes: (ymd) => (ymd === "2026-08-19" ? 0 : FT.dailyTargetMinutes),
    });
    const a = payFor(clean, { month: MONTH, monthlySalary: SALARY, refTodayISO: EOM });
    const b = payFor(withAbsence, { month: MONTH, monthlySalary: SALARY, refTodayISO: EOM });
    expect(a.gross - b.gross).toBeCloseTo(RATE, 2);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   TEST 4 — FUTURE DAYS MUST NOT AFFECT THE CURRENT TARGET
   ══════════════════════════════════════════════════════════════════════════ */

describe("future days are not part of the month so far (spec §3)", () => {
  const MONTH = "2026-08";
  const MID = "2026-08-12";

  it("target hours count only the days that have happened", () => {
    const days = gradeMonth({ month: MONTH, refTodayISO: MID });
    const mid = payrollMonthFor(days, { month: MONTH, cfg: FT, refTodayISO: MID });
    const whole = payrollMonthFor(days, { month: MONTH, cfg: FT, refTodayISO: "2026-08-31" });
    expect(mid.hours.targetMinutes).toBeLessThan(whole.hours.targetMinutes);
    expect(mid.payroll.elapsedGradedDays).toBe(12);
  });

  it("a fully-worked month-to-date shows NO deficit", () => {
    // Every elapsed day worked in full. The month has 19 days still to come,
    // and none of them may read as already missed.
    const days = gradeMonth({ month: MONTH, refTodayISO: MID });
    const { recon, hours } = payrollMonthFor(days, {
      month: MONTH,
      cfg: FT,
      refTodayISO: MID,
    });
    expect(recon.monthlyHourBalanceMinutes).toBe(0);
    expect(hours.actualMinutes).toBe(hours.targetMinutes - hours.creditedMinutes);
    for (const w of recon.weeks) expect(w.deficitMinutes).toBe(0);
  });

  it("pay so far is the elapsed days only, never the whole month", () => {
    const days = gradeMonth({ month: MONTH, refTodayISO: MID });
    const b = payFor(days, { month: MONTH, monthlySalary: 31_000, refTodayISO: MID });
    // 12 elapsed days, all worth a full day (two of them Sundays).
    expect(b.payableDays).toBe(12);
    expect(b.gross).toBeCloseTo(12_000, 2);
  });

  it("an APPROVED FUTURE leave is not credited before it happens", () => {
    const days = gradeMonth({
      month: MONTH,
      refTodayISO: MID,
      leave: { "2026-08-25": "paid" },
    });
    const { payroll } = payrollMonthFor(days, { month: MONTH, cfg: FT, refTodayISO: MID });
    // 12 elapsed days; the 25th is not among them.
    expect(payroll.elapsedGradedDays).toBe(12);
    expect(payroll.payableDayValue).toBe(12);
  });

  it("a CLOSED month is unaffected — every one of its days has elapsed", () => {
    const days = gradeMonth({ month: MONTH });
    const asOfEom = payrollMonthFor(days, { month: MONTH, cfg: FT, refTodayISO: "2026-08-31" });
    const asOfLater = payrollMonthFor(days, { month: MONTH, cfg: FT, refTodayISO: "2026-12-31" });
    expect(asOfLater.hours).toEqual(asOfEom.hours);
    expect(asOfLater.payroll.payableDayValue).toBe(asOfEom.payroll.payableDayValue);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   TEST 5 — THE ATTENDANCE "WK" NUMBER IS THE ONE SALARY USES
   ══════════════════════════════════════════════════════════════════════════ */

describe("one canonical worked-hours figure (spec §2)", () => {
  const MONTH = "2026-08";

  /**
   * The Attendance calendar's own WK arithmetic, reproduced exactly as
   * `components/attendance/month-calendar.tsx` renders it: every non-future
   * cell of the Monday-anchored row, summed.
   */
  function calendarWk(days: GradedDay[], weekKey: string, refTodayISO: string): number {
    return weeklyWorkedMinutes(
      days.filter((d) => weekKeyOf(d.logDate) === weekKey && d.logDate <= refTodayISO),
    );
  }

  it("the engine's weekly actual equals the calendar's WK, week for week", () => {
    const days = gradeMonth({
      month: MONTH,
      // A deliberately uneven month: short days, a long day, an absence.
      workedMinutes: (ymd) => {
        const d = Number(ymd.slice(8, 10));
        if (d === 5) return 5 * 60 + 30; // 5h30
        if (d === 6) return 11 * 60; // long day
        if (d === 13) return 0; // absent
        return 9 * 60;
      },
    });
    const recon = reconcileMonth(toGraded(days), {
      month: MONTH,
      weeklyTargetMinutes: FT.weeklyTargetMinutes,
      waiverThresholdMinutes: FT.waiverThresholdMinutes,
      workingDaysPerWeek: FT.workingDaysPerWeek,
      refTodayISO: "2026-08-31",
    });
    expect(recon.weeks.length).toBeGreaterThan(0);
    for (const w of recon.weeks) {
      expect(w.actualMinutes).toBe(calendarWk(days, w.weekKey, "2026-08-31"));
    }
  });

  it("counts hours worked on a HOLIDAY too — the calendar shows them, so salary sees them", () => {
    // This is the case the two used to disagree on: the calendar summed the
    // holiday's worked minutes into WK while the reconciler discarded them.
    const days = gradeMonth({ month: MONTH, holidays: ["2026-08-19"] });
    const worked = days.map((d) =>
      d.logDate === "2026-08-19"
        ? { ...d, code: "HP", dayValue: 2, workedMinutes: 8 * 60 }
        : d,
    );
    const week = weekKeyOf("2026-08-19");
    const recon = reconcileMonth(toGraded(worked), {
      month: MONTH,
      weeklyTargetMinutes: FT.weeklyTargetMinutes,
      waiverThresholdMinutes: FT.waiverThresholdMinutes,
      workingDaysPerWeek: FT.workingDaysPerWeek,
      refTodayISO: "2026-08-31",
    });
    const engineWeek = recon.weeks.find((w) => w.weekKey === week)!;
    expect(engineWeek.actualMinutes).toBe(calendarWk(worked, week, "2026-08-31"));
    // And the holiday still owes NO target — working it can only ever help.
    const clean = reconcileMonth(toGraded(days), {
      month: MONTH,
      weeklyTargetMinutes: FT.weeklyTargetMinutes,
      waiverThresholdMinutes: FT.waiverThresholdMinutes,
      workingDaysPerWeek: FT.workingDaysPerWeek,
      refTodayISO: "2026-08-31",
    });
    const cleanWeek = clean.weeks.find((w) => w.weekKey === week)!;
    expect(engineWeek.weeklyTargetMinutes).toBe(cleanWeek.weeklyTargetMinutes);
  });

  it("a 25h30m week is 25h30m on both sides — no rounding, no re-derivation", () => {
    const days = gradeMonth({
      month: MONTH,
      workedMinutes: (ymd) => {
        const d = Number(ymd.slice(8, 10));
        // Mon 3 – Sat 8 is one whole week: 25h30 across it.
        if (d === 3) return 5 * 60;
        if (d === 4) return 5 * 60;
        if (d === 5) return 5 * 60;
        if (d === 6) return 5 * 60;
        if (d === 7) return 5 * 60 + 30;
        if (d === 8) return 0;
        return 9 * 60;
      },
    });
    const week = weekKeyOf("2026-08-03");
    const recon = reconcileMonth(toGraded(days), {
      month: MONTH,
      weeklyTargetMinutes: FT.weeklyTargetMinutes,
      waiverThresholdMinutes: FT.waiverThresholdMinutes,
      workingDaysPerWeek: FT.workingDaysPerWeek,
      refTodayISO: "2026-08-31",
    });
    const w = recon.weeks.find((k) => k.weekKey === week)!;
    expect(w.actualMinutes).toBe(25 * 60 + 30);
    expect(w.actualMinutes).toBe(calendarWk(days, week, "2026-08-31"));
  });
});

function toGraded(days: GradedDay[]): GradedDayInput[] {
  return days.map((d) => ({
    date: d.logDate,
    weekKey: weekKeyOf(d.logDate),
    code: d.code,
    dayValue: d.dayValue,
    workedMinutes: d.workedMinutes,
    late: d.late,
    leftEarly: d.leftEarly,
  }));
}

/* ══════════════════════════════════════════════════════════════════════════
   TEST 6-7 — FULL-TIME WEEKLY SURPLUS IS A TARGET DEVICE, NOT PAY
   ══════════════════════════════════════════════════════════════════════════ */

describe("full-time weekly surplus and deficit (spec §6)", () => {
  /** Two consecutive full weeks, with explicit hours per week. */
  function twoWeeks(w1: number, w2: number, month = "2026-09"): GradedDayInput[] {
    // 2026-09: Mon 7 – Sat 12 is week 1, Mon 14 – Sat 19 is week 2.
    const wk1 = ["07", "08", "09", "10", "11", "12"];
    const wk2 = ["14", "15", "16", "17", "18", "19"];
    const mk = (dd: string, minutes: number): GradedDayInput => ({
      date: `${month}-${dd}`,
      weekKey: weekKeyOf(`${month}-${dd}`),
      code: "P",
      dayValue: 1,
      workedMinutes: minutes,
      late: false,
      leftEarly: false,
    });
    return [
      ...wk1.map((d) => mk(d, Math.round((w1 * 60) / 6))),
      ...wk2.map((d) => mk(d, Math.round((w2 * 60) / 6))),
    ];
  }

  const recon = (days: GradedDayInput[], month = "2026-09") =>
    reconcileMonth(days, {
      month,
      weeklyTargetMinutes: FT.weeklyTargetMinutes,
      waiverThresholdMinutes: FT.waiverThresholdMinutes,
      workingDaysPerWeek: FT.workingDaysPerWeek,
      refTodayISO: "2026-09-30",
    });

  it("54h target, 58h worked → +4h surplus", () => {
    const r = recon(twoWeeks(58, 54));
    const w1 = r.weeks[0]!;
    expect(w1.weeklyTargetMinutes).toBe(54 * 60);
    expect(w1.actualMinutes).toBe(58 * 60);
    expect(w1.surplusMinutes).toBe(4 * 60);
    expect(w1.closingBalanceMinutes).toBe(4 * 60);
  });

  it("the +4h surplus LOWERS week 2's effective target to 50h", () => {
    const r = recon(twoWeeks(58, 50));
    const w2 = r.weeks[1]!;
    expect(w2.weeklyTargetMinutes).toBe(54 * 60); // the base target is unchanged
    expect(w2.carryInMinutes).toBe(4 * 60);
    expect(w2.effectiveTargetMinutes).toBe(50 * 60); // …but only 50h was owed
    expect(w2.requirementSatisfied).toBe(true);
    expect(w2.deficitMinutes).toBe(0);
    // 58 + 50 = 108 = 2 × 54. The month is square.
    expect(r.monthlyHourBalanceMinutes).toBe(0);
  });

  it("a DEFICIT carries the other way — a short week raises the next target", () => {
    const r = recon(twoWeeks(50, 54));
    const w2 = r.weeks[1]!;
    expect(w2.carryInMinutes).toBe(-4 * 60);
    expect(w2.effectiveTargetMinutes).toBe(58 * 60);
    expect(w2.requirementSatisfied).toBe(false);
  });

  it("creates NO separate overtime pay for a full-timer", () => {
    // Two long weeks: a genuine month-end surplus that survives everything.
    const r = recon(twoWeeks(60, 60));
    expect(r.monthlyHourBalanceMinutes).toBeGreaterThan(0);

    // And the pay function cannot spend it: `computeDailySalary` takes no
    // overtime input at all, and a full-timer earns none by policy.
    expect(earnsOvertime("full_time")).toBe(false);
    expect(payBasisFor("full_time")).toBe("monthly_ctc");

    const b = computeDailySalary({
      monthlySalary: 30_000,
      daysInMonth: 30,
      payableDayValue: 30, // a perfect month
      ptExempt: true,
      tdsMonthly: 0,
      advances: 0,
      pendingBalanceIn: 0,
    });
    expect(b.overtimeHours).toBe(0);
    expect(b.overtimeAmount).toBe(0);
    // Never more than the monthly salary, however long the weeks were.
    expect(b.gross).toBeCloseTo(30_000, 2);
  });

  it("MONTH BOUNDARY: August surplus does not reduce September's target", () => {
    const augustLong: GradedDayInput[] = ["25", "26", "27", "28", "29"].map((dd) => ({
      date: `2026-08-${dd}`,
      weekKey: weekKeyOf(`2026-08-${dd}`),
      code: "P",
      dayValue: 1,
      workedMinutes: 12 * 60, // 60h across the week — a big surplus
      late: false,
      leftEarly: false,
    }));
    const september = twoWeeks(54, 54);

    // Graded together, as they would be if the balance ever crossed over.
    const sept = recon([...augustLong, ...september], "2026-09");
    const septAlone = recon(september, "2026-09");

    // August's days are simply not in September's month, so the first
    // September week opens at zero carry either way.
    expect(sept.weeks[0]!.carryInMinutes).toBe(0);
    expect(sept.weeks[0]!.effectiveTargetMinutes).toBe(54 * 60);
    expect(sept.totalTargetMinutes).toBe(septAlone.totalTargetMinutes);
    expect(sept.monthlyHourBalanceMinutes).toBe(septAlone.monthlyHourBalanceMinutes);
  });

  it("a month's balance always opens at zero, whatever the month before did", () => {
    const r = recon(twoWeeks(20, 54)); // a disastrous first week
    expect(r.weeks[0]!.carryInMinutes).toBe(0);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   TEST 8 — INTERN OVERTIME IS UNTOUCHED
   ══════════════════════════════════════════════════════════════════════════ */

describe("intern / hourly-shift overtime still pays (spec §7)", () => {
  it("the two models are routed by pay basis and never overlap", () => {
    expect(payBasisFor("full_time")).toBe("monthly_ctc");
    for (const w of ["hybrid", "first_half", "second_half"] as const) {
      expect(payBasisFor(w)).toBe("hourly");
      expect(earnsOvertime(w)).toBe(true);
    }
    expect(earnsOvertime("full_time")).toBe(false);
    expect(earnsOvertime("project_remote")).toBe(false);
  });

  it("pays every hour worked beyond the target, at the same rate", () => {
    // 30h week over a 30-day month → 128.57h calendar target.
    const b = computeHourlySalary({
      monthlyPayAtTarget: 12_000,
      weeklyTargetHours: 30,
      daysInMonth: 30,
      workedMinutes: 150 * 60,
      overtimeEligible: true,
      eligibleTargetHours: 120,
      ptExempt: true,
      tdsMonthly: 0,
      advances: 0,
      pendingBalanceIn: 0,
    });
    const rate = 12_000 / 120;
    expect(b.hourlyRate).toBeCloseTo(rate, 2);
    expect(b.workedHours).toBe(150);
    expect(b.targetHours).toBe(120);
    expect(b.overtimeHours).toBe(30);
    expect(b.overtimeAmount).toBeCloseTo(rate * 30, 2);
    // base + overtime = rate × every hour worked. No premium, no cap.
    expect(b.gross).toBeCloseTo(rate * 150, 2);
    expect(b.gross).toBeGreaterThan(12_000);
  });

  it("still CAPS a worker who is not overtime-eligible", () => {
    const b = computeHourlySalary({
      monthlyPayAtTarget: 12_000,
      weeklyTargetHours: 30,
      daysInMonth: 30,
      workedMinutes: 150 * 60,
      overtimeEligible: false,
      eligibleTargetHours: 120,
      ptExempt: true,
      tdsMonthly: 0,
      advances: 0,
      pendingBalanceIn: 0,
    });
    expect(b.overtimeHours).toBe(0);
    expect(b.gross).toBe(12_000);
  });

  it("the full-time surplus rule cannot leak into it — different function, different shape", () => {
    // `computeDailySalary` has no overtime field to pass; `computeHourlySalary`
    // has no day-value field. The two cannot be confused at a call site.
    const daily = computeDailySalary({
      monthlySalary: 31_000,
      daysInMonth: 31,
      payableDayValue: 31,
      ptExempt: true,
      tdsMonthly: 0,
      advances: 0,
      pendingBalanceIn: 0,
    });
    expect(daily.basis).toBe("monthly_ctc");
    expect(daily.overtimeAmount).toBe(0);

    const hourly = computeHourlySalary({
      monthlyPayAtTarget: 12_000,
      weeklyTargetHours: 30,
      daysInMonth: 31,
      workedMinutes: 140 * 60,
      overtimeEligible: true,
      eligibleTargetHours: 120,
      ptExempt: true,
      tdsMonthly: 0,
      advances: 0,
      pendingBalanceIn: 0,
    });
    expect(hourly.basis).toBe("hourly");
    expect(hourly.overtimeAmount).toBeGreaterThan(0);
    expect(hourly.payableDays).toBe(0); // days are meaningless on this basis
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   TEST 9-11 — HOLIDAYS AND LEAVE
   ══════════════════════════════════════════════════════════════════════════ */

describe("holidays and leave move the target and the pay correctly", () => {
  const MONTH = "2026-08";
  const EOM = "2026-08-31";
  const SALARY = 31_000;

  it("TEST 9 — turning a working day into a holiday removes its target, creates no absence, costs nothing", () => {
    const workingDay = gradeMonth({ month: MONTH });
    const asHoliday = gradeMonth({ month: MONTH, holidays: ["2026-08-19"] });

    const before = payrollMonthFor(workingDay, { month: MONTH, cfg: FT, refTodayISO: EOM });
    const after = payrollMonthFor(asHoliday, { month: MONTH, cfg: FT, refTodayISO: EOM });

    // Target falls by exactly one scheduled day.
    expect(before.recon.totalTargetMinutes - after.recon.totalTargetMinutes).toBe(
      FT.dailyTargetMinutes,
    );
    // Not an absence.
    expect(asHoliday.find((d) => d.logDate === "2026-08-19")!.code).toBe("H");
    // And the pay is unchanged — the day is still worth 1.0.
    const payBefore = payFor(workingDay, { month: MONTH, monthlySalary: SALARY, refTodayISO: EOM });
    const payAfter = payFor(asHoliday, { month: MONTH, monthlySalary: SALARY, refTodayISO: EOM });
    expect(payAfter.gross).toBeCloseTo(payBefore.gross, 2);
    expect(payAfter.gross).toBeCloseTo(SALARY, 2);
  });

  it("TEST 9b — a holiday on a day that was ABSENT turns a loss into full pay", () => {
    const absent = gradeMonth({
      month: MONTH,
      workedMinutes: (ymd) => (ymd === "2026-08-19" ? 0 : FT.dailyTargetMinutes),
    });
    const holiday = gradeMonth({ month: MONTH, holidays: ["2026-08-19"] });
    const a = payFor(absent, { month: MONTH, monthlySalary: SALARY, refTodayISO: EOM });
    const h = payFor(holiday, { month: MONTH, monthlySalary: SALARY, refTodayISO: EOM });
    expect(h.gross - a.gross).toBeCloseTo(1000, 2);
  });

  it("TEST 10 — approved PAID leave earns a full day, reduces the target, loses nothing", () => {
    const clean = gradeMonth({ month: MONTH });
    const onLeave = gradeMonth({ month: MONTH, leave: { "2026-08-19": "paid" } });

    const before = payrollMonthFor(clean, { month: MONTH, cfg: FT, refTodayISO: EOM });
    const after = payrollMonthFor(onLeave, { month: MONTH, cfg: FT, refTodayISO: EOM });
    // The day owes no hours…
    expect(before.recon.totalTargetMinutes - after.recon.totalTargetMinutes).toBe(
      FT.dailyTargetMinutes,
    );
    // …but is still credited toward the month's requirement.
    expect(after.hours.creditedMinutes).toBe(FT.dailyTargetMinutes);

    const a = payFor(clean, { month: MONTH, monthlySalary: SALARY, refTodayISO: EOM });
    const b = payFor(onLeave, { month: MONTH, monthlySalary: SALARY, refTodayISO: EOM });
    expect(b.gross).toBeCloseTo(a.gross, 2);
    expect(b.gross).toBeCloseTo(SALARY, 2);
  });

  it("TEST 11 — approved UNPAID leave earns ₹0 and deducts exactly one daily salary", () => {
    const clean = gradeMonth({ month: MONTH });
    const unpaid = gradeMonth({ month: MONTH, leave: { "2026-08-19": "unpaid" } });

    const graded = unpaid.find((d) => d.logDate === "2026-08-19")!;
    expect(graded.code).toBe("LWP");
    expect(graded.dayValue).toBe(0);

    const a = payFor(clean, { month: MONTH, monthlySalary: SALARY, refTodayISO: EOM });
    const b = payFor(unpaid, { month: MONTH, monthlySalary: SALARY, refTodayISO: EOM });
    expect(a.gross - b.gross).toBeCloseTo(1000, 2);
    // Charged ONCE, never twice: the day is not also counted as absent.
    expect(b.payableDays).toBe(30);
  });

  it("a holiday falling inside an approved leave does not burn the leave day", () => {
    const days = gradeMonth({
      month: MONTH,
      holidays: ["2026-08-19"],
      leave: { "2026-08-19": "paid" },
    });
    expect(days.find((d) => d.logDate === "2026-08-19")!.code).toBe("H");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   TEST 13 — IDEMPOTENCE
   ══════════════════════════════════════════════════════════════════════════ */

describe("recalculation is idempotent (spec §13)", () => {
  const MONTH = "2026-08";
  const EOM = "2026-08-31";

  it("the same graded month always produces the same pay", () => {
    const days = gradeMonth({
      month: MONTH,
      holidays: ["2026-08-15"],
      leave: { "2026-08-11": "paid", "2026-08-12": "unpaid" },
      workedMinutes: (ymd) => (Number(ymd.slice(8, 10)) % 7 === 0 ? 5 * 60 : 9 * 60),
    });
    const runs = Array.from({ length: 5 }, () =>
      payFor(days, { month: MONTH, monthlySalary: 31_000, refTodayISO: EOM }),
    );
    for (const r of runs) expect(r).toEqual(runs[0]);
  });

  it("a CLOSED month is a fixed point — 'now' stops mattering once it is over", () => {
    const days = gradeMonth({ month: MONTH });
    const dayAfter = payFor(days, { month: MONTH, monthlySalary: 31_000, refTodayISO: "2026-09-01" });
    const monthsLater = payFor(days, { month: MONTH, monthlySalary: 31_000, refTodayISO: "2027-03-11" });
    expect(monthsLater).toEqual(dayAfter);
  });

  it("payableDayValue is a pure sum — order and repetition change nothing", () => {
    const days = gradeMonth({ month: MONTH });
    const rows = days.map((d) => ({ logDate: d.logDate, dayValue: d.dayValue }));
    const a = payableDayValue(rows, EOM);
    const b = payableDayValue([...rows].reverse(), EOM);
    expect(a).toBe(b);
    expect(a).toBe(31);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   TEST 12 — A CHANGE IN A CLOSED MONTH REPRICES THAT MONTH
   ══════════════════════════════════════════════════════════════════════════ */

describe("closed months are recalculable (spec §10/§11)", () => {
  it("the same inputs with one holiday added produce a DIFFERENT, correct figure", () => {
    // The arithmetic half of "close August, change an August holiday,
    // recalculate, and August changes". The persistence half lives in
    // lib/salary/refresh-run.ts, which no longer refuses a non-current month.
    const MONTH = "2026-08";
    const EOM = "2026-08-31";
    const absentThatDay = (ymd: string) => (ymd === "2026-08-19" ? 0 : FT.dailyTargetMinutes);

    const before = payFor(gradeMonth({ month: MONTH, workedMinutes: absentThatDay }), {
      month: MONTH,
      monthlySalary: 31_000,
      refTodayISO: EOM,
    });
    const after = payFor(
      gradeMonth({ month: MONTH, holidays: ["2026-08-19"], workedMinutes: absentThatDay }),
      { month: MONTH, monthlySalary: 31_000, refTodayISO: EOM },
    );
    expect(before.gross).toBeCloseTo(30_000, 2);
    expect(after.gross).toBeCloseTo(31_000, 2);
  });

  it("a dated change names every month it spans, so neither end is left stale", () => {
    expect(monthsSpanned("2026-08-30", "2026-09-02")).toEqual(["2026-08", "2026-09"]);
    expect(monthsSpanned("2026-08-05", "2026-08-07")).toEqual(["2026-08"]);
    expect(monthsSpanned("2026-11-20", "2027-01-04")).toEqual([
      "2026-11",
      "2026-12",
      "2027-01",
    ]);
    // Nonsense ranges yield nothing rather than looping.
    expect(monthsSpanned("2026-09-01", "2026-08-01")).toEqual([]);
  });
});
