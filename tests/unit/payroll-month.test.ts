import { describe, it, expect } from "vitest";
import { resolveEffectiveConfig } from "@/lib/attendance/effective-config";
import { reconcileMonth, payableHoursForMonth } from "@/lib/attendance/hour-balance";
import { weekKeyOf } from "@/lib/attendance/hours-rule";
import {
  PAYROLL_HOURS_FROM,
  isHoursPayrollMonth,
  payrollMonthFor,
  type PayrollDayInput,
} from "@/lib/attendance/payroll-month";
import {
  dayCodeStyle,
  dayStatusStyle,
  balanceColor,
  UPCOMING_STYLE,
  NO_RECORD_STYLE,
} from "@/lib/attendance/day-code-view";
import { DAY_STATUS_FILTER_ORDER } from "@/lib/salary/day-ledger";

/**
 * THE EXTRACTED PAYROLL-MONTH SEQUENCE, and the shared colour palette.
 *
 * Both of these are DE-DUPLICATIONS rather than new features, so the tests that
 * matter most are the ones that prove nothing moved:
 *
 *   · `payrollMonthFor` produces exactly what the three hand-written copies of
 *     the sequence produced (`getMonthDashboard`'s payroll block, and
 *     `attendance-summary`'s salary-lost and half-day-grace blocks). The proof
 *     is done the only way it can be: by running the underlying functions
 *     directly, in the same order, and comparing.
 *
 *   · every day status the daily report can render has a colour, and the
 *     calendar's own tile values survived the move out of its `switch`.
 */

const FULL_TIME = {
  workerType: "full_time",
  attOfficialStart: "10:00:00",
  attOfficialEnd: "19:00:00",
  weeklyOff: 0,
};
const CFG = resolveEffectiveConfig(FULL_TIME);
const MONTH = "2026-08";

/** A whole month of ordinary 9h days, Sundays off. */
function month(over: Partial<Record<string, Partial<PayrollDayInput>>> = {}): PayrollDayInput[] {
  return Array.from({ length: 31 }, (_, i) => {
    const logDate = `${MONTH}-${String(i + 1).padStart(2, "0")}`;
    const weekday = new Date(`${logDate}T00:00:00Z`).getUTCDay();
    const isWeeklyOff = weekday === 0;
    const base: PayrollDayInput = {
      logDate,
      code: isWeeklyOff ? "W/O" : "P",
      dayValue: 1,
      workedMinutes: isWeeklyOff ? 0 : 9 * 60,
      late: false,
      leftEarly: false,
      isWeeklyOff,
    };
    return { ...base, ...(over[logDate] ?? {}) };
  });
}

/** The sequence, written out by hand exactly as the three copies used to. */
function byHand(days: PayrollDayInput[], refTodayISO: string) {
  const graded = days
    .filter((d) => d.code !== "–")
    .map((d) => ({
      date: d.logDate,
      weekKey: weekKeyOf(d.logDate),
      code: d.code,
      dayValue: d.dayValue,
      workedMinutes: d.workedMinutes,
      late: d.late,
      leftEarly: d.leftEarly,
    }));
  const recon = reconcileMonth(graded, {
    month: MONTH,
    weeklyTargetMinutes: CFG.weeklyTargetMinutes,
    waiverThresholdMinutes: CFG.waiverThresholdMinutes,
    workingDaysPerWeek: CFG.workingDaysPerWeek,
  });
  const hours = payableHoursForMonth(graded, recon, CFG.dailyTargetMinutes);
  return { graded, recon, hours };
}

/* ── the extraction changed nothing ──────────────────────────────────────── */

describe("payrollMonthFor reproduces the sequence it replaced", () => {
  const cases: [string, PayrollDayInput[]][] = [
    ["a clean month", month()],
    [
      "a month with a holiday, leave and a half day",
      month({
        "2026-08-15": { code: "H", dayValue: 1, workedMinutes: 0 },
        "2026-08-11": { code: "PL", dayValue: 1, workedMinutes: 0 },
        "2026-08-12": { code: "LWP", dayValue: 0, workedMinutes: 0 },
        "2026-08-18": { code: "H/D", dayValue: 0.5, workedMinutes: 5 * 60 },
      }),
    ],
    [
      "a month with a worked holiday",
      month({ "2026-08-15": { code: "HP", dayValue: 2, workedMinutes: 8 * 60 } }),
    ],
    ["an empty month", []],
  ];

  for (const [name, days] of cases) {
    it(`matches the hand-written chain for ${name}`, () => {
      const ref = "2026-08-31";
      const got = payrollMonthFor(days, { month: MONTH, cfg: CFG, refTodayISO: ref });
      const want = byHand(days, ref);
      expect(got.graded).toEqual(want.graded);
      expect(got.recon).toEqual(want.recon);
      expect(got.hours).toEqual(want.hours);
      // And the flattened payroll view carries the same figures.
      expect(got.payroll).toMatchObject({
        ...want.hours,
        dailyTargetMinutes: CFG.dailyTargetMinutes,
        chargeableHalfDays: want.recon.chargeableHalfDays,
        unpaidLeaveDays: want.hours.unpaidLeaveDays,
        monthlyHourBalanceMinutes: want.recon.monthlyHourBalanceMinutes,
      });
    });
  }

  it("drops days before the employee joined, as every copy did", () => {
    const days = month();
    const withJoiner = days.map((d, i) =>
      i < 10 ? { ...d, code: "–", dayValue: 0, workedMinutes: 0 } : d,
    );
    const got = payrollMonthFor(withJoiner, {
      month: MONTH,
      cfg: CFG,
      refTodayISO: "2026-08-31",
    });
    expect(got.graded).toHaveLength(21);
    expect(got.graded[0]!.date).toBe("2026-08-11");
    // A mid-month joiner's target is prorated, not a full month's.
    expect(got.hours.targetMinutes).toBeLessThan(
      payrollMonthFor(days, { month: MONTH, cfg: CFG, refTodayISO: "2026-08-31" }).hours
        .targetMinutes,
    );
  });

  it("accepts either a yyyy-mm or a yyyy-mm-dd for the month", () => {
    const days = month();
    const a = payrollMonthFor(days, { month: MONTH, cfg: CFG, refTodayISO: "2026-08-31" });
    const b = payrollMonthFor(days, {
      month: "2026-08-17",
      cfg: CFG,
      refTodayISO: "2026-08-31",
    });
    expect(b.month).toBe(MONTH);
    expect(b.hours).toEqual(a.hours);
  });

  it("bounds the month to ELAPSED days itself — a caller cannot opt into the future", () => {
    // This used to be the caller's choice, and that was the bug (spec §3): the
    // grader marks every un-punched FUTURE working day "A", so handing the whole
    // month to the reconciler made it demand hours nobody had been asked for
    // yet. Passing the whole month and passing only the elapsed part must now
    // produce the SAME answer, because the function applies the bound.
    const days = month();
    const whole = payrollMonthFor(days, { month: MONTH, cfg: CFG, refTodayISO: "2026-08-12" });
    const elapsed = payrollMonthFor(
      days.filter((d) => d.logDate <= "2026-08-12"),
      { month: MONTH, cfg: CFG, refTodayISO: "2026-08-12" },
    );
    expect(elapsed.recon.totalTargetMinutes).toBe(whole.recon.totalTargetMinutes);
    expect(elapsed.hours).toEqual(whole.hours);
    expect(elapsed.payroll.payableDayValue).toBe(whole.payroll.payableDayValue);
  });

  it("a mid-month view demands less than the finished month, not the same", () => {
    // The other half of the same guarantee: the bound has to actually bite.
    const days = month();
    const midMonth = payrollMonthFor(days, { month: MONTH, cfg: CFG, refTodayISO: "2026-08-12" });
    const finished = payrollMonthFor(days, { month: MONTH, cfg: CFG, refTodayISO: "2026-08-31" });
    expect(midMonth.recon.totalTargetMinutes).toBeLessThan(finished.recon.totalTargetMinutes);
    expect(midMonth.payroll.payableDayValue).toBeLessThan(finished.payroll.payableDayValue);
    expect(midMonth.payroll.elapsedGradedDays).toBe(12);
    expect(finished.payroll.elapsedGradedDays).toBe(31);
  });
});

/* ── requiredElapsedMinutes ──────────────────────────────────────────────── */

describe("requiredElapsedMinutes", () => {
  const req = (days: PayrollDayInput[], ref: string) =>
    payrollMonthFor(days, { month: MONTH, cfg: CFG, refTodayISO: ref }).payroll
      .requiredElapsedMinutes;

  it("counts only days the month has reached", () => {
    const days = month();
    expect(req(days, "2026-08-08")).toBeLessThan(req(days, "2026-08-31"));
  });

  it("excludes weekly offs, holidays and leave — the days that owe no hours", () => {
    const base = req(month(), "2026-08-31");
    const day = CFG.dailyTargetMinutes;
    for (const code of ["H", "PL", "CO", "LWP"]) {
      const withCode = req(
        month({ "2026-08-19": { code, dayValue: 1, workedMinutes: 0 } }),
        "2026-08-31",
      );
      expect(withCode, code).toBe(base - day);
    }
  });

  it("does not RAISE the requirement when somebody works a holiday", () => {
    // The bug the shared `expectsScheduledHours` predicate closed: turning up on
    // a holiday used to add a required day on the Attendance page while the
    // salary target never counted it, so two surfaces reported two numbers.
    const holiday = req(
      month({ "2026-08-15": { code: "H", dayValue: 1, workedMinutes: 0 } }),
      "2026-08-31",
    );
    const worked = req(
      month({ "2026-08-15": { code: "HP", dayValue: 2, workedMinutes: 8 * 60 } }),
      "2026-08-31",
    );
    expect(worked).toBe(holiday);
  });
});

/* ── the cutover constant ────────────────────────────────────────────────── */

describe("the hours-payroll cutover", () => {
  it("is one named boundary, not a string repeated in four files", () => {
    expect(PAYROLL_HOURS_FROM).toBe("2026-08");
    expect(isHoursPayrollMonth("2026-07")).toBe(false);
    expect(isHoursPayrollMonth("2026-08")).toBe(true);
    expect(isHoursPayrollMonth("2026-09")).toBe(true);
    expect(isHoursPayrollMonth("2027-01")).toBe(true);
    expect(isHoursPayrollMonth("2025-12")).toBe(false);
  });
});

/* ── the shared palette ─────────────────────────────────────────────────── */

describe("the attendance colour language", () => {
  it("has a colour for every status the daily report can render", () => {
    for (const s of DAY_STATUS_FILTER_ORDER) {
      const st = dayStatusStyle(s);
      expect(st.label, s).toBeTruthy();
      expect(st.accent, s).toBeTruthy();
      expect(st.rowTint, s).toBeTruthy();
    }
  });

  it("keeps the calendar's tile values byte-identical through the move", () => {
    // These strings were the `switch` inside month-calendar.tsx. If the move
    // changed one, the Attendance page's calendar changed colour.
    expect(dayCodeStyle("P").tile).toBe("color-mix(in srgb, #15803d 12%, #fff)");
    expect(dayCodeStyle("P").tileInk).toBe("#15803d");
    expect(dayCodeStyle("HP").tile).toBe("color-mix(in srgb, #15803d 24%, #fff)");
    expect(dayCodeStyle("H/D").tile).toBe("color-mix(in srgb, #d97706 22%, #fff)");
    expect(dayCodeStyle("H-H/D").tile).toBe(dayCodeStyle("HP").tile);
    expect(dayCodeStyle("A").tile).toBe("color-mix(in srgb, #dc2626 20%, #fff)");
    expect(dayCodeStyle("LWP").tile).toBe(dayCodeStyle("A").tile);
    expect(dayCodeStyle("W/O").tile).toBe("#475569");
    expect(dayCodeStyle("H").tile).toBe("#475569");
    expect(dayCodeStyle("PL").tile).toBe("color-mix(in srgb, #7c3aed 12%, #fff)");
    expect(dayCodeStyle("CO").tile).toBe(dayCodeStyle("PL").tile);
    expect(dayCodeStyle("incomplete").tile).toBe("color-mix(in srgb, #b45309 8%, #fff)");
  });

  it("keeps the calendar's labels too", () => {
    expect(dayCodeStyle("P").label).toBe("Present");
    expect(dayCodeStyle("A").label).toBe("Absent");
    expect(dayCodeStyle("LWP").label).toBe("Leave (unpaid)");
    expect(dayCodeStyle("W/O").label).toBe("Weekly off");
    expect(dayCodeStyle("H").label).toBe("Holiday");
    expect(dayCodeStyle("PL").label).toBe("Paid leave");
    expect(dayCodeStyle("CO").label).toBe("Comp-off");
    expect(dayCodeStyle("HP").label).toBe("Worked a holiday/off");
    expect(dayCodeStyle("incomplete").label).toBe("Incomplete (no check-out)");
  });

  it("tints a table ROW rather than filling it (spec §5)", () => {
    // Mixed with `transparent`, so a row layers over whatever surface it sits on
    // and survives the dark theme — and never above 12%, so no row is saturated.
    for (const code of ["P", "HP", "H/D", "A", "LWP", "W/O", "H", "PL", "CO", "incomplete"]) {
      const tintStr = dayCodeStyle(code).rowTint;
      expect(tintStr, code).toContain("transparent");
      const pct = Number(/(\d+)%/.exec(tintStr)?.[1] ?? "999");
      expect(pct, code).toBeLessThanOrEqual(12);
    }
    // Even the two codes whose TILE is a solid slate fill.
    expect(dayCodeStyle("W/O").tile).not.toContain("transparent");
    expect(dayCodeStyle("W/O").rowTint).toContain("transparent");
  });

  it("gives Overtime the same green as a Full Day — one code, one colour", () => {
    expect(dayStatusStyle("overtime")).toEqual(dayStatusStyle("full_day"));
    expect(dayStatusStyle("full_day")).toEqual(dayCodeStyle("P"));
  });

  it("gives a holiday and a weekly off the same treatment, different labels", () => {
    expect(dayStatusStyle("holiday").accent).toBe(dayStatusStyle("weekly_off").accent);
    expect(dayStatusStyle("holiday").label).not.toBe(dayStatusStyle("weekly_off").label);
  });

  it("keeps unpaid leave in the red family and paid leave in the purple one", () => {
    // The existing language: purple is leave that costs nothing, red is a day
    // the payroll engine charges for.
    // Same colours as an absence, its own label. Colouring it purple would put
    // the day that costs money beside the day that costs none.
    expect(dayStatusStyle("unpaid_leave").accent).toBe(dayCodeStyle("A").accent);
    expect(dayStatusStyle("unpaid_leave").rowTint).toBe(dayCodeStyle("A").rowTint);
    expect(dayStatusStyle("unpaid_leave").label).toBe("Leave (unpaid)");
    expect(dayStatusStyle("paid_leave").accent).toBe(dayStatusStyle("comp_off").accent);
    expect(dayStatusStyle("paid_leave").rowTint).toBe(dayStatusStyle("comp_off").rowTint);
    expect(dayStatusStyle("paid_leave").accent).not.toBe(dayStatusStyle("unpaid_leave").accent);
  });

  it("gives an unreached day and an unknown code no colour at all", () => {
    expect(dayStatusStyle("upcoming")).toBe(UPCOMING_STYLE);
    expect(dayCodeStyle("something-new")).toBe(NO_RECORD_STYLE);
    expect(NO_RECORD_STYLE.rowTint).toBe("transparent");
  });

  it("colours a balance green up, red down, neutral square (spec §6)", () => {
    expect(balanceColor(45)).toBe("#15803d");
    expect(balanceColor(-45)).toBe("var(--color-altus-red)");
    expect(balanceColor(0)).toBe("var(--color-ink-muted)");
  });
});
