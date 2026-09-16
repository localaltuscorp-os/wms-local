import { describe, it, expect } from "vitest";
import {
  resolveEffectiveConfig,
  saturdayOrdinal,
  isWorkingDay,
  scheduleForDay,
  isAttendanceGraded,
  attendanceScheduleForWeekday,
  toAttendanceSchedule,
  FULL_TIME_DAILY_MINUTES,
  WORKING_DAYS_PER_WEEK,
} from "@/lib/attendance/effective-config";
import { payableDaysByHours } from "@/lib/attendance/hours-rule";

/**
 * EMPLOYEE SCHEDULE SETTINGS (0228).
 *
 * The brief's five settings, and the one rule that governs all of them: employee
 * timings define WHEN the scheduled period is, and never how long the
 * contractual week is. 54 h stays 54 h.
 */

const FULL_WEEK = FULL_TIME_DAILY_MINUTES * WORKING_DAYS_PER_WEEK; // 3240 = 54h

describe("the 54-hour week is not a function of the schedule", () => {
  it("is 54h for a standard 10:00-19:00 full-timer", () => {
    const cfg = resolveEffectiveConfig({
      workerType: "full_time",
      attOfficialStart: "10:00",
      attOfficialEnd: "19:00",
    });
    expect(cfg.weeklyTargetMinutes).toBe(FULL_WEEK);
  });

  it("STAYS 54h when the timings are lengthened — the Parvez Khan case", () => {
    // Live data at the time this was written: Parvez is scheduled 07:30–19:30.
    // The old resolver did `dailyTarget × 6`, turning that 12-hour span into a
    // 72-HOUR weekly requirement — and that number is the threshold the salary
    // deduction is computed against. Nobody set "72" anywhere; it fell out of
    // the schedule.
    const cfg = resolveEffectiveConfig({
      workerType: "full_time",
      attOfficialStart: "07:30",
      attOfficialEnd: "19:30",
    });
    expect(cfg.weeklyTargetMinutes).toBe(FULL_WEEK);
    expect(cfg.waiverThresholdMinutes).toBe(FULL_WEEK);
  });

  it("stays 54h for Jeevan's 10:30-20:30, the brief's own example", () => {
    const cfg = resolveEffectiveConfig({
      workerType: "full_time",
      attOfficialStart: "10:30",
      attOfficialEnd: "20:30",
      satOfficialStart: "10:30",
      satOfficialEnd: "16:00",
    });
    expect(cfg.weeklyTargetMinutes).toBe(FULL_WEEK);
    expect(cfg.saturdayStart).toBe("10:30");
    expect(cfg.saturdayEnd).toBe("16:00");
  });

  it("keeps the CONTRACTUAL 9h day too, so longer timings never cut attendance", () => {
    // `dailyTargetMinutes` is the hours-rule divisor ("9h = 1 day"), the credit
    // a paid leave is worth, and the base of the full/half-day cutoffs. Left
    // schedule-driven, Parvez's 12h timings made a complete 54h week earn
    // 54 ÷ 12 = 4.5 days — timings overriding the 54-hour rule, which the brief
    // forbids. Timings now move punctuality and nothing else.
    const long = resolveEffectiveConfig({
      workerType: "full_time",
      attOfficialStart: "07:30",
      attOfficialEnd: "19:30",
    });
    const normal = resolveEffectiveConfig({
      workerType: "full_time",
      attOfficialStart: "10:00",
      attOfficialEnd: "19:00",
    });
    expect(long.dailyTargetMinutes).toBe(FULL_TIME_DAILY_MINUTES);
    expect(long.fullDayMinutes).toBe(normal.fullDayMinutes);
    expect(long.halfDayMinutes).toBe(normal.halfDayMinutes);
    // …while punctuality still follows the timings.
    expect(long.lateAfter).toBe("08:20");
    expect(long.earlyBefore).toBe("19:30");
  });

  it("does not disturb the hourly shifts, which are week-first", () => {
    const cfg = resolveEffectiveConfig({
      workerType: "hybrid",
      attOfficialStart: "03:00",
      attOfficialEnd: "20:00",
      weeklyTargetMinutes: 1800,
    });
    expect(cfg.weeklyTargetMinutes).toBe(1800);
  });
});

describe("saturdayOrdinal", () => {
  it("is 0 for every day that is not a Saturday", () => {
    for (let dow = 0; dow <= 5; dow++) expect(saturdayOrdinal(dow, 14)).toBe(0);
  });

  it("counts Saturdays by date within the calendar month", () => {
    expect(saturdayOrdinal(6, 1)).toBe(1);
    expect(saturdayOrdinal(6, 7)).toBe(1);
    expect(saturdayOrdinal(6, 8)).toBe(2);
    expect(saturdayOrdinal(6, 14)).toBe(2);
    expect(saturdayOrdinal(6, 15)).toBe(3);
    expect(saturdayOrdinal(6, 22)).toBe(4);
    expect(saturdayOrdinal(6, 29)).toBe(5);
    expect(saturdayOrdinal(6, 31)).toBe(5);
  });
});

describe("which Saturdays are working days", () => {
  const alternate = resolveEffectiveConfig({
    workerType: "full_time",
    weeklyOff: 0, // Sunday
    sat1Working: true,
    sat2Working: false,
    sat3Working: true,
    sat4Working: false,
    sat5Working: false,
  });

  it("honours each flag independently", () => {
    expect(isWorkingDay(alternate, 6, 3)).toBe(true);   // 1st Saturday
    expect(isWorkingDay(alternate, 6, 10)).toBe(false); // 2nd
    expect(isWorkingDay(alternate, 6, 17)).toBe(true);  // 3rd
    expect(isWorkingDay(alternate, 6, 24)).toBe(false); // 4th
    expect(isWorkingDay(alternate, 6, 31)).toBe(false); // 5th
  });

  it("leaves weekdays alone", () => {
    for (let dow = 1; dow <= 5; dow++) expect(isWorkingDay(alternate, dow, 10)).toBe(true);
  });

  it("still treats the weekly off as non-working", () => {
    expect(isWorkingDay(alternate, 0, 10)).toBe(false);
  });

  it("defaults every Saturday to working, so the columns changed nobody", () => {
    const before = resolveEffectiveConfig({ workerType: "full_time" });
    for (const d of [3, 10, 17, 24, 31]) expect(isWorkingDay(before, 6, d)).toBe(true);
  });
});

describe("Saturday timings", () => {
  it("follow Mon-Fri when unset", () => {
    const cfg = resolveEffectiveConfig({
      workerType: "full_time",
      attOfficialStart: "10:00",
      attOfficialEnd: "19:00",
    });
    expect(cfg.saturdayStart).toBe("10:00");
    expect(cfg.saturdayEnd).toBe("19:00");
  });

  it("override only Saturday, leaving the weekday schedule intact", () => {
    const cfg = resolveEffectiveConfig({
      workerType: "full_time",
      attOfficialStart: "10:30",
      attOfficialEnd: "20:30",
      satOfficialStart: "10:30",
      satOfficialEnd: "16:00",
    });
    expect(scheduleForDay(cfg, 3)).toEqual({ start: "10:30", end: "20:30" });
    expect(scheduleForDay(cfg, 6)).toEqual({ start: "10:30", end: "16:00" });
  });

  it("falls back rather than propagate an inverted Saturday span", () => {
    // The database CHECK refuses this, so it can only arrive from a row written
    // before 0228 — but a negative span would flow into every consumer, so it
    // is defended here too.
    const cfg = resolveEffectiveConfig({
      workerType: "full_time",
      attOfficialStart: "10:00",
      attOfficialEnd: "19:00",
      satOfficialStart: "16:00",
      satOfficialEnd: "10:00",
    });
    expect(cfg.saturdayEnd).toBe("19:00");
  });
});

describe("is attendance applicable", () => {
  it("defaults to yes, which is what every existing employee gets", () => {
    const cfg = resolveEffectiveConfig({ workerType: "full_time" });
    expect(cfg.attendanceApplicable).toBe(true);
    expect(isAttendanceGraded(cfg)).toBe(true);
  });

  it("makes no day a working day when set to no — the Manan Vasa case", () => {
    const cfg = resolveEffectiveConfig({
      workerType: "full_time",
      attendanceApplicable: false,
    });
    expect(isAttendanceGraded(cfg)).toBe(false);
    for (let dow = 0; dow <= 6; dow++) expect(isWorkingDay(cfg, dow, 10)).toBe(false);
  });

  it("does NOT change the weekly target — exemption is not a smaller week", () => {
    // The target is left alone deliberately. "Not required to punch" means the
    // grader never reaches an absence for them; it does not mean their
    // contractual week shrank, and a consumer that ignored
    // `attendanceApplicable` and read the target would otherwise silently see a
    // different number for them.
    const cfg = resolveEffectiveConfig({
      workerType: "full_time",
      attendanceApplicable: false,
    });
    expect(cfg.weeklyTargetMinutes).toBe(FULL_WEEK);
  });
});

describe("Saturday's own clock", () => {
  // Jeevan, the brief's own example: Mon–Fri 10:30–20:30, Saturday 10:30–16:00.
  const jeevan = resolveEffectiveConfig({
    workerType: "full_time",
    attOfficialStart: "10:30",
    attOfficialEnd: "20:30",
    satOfficialStart: "10:30",
    satOfficialEnd: "16:00",
  });

  it("leaves every other weekday on the ordinary schedule", () => {
    for (let dow = 0; dow <= 5; dow++) {
      expect(attendanceScheduleForWeekday(jeevan, dow)).toEqual(toAttendanceSchedule(jeevan));
    }
  });

  it("does not grade leaving at 16:00 on a Saturday as an early exit", () => {
    const sat = attendanceScheduleForWeekday(jeevan, 6);
    expect(sat.earlyBefore).toBe("16:00");
    // Saturday starts when the weekdays do, so punctuality is unchanged.
    expect(sat.lateAfter).toBe(toAttendanceSchedule(jeevan).lateAfter);
  });

  it("scales Saturday's cutoffs to its 5.5h span, never above the weekday ones", () => {
    // Held to the weekday 7.5h Full Day, every complete Saturday would be coded
    // a half day. Pay is unaffected either way — it pools the week's hours.
    const sat = attendanceScheduleForWeekday(jeevan, 6);
    const weekday = toAttendanceSchedule(jeevan);
    expect(sat.fullDayMinutes).toBe(Math.round(330 * (7.5 / 9))); // 275 = 4h35m
    expect(sat.halfDayMinutes).toBe(Math.round(330 * (4.5 / 9))); // 165 = 2h45m
    expect(sat.fullDayMinutes).toBeLessThan(weekday.fullDayMinutes);
  });

  it("moves Saturday's late-after when Saturday starts at a different time", () => {
    const later = resolveEffectiveConfig({
      workerType: "full_time",
      attOfficialStart: "10:00",
      attOfficialEnd: "19:00",
      satOfficialStart: "11:00",
    });
    expect(attendanceScheduleForWeekday(later, 6).lateAfter).toBe("11:50");
  });

  it("is IDENTICAL to the weekday schedule when Saturday has no override", () => {
    // The no-regression case: 27 of 29 employees on the day this shipped.
    const plain = resolveEffectiveConfig({
      workerType: "full_time",
      attOfficialStart: "10:00",
      attOfficialEnd: "19:00",
    });
    expect(plain.saturdayOverridden).toBe(false);
    expect(attendanceScheduleForWeekday(plain, 6)).toEqual(toAttendanceSchedule(plain));
  });
});

describe("the hours rule still pays a 54h week in full", () => {
  it("earns 6 days for 54h, whatever the timings", () => {
    // Under the old schedule-driven day, Parvez's 12h timings made this week
    // 54 ÷ 12 = 4.5 days. The day is contractual now, so it earns all six.
    const cfg = resolveEffectiveConfig({
      workerType: "full_time",
      attOfficialStart: "07:30",
      attOfficialEnd: "19:30",
    });
    const week = Array.from({ length: 6 }, () => ({
      weekKey: "2026-09-07",
      code: "P",
      dayValue: 1,
      workedMinutes: FULL_TIME_DAILY_MINUTES,
    }));
    expect(payableDaysByHours(week, cfg.dailyTargetMinutes)).toBe(6);
  });
});
