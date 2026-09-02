import { describe, it, expect } from "vitest";
import {
  ACK_COUNTDOWN_SECONDS,
  computeWeekLoss,
  daysLabel,
  hoursLabel,
  mondayOfYmd,
  reportedWeekFor,
  rupees,
  weekLabel,
  type WeekLossDay,
  type WeekLossPay,
} from "@/lib/attendance/week-loss";

const H = 60; // one hour in minutes
const MON = "2026-08-10";
const SUN = "2026-08-16";

/** A full-time person on ₹6,00,000 a year in a 31-day month → ₹1,612.90 a day. */
const CTC: WeekLossPay = {
  basis: "monthly_ctc",
  perDay: 600_000 / 12 / 31,
  hourlyRate: 0,
  weeklyTargetMinutes: 0,
};
const UNPRICED: WeekLossPay = { basis: "monthly_ctc", perDay: 0, hourlyRate: 0, weeklyTargetMinutes: 0 };
const FIXED: WeekLossPay = { basis: "fixed_fee", perDay: 0, hourlyRate: 0, weeklyTargetMinutes: 0 };
const HOURLY: WeekLossPay = {
  basis: "hourly",
  perDay: 0,
  hourlyRate: 130,
  weeklyTargetMinutes: 27 * H,
};

function day(logDate: string, code: string, workedMinutes: number, extra: Partial<WeekLossDay> = {}): WeekLossDay {
  const credited: Record<string, number> = {
    "W/O": 1, H: 1, PL: 1, CO: 1, LWP: 0, HP: 2, "H-H/D": 1.5,
  };
  return {
    logDate,
    code,
    dayValue: credited[code] ?? (code === "A" ? 0 : 1),
    workedMinutes,
    late: false,
    leftEarly: false,
    ...extra,
  };
}

/** A textbook Mon-Sat 9h week + Sunday off. */
function perfectWeek(): WeekLossDay[] {
  return [
    day("2026-08-10", "P", 9 * H),
    day("2026-08-11", "P", 9 * H),
    day("2026-08-12", "P", 9 * H),
    day("2026-08-13", "P", 9 * H),
    day("2026-08-14", "P", 9 * H),
    day("2026-08-15", "P", 9 * H),
    day("2026-08-16", "W/O", 0),
  ];
}

describe("a clean week", () => {
  it("loses nothing and is marked clean", () => {
    const r = computeWeekLoss(MON, SUN, perfectWeek(), CTC);
    expect(r.expectedDays).toBe(6);
    expect(r.earnedDays).toBe(6);
    expect(r.daysLost).toBe(0);
    expect(r.moneyLost).toBe(0);
    expect(r.clean).toBe(true);
    expect(r.shortMinutes).toBe(0);
  });

  it("stays clean when someone was late but still worked the full 54 hours", () => {
    // Late twice, made the hours up — the hours rule pools the WEEK, so nothing
    // was lost and nothing may be charged.
    const days = perfectWeek();
    days[0] = day("2026-08-10", "P", 8 * H, { late: true });
    days[1] = day("2026-08-11", "P", 10 * H, { late: true });
    const r = computeWeekLoss(MON, SUN, days, CTC);
    expect(r.lateCount).toBe(2);
    expect(r.daysLost).toBe(0);
    expect(r.moneyLost).toBe(0);
    expect(r.clean).toBe(true);
  });
});

describe("hours shortfall", () => {
  it("prices 45 worked hours out of 54 as one day lost", () => {
    // Sir's own example: 45h earns 5 days of a 6-day week.
    const days = perfectWeek();
    days[5] = day("2026-08-15", "P", 0);
    const r = computeWeekLoss(MON, SUN, days, CTC);
    expect(r.workedMinutes).toBe(45 * H);
    expect(r.earnedDays).toBe(5);
    expect(r.daysLost).toBe(1);
    expect(r.shortMinutes).toBe(9 * H);
    expect(r.moneyLost).toBeCloseTo(1612.9, 1);
    expect(r.clean).toBe(false);
  });

  it("keeps half-day granularity", () => {
    const days = perfectWeek();
    days[5] = day("2026-08-15", "P", 4.5 * H);
    const r = computeWeekLoss(MON, SUN, days, CTC);
    expect(r.earnedDays).toBe(5.5);
    expect(r.daysLost).toBe(0.5);
  });

  it("never lets overtime earn back more than the days expected", () => {
    const days = perfectWeek().map((d) =>
      d.code === "P" ? { ...d, workedMinutes: 12 * H } : d,
    );
    const r = computeWeekLoss(MON, SUN, days, CTC);
    expect(r.earnedDays).toBe(6); // capped at the 6 days expected
    expect(r.daysLost).toBe(0);
  });
});

describe("absence and leave", () => {
  it("charges an absent day in full", () => {
    const days = perfectWeek();
    days[2] = day("2026-08-12", "A", 0);
    const r = computeWeekLoss(MON, SUN, days, CTC);
    expect(r.absentDays).toBe(1);
    expect(r.daysLost).toBe(1);
  });

  it("charges leave-without-pay, and names it separately from the hours gap", () => {
    const days = perfectWeek();
    days[2] = day("2026-08-12", "LWP", 0);
    const r = computeWeekLoss(MON, SUN, days, CTC);
    expect(r.unpaidLeaveDays).toBe(1);
    // Only 5 ordinary days were expected that week, and all 5 were worked.
    expect(r.expectedDays).toBe(5);
    expect(r.hoursShortfallDays).toBe(0);
    expect(r.daysLost).toBe(1);
  });

  it("costs nothing for paid leave, comp-off, a holiday or a weekly off", () => {
    for (const code of ["PL", "CO", "H", "W/O"]) {
      const days = perfectWeek();
      days[2] = day("2026-08-12", code, 0);
      const r = computeWeekLoss(MON, SUN, days, CTC);
      expect(`${code}:${r.daysLost}`).toBe(`${code}:0`);
    }
  });

  it("treats a holiday-working premium as a bonus, never a negative loss", () => {
    const days = perfectWeek();
    days[6] = day("2026-08-16", "HP", 9 * H);
    const r = computeWeekLoss(MON, SUN, days, CTC);
    expect(r.unpaidLeaveDays).toBe(0);
    expect(r.daysLost).toBe(0);
  });
});

describe("pricing by pay basis", () => {
  it("never charges a fixed-fee worker, and says their pay is unaffected", () => {
    const days = perfectWeek().map((d) => ({ ...d, workedMinutes: 0 }));
    const r = computeWeekLoss(MON, SUN, days, FIXED);
    expect(r.daysLost).toBe(6);
    expect(r.moneyLost).toBe(0);
    expect(r.payUnaffected).toBe(true);
  });

  it("prices a part-timer on hours against the weekly target, capped at one week", () => {
    const days = [
      day("2026-08-10", "P", 3 * H),
      day("2026-08-11", "P", 3 * H),
      day("2026-08-12", "P", 3 * H),
    ];
    const r = computeWeekLoss(MON, SUN, days, HOURLY);
    // 3 days expected = 27h target by the hours rule; 9h worked ⇒ 18h short.
    expect(r.shortMinutes).toBe(18 * H);
    expect(r.moneyLost).toBe(18 * 130);
  });

  it("caps the hourly charge at one full week of pay", () => {
    const days = Array.from({ length: 6 }, (_, i) =>
      day(`2026-08-1${i}`.slice(0, 10), "P", 0),
    );
    const r = computeWeekLoss(MON, SUN, days, HOURLY);
    // 6 expected days ⇒ 54h short, but a 27h-a-week person cannot lose 54h of pay.
    expect(r.moneyLost).toBe(27 * 130);
  });

  it("reports 'not priced' rather than a confident zero when no rate is on file", () => {
    const days = perfectWeek();
    days[5] = day("2026-08-15", "P", 0);
    const r = computeWeekLoss(MON, SUN, days, UNPRICED);
    expect(r.daysLost).toBe(1);
    expect(r.moneyLost).toBe(0);
    expect(r.priced).toBe(false);
  });
});

describe("which week gets reported", () => {
  it("is always the Mon-Sun that ended before the current week", () => {
    const expected = { weekStart: "2026-08-10", weekEnd: "2026-08-16" };
    // Every day of the week 17–23 Aug reports the same prior week, which is what
    // lets someone who missed Monday still see it on Tuesday or Friday.
    for (const d of ["2026-08-17", "2026-08-18", "2026-08-21", "2026-08-23"]) {
      expect(reportedWeekFor(d)).toEqual(expected);
    }
  });

  it("rolls over on the next Monday, not mid-week", () => {
    expect(reportedWeekFor("2026-08-24")).toEqual({
      weekStart: "2026-08-17",
      weekEnd: "2026-08-23",
    });
  });

  it("anchors weeks on Monday, with Sunday closing the week it started in", () => {
    expect(mondayOfYmd("2026-08-16")).toBe("2026-08-10"); // a Sunday
    expect(mondayOfYmd("2026-08-10")).toBe("2026-08-10"); // the Monday itself
  });
});

describe("labels", () => {
  it("reads naturally", () => {
    expect(daysLabel(1)).toBe("1 day");
    expect(daysLabel(0.5)).toBe("half a day");
    expect(daysLabel(1.5)).toBe("1.5 days");
    expect(hoursLabel(260)).toBe("4h 20m");
    expect(hoursLabel(120)).toBe("2h");
    expect(hoursLabel(45)).toBe("45m");
    expect(weekLabel("2026-08-10", "2026-08-16")).toBe("10 Aug – 16 Aug 2026");
  });

  it("formats rupees in Indian grouping, whole", () => {
    expect(rupees(3240.4)).toBe("₹3,240");
    expect(rupees(141020)).toBe("₹1,41,020");
  });

  it("keeps the skip delay short enough to be read, long enough to be felt", () => {
    expect(ACK_COUNTDOWN_SECONDS).toBeGreaterThanOrEqual(3);
    expect(ACK_COUNTDOWN_SECONDS).toBeLessThanOrEqual(10);
  });
});
