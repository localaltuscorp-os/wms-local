import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  publishedHolidayDates,
  publishedHolidaysForYear,
  publishedHolidaysFrom,
} from "@/lib/hr/holidays-2026";
import { mergeUpcomingHolidays } from "@/lib/attendance/holiday-merge";
import { computeDayCode } from "@/lib/attendance/status";
import {
  resolveEffectiveConfig,
  toAttendanceSchedule,
} from "@/lib/attendance/effective-config";
import {
  expectsScheduledHours,
  isOrdinaryAttendanceDay,
  weekKeyOf,
} from "@/lib/attendance/hours-rule";
import {
  reconcileMonth,
  payableHoursForMonth,
  type GradedDayInput,
} from "@/lib/attendance/hour-balance";
import { computeScheduleHourlySalary } from "@/lib/salary/compute";

/**
 * HR HOLIDAY / LEAVE / REMOTE WORK → ATTENDANCE → SALARY, end to end.
 *
 * The three features have no salary maths of their own. A holiday, an approved
 * leave and an approved remote-work day each write (or declare) ONE fact, and
 * the money follows because the same grader, the same reconciliation and the
 * same payroll formula already read it:
 *
 *   HR holiday calendar ─┐
 *   approved leave row ──┼→ computeDayCode → reconcileMonth
 *   approved remote day ─┘        → payableHoursForMonth
 *                                     → computeScheduleHourlySalary
 *
 * This file walks that whole chain with a REAL calendar month, so a break in
 * any link fails here rather than in somebody's payslip.
 *
 * THE RULE UNDER TEST, in one line: a holiday or an approved leave lowers the
 * hours you OWE; it never adds to the hours you WORKED, never marks you absent,
 * and — for everything except unpaid leave — never costs you money.
 */

/* ────────────────────────────────────────────────────────────────────────────
   The employee and the month
   ──────────────────────────────────────────────────────────────────────────── */

/** A standard full-timer: 10:00–19:00 (9h), Mon–Sat, Sunday off. */
const FULL_TIME = {
  workerType: "full_time",
  attOfficialStart: "10:00:00",
  attOfficialEnd: "19:00:00",
  attLateAfter: null,
  attEarlyBefore: null,
  weeklyOff: 0,
};

/** A HYBRID employee whose admin-set week is 27h — the §5 "do not assume 30h". */
const HYBRID_27H = {
  workerType: "hybrid",
  attOfficialStart: "10:00:00",
  attOfficialEnd: "20:00:00", // a WINDOW, not the hours owed
  attLateAfter: null,
  attEarlyBefore: null,
  weeklyTargetMinutes: 27 * 60,
  weeklyOff: 0,
};

const CFG = resolveEffectiveConfig(FULL_TIME);
const SCHED = toAttendanceSchedule(CFG);

/**
 * September 2026 — chosen because the PUBLISHED HR calendar really does put
 * three holidays in it (Janmashtami, Ganpati Day 1, Ganpati Day 10), so these
 * tests exercise the firm's own list rather than invented dates.
 */
const MONTH = "2026-09";
const SEPT_HOLIDAYS = ["2026-09-04", "2026-09-14", "2026-09-23"];
/** Sundays in September 2026. */
const SUNDAYS = ["2026-09-06", "2026-09-13", "2026-09-20", "2026-09-27"];

function daysOfMonth(month: string): string[] {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from(
    { length: last },
    (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`,
  );
}

function isSunday(ymd: string): boolean {
  return new Date(`${ymd}T00:00:00Z`).getUTCDay() === 0;
}

interface MonthSpec {
  holidays?: readonly string[];
  leave?: Readonly<Record<string, "paid" | "unpaid">>;
  /** Worked minutes for an ordinary (punchable) day. Default: a full 9h. */
  workedMinutes?: (ymd: string) => number;
}

/**
 * Grade a whole month through the REAL day engine, exactly as
 * `lib/queries/attendance-status.gradeMonth` does — holiday-over-leave
 * precedence included, so a holiday inside an approved leave does not burn the
 * leave.
 */
function gradeMonth(spec: MonthSpec = {}): GradedDayInput[] {
  const holidays = new Set(spec.holidays ?? []);
  const leave = spec.leave ?? {};
  const worked = spec.workedMinutes ?? (() => 9 * 60);

  return daysOfMonth(MONTH).map((ymd) => {
    const isWeeklyOff = isSunday(ymd);
    const isHoliday = holidays.has(ymd);
    // A holiday wins over leave: you do not spend a leave day on a day off.
    const onLeave = isHoliday ? null : (leave[ymd] ?? null);

    const punchable = !isWeeklyOff && !isHoliday && !onLeave;
    const minutes = punchable ? worked(ymd) : 0;
    const punch =
      minutes > 0
        ? { inAt: "10:00", outAt: minutesToClock(10 * 60 + minutes) }
        : { inAt: null, outAt: null };

    const g = computeDayCode(
      punch,
      SCHED,
      { isWeeklyOff, isHoliday, leave: onLeave },
      "23:59",
    );
    return {
      date: ymd,
      weekKey: weekKeyOf(ymd),
      code: g.code,
      dayValue: g.dayValue,
      workedMinutes: g.workedMinutes,
      late: g.late,
      leftEarly: g.leftEarly,
    };
  });
}

function minutesToClock(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

/** Run the month through the payroll chain the salary engine actually uses. */
function payrollFor(days: GradedDayInput[], monthlySalary = 54_000) {
  const recon = reconcileMonth(days, {
    month: MONTH,
    weeklyTargetMinutes: CFG.weeklyTargetMinutes,
    waiverThresholdMinutes: CFG.waiverThresholdMinutes,
    workingDaysPerWeek: CFG.workingDaysPerWeek,
  });
  const hours = payableHoursForMonth(days, recon, CFG.dailyTargetMinutes);
  const breakdown = computeScheduleHourlySalary({
    monthlySalary,
    monthlyTargetHours: hours.targetHours,
    payableHoursRaw: hours.payableMinutesRaw / 60,
    dailyTargetHours: CFG.dailyTargetMinutes / 60,
    chargeableHalfDays: recon.chargeableHalfDays,
    unpaidLeaveDays: hours.unpaidLeaveDays,
    ptExempt: true,
    tdsMonthly: 0,
    advances: 0,
    pendingBalanceIn: 0,
  });
  return {
    recon,
    hours,
    breakdown,
    /** "Salary Lost", exactly as the Attendance KPI derives it. */
    salaryLost: Math.max(0, Math.round(monthlySalary - breakdown.gross)),
    /** Required hours, as the Attendance KPI derives them. */
    requiredHours:
      (days.filter((d) => !isSunday(d.date) && expectsScheduledHours(d.code)).length *
        CFG.dailyTargetMinutes) /
      60,
    workedHours: days.reduce((s, d) => s + d.workedMinutes, 0) / 60,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
   §2 — the HR Holiday List really is the source of truth
   ──────────────────────────────────────────────────────────────────────────── */

describe("the published HR holiday calendar reaches attendance", () => {
  it("normalises the published list to the yyyy-mm-dd the grader keys on", () => {
    const dates = publishedHolidayDates(2026);
    expect(dates).toContain("2026-01-26"); // Republic Day
    expect(dates).toContain("2026-08-15"); // Independence Day
    for (const d of SEPT_HOLIDAYS) expect(dates).toContain(d);
    for (const d of dates) expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("covers every published year, and is empty for one with no list", () => {
    expect(publishedHolidayDates(2027).length).toBeGreaterThan(0);
    expect(publishedHolidayDates(2028).length).toBeGreaterThan(0);
    expect(publishedHolidayDates(2035)).toEqual([]);
  });

  it("carries a readable label, with the '(National Holiday)' tag stripped", () => {
    const republic = publishedHolidaysForYear(2026).find((h) => h.date === "2026-01-26");
    expect(republic?.label).toBe("Republic Day");
  });

  it("looks ahead with NO horizon — the next day off may be a year out", () => {
    const from2027 = publishedHolidaysFrom("2027-11-15");
    expect(from2027.some((h) => h.date.startsWith("2028"))).toBe(true);
    expect(from2027.every((h) => h.date >= "2027-11-15")).toBe(true);
  });

  /**
   * THE REGRESSION GUARD. The published list existed for a long time as data
   * nothing but the HR page read: `listHolidayDateSet` looked at two DB tables
   * and neither carries it, so every published holiday graded as an ordinary
   * working day and flowed through the target hours into a salary deduction.
   * A source check because the function itself needs a database.
   */
  it("is actually WIRED IN to the attendance holiday set", () => {
    const src = readFileSync(
      path.join(process.cwd(), "lib/queries/holidays.ts"),
      "utf8",
    );
    expect(src).toContain("publishedHolidayDates");
    expect(src).toMatch(/listHolidayDateSet/);
  });

  it("an INACTIVE holiday row withdraws a published day from the panel too", () => {
    const published = publishedHolidaysFrom("2026-09-01").slice(0, 5);
    const withAll = mergeUpcomingHolidays([], published, "2026-09-01", 5);
    expect(withAll.some((h) => h.date === "2026-09-04")).toBe(true);

    const suppressed = mergeUpcomingHolidays(
      [],
      published,
      "2026-09-01",
      5,
      new Set(["2026-09-04"]),
    );
    expect(suppressed.some((h) => h.date === "2026-09-04")).toBe(false);
  });
});

/* ────────────────────────────────────────────────────────────────────────────
   §2 / §10 — holidays in attendance and pay
   ──────────────────────────────────────────────────────────────────────────── */

describe("a holiday lowers the target and costs nothing", () => {
  const clean = payrollFor(gradeMonth());
  const oneHoliday = payrollFor(gradeMonth({ holidays: ["2026-09-14"] }));

  it("grades H, never Absent (edge case 2)", () => {
    const day = gradeMonth({ holidays: ["2026-09-14"] }).find(
      (d) => d.date === "2026-09-14",
    )!;
    expect(day.code).toBe("H");
    expect(day.code).not.toBe("A");
  });

  it("adds NOTHING to hours worked", () => {
    const day = gradeMonth({ holidays: ["2026-09-14"] }).find(
      (d) => d.date === "2026-09-14",
    )!;
    expect(day.workedMinutes).toBe(0);
    expect(oneHoliday.workedHours).toBe(clean.workedHours - 9);
  });

  it("reduces the required hours by exactly that day's scheduled hours (§2)", () => {
    expect(clean.requiredHours - oneHoliday.requiredHours).toBe(9);
    expect(oneHoliday.hours.targetHours).toBe(clean.hours.targetHours - 9);
  });

  it("creates NO hours deficit — the employee need not work it back", () => {
    expect(oneHoliday.recon.monthlyHourBalanceMinutes).toBe(0);
    expect(
      oneHoliday.recon.weeks.every((w) => w.deficitMinutes === 0),
    ).toBe(true);
  });

  it("costs NO salary — a shorter month still pays the full figure", () => {
    expect(oneHoliday.salaryLost).toBe(0);
    expect(oneHoliday.breakdown.gross).toBeCloseTo(clean.breakdown.gross, 2);
  });

  it("raises the hourly rate rather than shaving the base (§8)", () => {
    expect(oneHoliday.breakdown.hourlyRate).toBeGreaterThan(
      clean.breakdown.hourlyRate!,
    );
  });

  it("shrinks the WEEK's target, not just the month's (edge case 3)", () => {
    // 2026-09-14 is a Monday, so its week is the one anchored on the 14th.
    const week = oneHoliday.recon.weeks.find((w) => w.weekKey === "2026-09-14")!;
    const cleanWeek = clean.recon.weeks.find((w) => w.weekKey === "2026-09-14")!;
    expect(week.expectedDays).toBe(cleanWeek.expectedDays - 1);
    expect(week.weeklyTargetMinutes).toBe(cleanWeek.weeklyTargetMinutes - 9 * 60);
    expect(week.requirementSatisfied).toBe(true);
  });

  it("handles MULTIPLE holidays in one week (edge case 14)", () => {
    // 2026-09-15 and 2026-09-16 are the Tue/Wed of the same week as the 14th.
    const three = payrollFor(
      gradeMonth({ holidays: ["2026-09-14", "2026-09-15", "2026-09-16"] }),
    );
    const week = three.recon.weeks.find((w) => w.weekKey === "2026-09-14")!;
    expect(week.expectedDays).toBe(3);
    expect(week.weeklyTargetMinutes).toBe(27 * 60);
    expect(week.deficitMinutes).toBe(0);
    expect(three.salaryLost).toBe(0);
  });

  it("handles the WHOLE published month (edge cases 4 + 20)", () => {
    const withAll = payrollFor(gradeMonth({ holidays: SEPT_HOLIDAYS }));
    expect(clean.requiredHours - withAll.requiredHours).toBe(27);
    expect(withAll.recon.monthlyHourBalanceMinutes).toBe(0);
    expect(withAll.salaryLost).toBe(0);
    // Edge case 20 — a holiday declared in HR AFTER the fact simply regrades:
    // the target falls, and pay for a month that was already complete is
    // unchanged rather than retroactively short.
    expect(withAll.breakdown.gross).toBeCloseTo(clean.breakdown.gross, 2);
  });

  it("a holiday on a SUNDAY buys nobody a day — the target is already zero there", () => {
    const onSunday = payrollFor(gradeMonth({ holidays: [SUNDAYS[0]!] }));
    expect(onSunday.requiredHours).toBe(clean.requiredHours);
    expect(onSunday.hours.targetHours).toBe(clean.hours.targetHours);
  });
});

describe("working ON a holiday never raises what you were required to work", () => {
  it("HP and H-H/D are exempt from the hours expectation", () => {
    expect(expectsScheduledHours("HP")).toBe(false);
    expect(expectsScheduledHours("H-H/D")).toBe(false);
    expect(expectsScheduledHours("H")).toBe(false);
    expect(expectsScheduledHours("PL")).toBe(false);
    expect(expectsScheduledHours("LWP")).toBe(false);
    expect(expectsScheduledHours("CO")).toBe(false);
    expect(expectsScheduledHours("W/O")).toBe(false);
    // The three days that DO owe hours.
    expect(expectsScheduledHours("P")).toBe(true);
    expect(expectsScheduledHours("H/D")).toBe(true);
    expect(expectsScheduledHours("A")).toBe(true);
  });

  it("agrees with the reconciler about which days carry a target", () => {
    // The bug this closes: `reconcileMonth` excluded HP from the salary target
    // (it is not an ordinary day) while the KPI's required hours counted it, so
    // a worked holiday made Attendance and the payslip disagree by a day.
    for (const code of ["HP", "H-H/D", "H", "PL", "CO", "LWP", "W/O"]) {
      expect(isOrdinaryAttendanceDay(code)).toBe(false);
      expect(expectsScheduledHours(code)).toBe(false);
    }
  });
});

/* ────────────────────────────────────────────────────────────────────────────
   §3 — leave
   ──────────────────────────────────────────────────────────────────────────── */

describe("approved PAID leave (§3A)", () => {
  const clean = payrollFor(gradeMonth());
  const paid = payrollFor(gradeMonth({ leave: { "2026-09-08": "paid" } }));

  it("grades PL at full value, never Absent (edge case 5)", () => {
    const day = gradeMonth({ leave: { "2026-09-08": "paid" } }).find(
      (d) => d.date === "2026-09-08",
    )!;
    expect(day.code).toBe("PL");
    expect(day.dayValue).toBe(1);
  });

  it("adds NOTHING to hours worked", () => {
    expect(paid.workedHours).toBe(clean.workedHours - 9);
  });

  it("reduces the hours the employee must WORK by that day's schedule", () => {
    expect(clean.requiredHours - paid.requiredHours).toBe(9);
    const week = paid.recon.weeks.find((w) => w.weekKey === weekKeyOf("2026-09-08"))!;
    const cleanWeek = clean.recon.weeks.find(
      (w) => w.weekKey === weekKeyOf("2026-09-08"),
    )!;
    expect(week.weeklyTargetMinutes).toBe(cleanWeek.weeklyTargetMinutes - 9 * 60);
  });

  it("creates no deficit and no salary loss", () => {
    expect(paid.recon.monthlyHourBalanceMinutes).toBe(0);
    expect(paid.salaryLost).toBe(0);
    expect(paid.breakdown.gross).toBeCloseTo(clean.breakdown.gross, 2);
  });

  it("is CREDITED, so a month spent entirely on paid leave still pays", () => {
    // Credited days sit on both sides of the comparison — see
    // payableHoursForMonth. Without that the month would be 0 target / 0 payable.
    expect(paid.hours.creditedMinutes).toBe(9 * 60);
    expect(paid.hours.unpaidLeaveDays).toBe(0);
  });

  it("survives MULTIPLE paid leaves (edge case 15)", () => {
    const many = payrollFor(
      gradeMonth({
        leave: {
          "2026-09-08": "paid",
          "2026-09-09": "paid",
          "2026-09-10": "paid",
        },
      }),
    );
    expect(many.salaryLost).toBe(0);
    expect(many.recon.monthlyHourBalanceMinutes).toBe(0);
    expect(clean.requiredHours - many.requiredHours).toBe(27);
  });
});

describe("approved UNPAID leave (§3B)", () => {
  const clean = payrollFor(gradeMonth());
  const unpaid = payrollFor(gradeMonth({ leave: { "2026-09-08": "unpaid" } }));

  it("grades LWP, not Absent — the board can tell the two apart (edge case 6)", () => {
    const day = gradeMonth({ leave: { "2026-09-08": "unpaid" } }).find(
      (d) => d.date === "2026-09-08",
    )!;
    expect(day.code).toBe("LWP");
    expect(day.code).not.toBe("A");
    expect(day.dayValue).toBe(0);
  });

  it("adds NOTHING to hours worked", () => {
    expect(unpaid.workedHours).toBe(clean.workedHours - 9);
  });

  it("reduces the required hours — no deficit to work back", () => {
    expect(clean.requiredHours - unpaid.requiredHours).toBe(9);
    expect(unpaid.recon.monthlyHourBalanceMinutes).toBe(0);
    expect(unpaid.recon.weeks.every((w) => w.deficitMinutes === 0)).toBe(true);
  });

  it("DOES deduct salary — one scheduled day, at the month's own hourly rate", () => {
    // THE REGRESSION THIS FILE EXISTS FOR. Before `unpaidLeaveDays` reached the
    // payroll formula, an LWP day left the target AND the payable hours by
    // exactly a day, the two cancelled, and unpaid leave was paid in full.
    expect(unpaid.hours.unpaidLeaveDays).toBe(1);
    expect(unpaid.salaryLost).toBeGreaterThan(0);
    const rate = unpaid.breakdown.hourlyRate!;
    expect(unpaid.salaryLost).toBe(Math.round(rate * 9));
  });

  it("scales with the number of days (edge case 16)", () => {
    const two = payrollFor(
      gradeMonth({
        leave: { "2026-09-08": "unpaid", "2026-09-09": "unpaid" },
      }),
    );
    expect(two.hours.unpaidLeaveDays).toBe(2);
    expect(two.salaryLost).toBe(Math.round(two.breakdown.hourlyRate! * 18));
    expect(two.salaryLost).toBeGreaterThan(unpaid.salaryLost);
  });

  it("costs strictly more than the SAME day taken as paid leave", () => {
    const paid = payrollFor(gradeMonth({ leave: { "2026-09-08": "paid" } }));
    expect(unpaid.breakdown.gross).toBeLessThan(paid.breakdown.gross);
    expect(paid.salaryLost).toBe(0);
  });
});

describe("leave that was NOT approved changes nothing (edge cases 7 + 8)", () => {
  /**
   * Pending and rejected requests never reach the grader: the query layer
   * filters on `status = 'approved'` (lib/queries/leave.listEmployeeLeaveForRange),
   * so the day arrives here with no leave at all. What this pins is the OTHER
   * half — that a day with no approved leave is graded on its punches alone.
   */
  it("a day with no approved leave and no punch is a plain Absent", () => {
    const day = gradeMonth({ workedMinutes: () => 0 }).find(
      (d) => d.date === "2026-09-08",
    )!;
    expect(day.code).toBe("A");
  });

  it("a day with no approved leave that WAS worked is Present", () => {
    const day = gradeMonth().find((d) => d.date === "2026-09-08")!;
    expect(day.code).toBe("P");
  });

  it("an un-approved absence DOES cost money — the contrast with approved leave", () => {
    const absent = payrollFor(
      gradeMonth({ workedMinutes: (d) => (d === "2026-09-08" ? 0 : 9 * 60) }),
    );
    expect(absent.recon.monthlyHourBalanceMinutes).toBeLessThan(0);
    expect(absent.salaryLost).toBeGreaterThan(0);
  });
});

describe("leave and holiday in the same period (edge case 13)", () => {
  it("a holiday inside an approved leave does not burn the leave day", () => {
    const days = gradeMonth({
      holidays: ["2026-09-14"],
      leave: { "2026-09-14": "paid", "2026-09-15": "paid" },
    });
    expect(days.find((d) => d.date === "2026-09-14")!.code).toBe("H");
    expect(days.find((d) => d.date === "2026-09-15")!.code).toBe("PL");
  });

  it("both lower the target, neither is charged, and neither is a deficit", () => {
    const clean = payrollFor(gradeMonth());
    const both = payrollFor(
      gradeMonth({ holidays: ["2026-09-14"], leave: { "2026-09-08": "paid" } }),
    );
    expect(clean.requiredHours - both.requiredHours).toBe(18);
    expect(both.recon.monthlyHourBalanceMinutes).toBe(0);
    expect(both.salaryLost).toBe(0);
  });

  it("a holiday plus an UNPAID leave charges only the unpaid one", () => {
    const both = payrollFor(
      gradeMonth({ holidays: ["2026-09-14"], leave: { "2026-09-08": "unpaid" } }),
    );
    expect(both.hours.unpaidLeaveDays).toBe(1);
    expect(both.salaryLost).toBe(Math.round(both.breakdown.hourlyRate! * 9));
  });
});

/* ────────────────────────────────────────────────────────────────────────────
   §4 — remote work
   ──────────────────────────────────────────────────────────────────────────── */

describe("approved remote work behaves like ordinary attendance (§4)", () => {
  /**
   * An approved WFH / on-field / client-site day is a NORMAL working day worked
   * elsewhere. The approval is a permission, not a grade: the employee still
   * punches, and only the hours they actually record count. So the graded month
   * for a remote day is byte-for-byte the graded month for an office day — which
   * is precisely why remote work needs no branch in the payroll chain, and why
   * the marker added to the calendar is display-only.
   */
  const office = payrollFor(gradeMonth());

  it("a remote day worked in full is Present, never Absent (edge cases 9-11)", () => {
    const day = gradeMonth().find((d) => d.date === "2026-09-08")!;
    expect(day.code).toBe("P");
    expect(day.dayValue).toBe(1);
  });

  it("contributes its ACTUAL hours — the approval itself is worth nothing", () => {
    // Edge case 12: approved remote work + real hours. The hours come from the
    // punch; an approval with no punch would be an ordinary un-worked day, and
    // the numbers below are the same either way because nothing in this chain
    // reads the approval at all.
    const worked = payrollFor(
      gradeMonth({ workedMinutes: (d) => (d === "2026-09-08" ? 7 * 60 : 9 * 60) }),
    );
    expect(worked.workedHours).toBe(office.workedHours - 2);
    expect(worked.requiredHours).toBe(office.requiredHours);
  });

  it("creates no absence and no artificial deduction", () => {
    expect(office.salaryLost).toBe(0);
    expect(office.recon.monthlyHourBalanceMinutes).toBe(0);
  });

  it("the remote mode never enters the payroll formula", () => {
    // Structural guard: `computeScheduleHourlySalary`'s input has no notion of
    // work mode, so an approved remote day cannot be priced differently from an
    // office day even by accident.
    const input = {
      monthlySalary: 54_000,
      monthlyTargetHours: 234,
      payableHoursRaw: 234,
      dailyTargetHours: 9,
      chargeableHalfDays: 0,
      ptExempt: true,
      tdsMonthly: 0,
      advances: 0,
      pendingBalanceIn: 0,
    };
    expect(computeScheduleHourlySalary(input).gross).toBe(
      computeScheduleHourlySalary({ ...input }).gross,
    );
  });
});

/* ────────────────────────────────────────────────────────────────────────────
   §5 — ONE target calculation, never a hardcoded one
   ──────────────────────────────────────────────────────────────────────────── */

describe("the target comes from the employee's own schedule (§5)", () => {
  it("a full-timer's week is the configured span × 6, not a literal 54", () => {
    expect(CFG.dailyTargetMinutes).toBe(9 * 60);
    expect(CFG.weeklyTargetMinutes).toBe(54 * 60);
    // Move the admin-set finish and the target MOVES with it.
    const shorter = resolveEffectiveConfig({
      ...FULL_TIME,
      attOfficialEnd: "18:00:00",
    });
    expect(shorter.dailyTargetMinutes).toBe(8 * 60);
    expect(shorter.weeklyTargetMinutes).toBe(48 * 60);
  });

  it("a HYBRID employee keeps their admin-set 27h — never a 30h assumption", () => {
    const hybrid = resolveEffectiveConfig(HYBRID_27H);
    expect(hybrid.weeklyTargetMinutes).toBe(27 * 60);
    expect(hybrid.weeklyTargetMinutes).not.toBe(30 * 60);
    expect(hybrid.weeklyTargetMinutes).not.toBe(54 * 60);
    // And the DAY is derived from the week, not from the 10:00-20:00 window.
    expect(hybrid.dailyTargetMinutes).toBe((27 * 60) / 6);
  });

  it("changing the admin schedule changes attendance AND salary together", () => {
    const hybrid = resolveEffectiveConfig(HYBRID_27H);
    const raised = resolveEffectiveConfig({
      ...HYBRID_27H,
      weeklyTargetMinutes: 36 * 60,
    });
    expect(raised.weeklyTargetMinutes).toBeGreaterThan(hybrid.weeklyTargetMinutes);
    // The waiver bar follows the target, so nobody is ever measured against a
    // week they were not asked to work.
    expect(raised.waiverThresholdMinutes).toBe(raised.weeklyTargetMinutes);
  });

  it("a custom-schedule employee's holiday reduces THEIR day, not 9h (§2)", () => {
    const hybrid = resolveEffectiveConfig(HYBRID_27H);
    const days = gradeMonth({ holidays: ["2026-09-14"] });
    const recon = reconcileMonth(days, {
      month: MONTH,
      weeklyTargetMinutes: hybrid.weeklyTargetMinutes,
      waiverThresholdMinutes: hybrid.waiverThresholdMinutes,
      workingDaysPerWeek: hybrid.workingDaysPerWeek,
    });
    const week = recon.weeks.find((w) => w.weekKey === "2026-09-14")!;
    // 5 expected days out of 6 against a 27h week = 22.5h, not 45h.
    expect(week.expectedDays).toBe(5);
    expect(week.weeklyTargetMinutes).toBe(Math.round((27 * 60 * 5) / 6));
  });
});

/* ────────────────────────────────────────────────────────────────────────────
   §6 / §7 — worked vs target stay separate, and both screens read one source
   ──────────────────────────────────────────────────────────────────────────── */

describe("worked hours and target hours never bleed into each other (§6)", () => {
  it("no holiday, leave or approval ever adds to hours worked", () => {
    const everything = gradeMonth({
      holidays: SEPT_HOLIDAYS,
      leave: { "2026-09-08": "paid", "2026-09-09": "unpaid" },
    });
    for (const d of everything) {
      if (!isOrdinaryAttendanceDay(d.code)) expect(d.workedMinutes).toBe(0);
    }
  });

  it("Target − Worked = Balance, from the one reconciliation both screens read", () => {
    // §7: Attendance shows Target X / Worked Y / Balance Z, and My Salary must
    // use the same X/Y/Z rather than deriving its own.
    const p = payrollFor(
      gradeMonth({
        holidays: SEPT_HOLIDAYS,
        leave: { "2026-09-08": "paid" },
        workedMinutes: (d) => (d === "2026-09-09" ? 7 * 60 : 9 * 60),
      }),
    );
    const target = p.recon.totalTargetMinutes;
    const worked = p.recon.totalActualMinutes;
    expect(p.recon.monthlyHourBalanceMinutes).toBe(worked - target);
    // The KPI's required hours and the reconciler's target agree, now that both
    // read `expectsScheduledHours`.
    expect(p.requiredHours).toBe(target / 60);
  });

  it("a surplus never becomes pay for a full-timer, only credit (§8)", () => {
    const long = payrollFor(gradeMonth({ workedMinutes: () => 10 * 60 }));
    expect(long.recon.monthlyHourBalanceMinutes).toBeGreaterThan(0);
    // No overtime hours passed for a monthly-CTC employee → base is capped.
    expect(long.breakdown.gross).toBeCloseTo(54_000, 2);
  });

  it("monthly payable hours are ROUNDED DOWN, per the existing rule (§8)", () => {
    const b = computeScheduleHourlySalary({
      monthlySalary: 54_000,
      monthlyTargetHours: 234,
      payableHoursRaw: 53.9,
      dailyTargetHours: 9,
      chargeableHalfDays: 0,
      ptExempt: true,
      tdsMonthly: 0,
      advances: 0,
      pendingBalanceIn: 0,
    });
    expect(b.workedHours).toBe(53);
  });
});

describe("the existing salary rules are preserved (§8)", () => {
  it("unpaid leave is charged ON TOP of the half-day rule, not instead of it", () => {
    const withBoth = computeScheduleHourlySalary({
      monthlySalary: 54_000,
      monthlyTargetHours: 225,
      payableHoursRaw: 225,
      dailyTargetHours: 9,
      chargeableHalfDays: 2,
      unpaidLeaveDays: 1,
      ptExempt: true,
      tdsMonthly: 0,
      advances: 0,
      pendingBalanceIn: 0,
    });
    const rate = 54_000 / 225;
    // 2 half-days (9h) + 1 unpaid day (9h) = 18h off the 225 payable.
    expect(withBoth.workedHours).toBe(225 - 18);
    expect(withBoth.gross).toBeCloseTo(rate * (225 - 18), 2);
  });

  it("omitting unpaidLeaveDays computes exactly the pay it computed before", () => {
    const base = {
      monthlySalary: 54_000,
      monthlyTargetHours: 234,
      payableHoursRaw: 200,
      dailyTargetHours: 9,
      chargeableHalfDays: 1,
      ptExempt: true,
      tdsMonthly: 0,
      advances: 0,
      pendingBalanceIn: 0,
    };
    expect(computeScheduleHourlySalary(base).gross).toBe(
      computeScheduleHourlySalary({ ...base, unpaidLeaveDays: 0 }).gross,
    );
  });

  it("a negative or absurd unpaid count can never invert the sign", () => {
    const b = computeScheduleHourlySalary({
      monthlySalary: 54_000,
      monthlyTargetHours: 234,
      payableHoursRaw: 234,
      dailyTargetHours: 9,
      chargeableHalfDays: 0,
      unpaidLeaveDays: -5,
      ptExempt: true,
      tdsMonthly: 0,
      advances: 0,
      pendingBalanceIn: 0,
    });
    expect(b.gross).toBeCloseTo(54_000, 2);

    const wiped = computeScheduleHourlySalary({
      monthlySalary: 54_000,
      monthlyTargetHours: 234,
      payableHoursRaw: 234,
      dailyTargetHours: 9,
      chargeableHalfDays: 0,
      unpaidLeaveDays: 99,
      ptExempt: true,
      tdsMonthly: 0,
      advances: 0,
      pendingBalanceIn: 0,
    });
    expect(wiped.gross).toBe(0);
  });
});
