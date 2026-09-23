import { describe, it, expect } from "vitest";
import {
  MCC_FREQUENCIES,
  MCC_FREQUENCY_LABEL,
  deadlineDayText,
  dueMonths,
  mccColumns,
  mccDeadlinesIn,
  mccDetail,
  mccScheduleOf,
  normalizeMccSchedule,
  type MccSchedule,
} from "@/lib/compliance/mcc-frequency";
import { matchFills, mccOccurrences, periodFor, scheduleDetail, scheduleText, type ComplianceItem } from "@/lib/compliance/schedule";

/**
 * MCC frequencies (account holder, 2026-09-19): Monthly, 2 times/month, 3 times/
 * month, Alternate Month, Quarterly, Half Yearly, Annually.
 */

const s = (over: Partial<MccSchedule>): MccSchedule => ({ frequency: "monthly", days: [5], startMonth: null, ...over });
const deadlines = (x: MccSchedule, mk: string) => mccDeadlinesIn(x, mk).map((d) => d.deadline);

describe("the seven frequencies, in the checklist's own words", () => {
  it("are labelled exactly as the Frequency column writes them", () => {
    expect(MCC_FREQUENCIES.map((f) => MCC_FREQUENCY_LABEL[f])).toEqual([
      "Monthly",
      "2 times/month",
      "3 times/month",
      "Alternate Month",
      "Quarterly",
      "Half Yearly",
      "Annually",
    ]);
  });
});

describe("deadlines in a month", () => {
  it("Monthly: one, by its day, the whole month its period", () => {
    expect(mccDeadlinesIn(s({ days: [7] }), "2026-09")).toEqual([
      { deadline: "2026-09-07", periodStart: "2026-09-01", periodEnd: "2026-09-30", openUntil: "2026-09-30" },
    ]);
  });

  it("2 times/month: two rows, the month split at the first deadline", () => {
    expect(mccDeadlinesIn(s({ frequency: "twice_monthly", days: [15, 31] }), "2026-09")).toEqual([
      { deadline: "2026-09-15", periodStart: "2026-09-01", periodEnd: "2026-09-15", openUntil: "2026-09-29" },
      { deadline: "2026-09-30", periodStart: "2026-09-16", periodEnd: "2026-09-30", openUntil: "2026-09-30" },
    ]);
  });

  it("3 times/month: three rows, the last running to month-end even when due earlier", () => {
    expect(mccDeadlinesIn(s({ frequency: "thrice_monthly", days: [10, 20, 25] }), "2026-09")).toEqual([
      { deadline: "2026-09-10", periodStart: "2026-09-01", periodEnd: "2026-09-10", openUntil: "2026-09-19" },
      { deadline: "2026-09-20", periodStart: "2026-09-11", periodEnd: "2026-09-20", openUntil: "2026-09-24" },
      { deadline: "2026-09-25", periodStart: "2026-09-21", periodEnd: "2026-09-30", openUntil: "2026-09-30" },
    ]);
  });

  it("clamps to a short month's end, and never makes two rows of one day", () => {
    expect(deadlines(s({ days: [31] }), "2026-02")).toEqual(["2026-02-28"]);
    expect(deadlines(s({ days: [30] }), "2028-02")).toEqual(["2028-02-29"]);
    expect(deadlines(s({ frequency: "twice_monthly", days: [30, 31] }), "2026-02")).toEqual(["2026-02-28"]);
  });

  it("Alternate Month / Quarterly / Half Yearly / Annually: only in their months, the cycle their period", () => {
    const q = s({ frequency: "quarterly", days: [15], startMonth: 6 });
    expect(dueMonths(q)).toEqual([6, 9, 12, 3]);
    expect(mccDeadlinesIn(q, "2026-06")).toEqual([
      { deadline: "2026-06-15", periodStart: "2026-04-01", periodEnd: "2026-06-30", openUntil: "2026-06-30" },
    ]);
    expect(deadlines(q, "2026-07")).toEqual([]);
    expect(deadlines(q, "2027-03")).toEqual(["2027-03-15"]);

    expect(dueMonths(s({ frequency: "alternate_month", startMonth: 2 }))).toEqual([2, 4, 6, 8, 10, 12]);
    expect(dueMonths(s({ frequency: "half_yearly", startMonth: 10 }))).toEqual([10, 4]);

    const annual = s({ frequency: "annually", days: [31], startMonth: 3 });
    expect(mccDeadlinesIn(annual, "2027-03")).toEqual([
      { deadline: "2027-03-31", periodStart: "2026-04-01", periodEnd: "2027-03-31", openUntil: "2027-03-31" },
    ]);
    expect(deadlines(annual, "2027-04")).toEqual([]);
  });
});

describe("in words", () => {
  it("says when, under the frequency", () => {
    expect(mccDetail(s({ days: [5] }))).toBe("by the 5th");
    expect(mccDetail(s({ days: [31] }))).toBe("by month-end");
    expect(mccDetail(s({ frequency: "twice_monthly", days: [15, 31] }))).toBe("by the 15th & month-end");
    expect(mccDetail(s({ frequency: "thrice_monthly", days: [10, 20, 31] }))).toBe("by the 10th, 20th & month-end");
    expect(mccDetail(s({ frequency: "quarterly", days: [15], startMonth: 6 }))).toBe("by the 15th · Jun, Sep, Dec, Mar");
    expect(mccDetail(s({ frequency: "half_yearly", days: [31], startMonth: 10 }))).toBe("by month-end · Oct, Apr");
    expect(mccDetail(s({ frequency: "annually", days: [31], startMonth: 3 }))).toBe("by the end of March");
    expect(mccDetail(s({ frequency: "annually", days: [15], startMonth: 6 }))).toBe("by 15 Jun");
  });

  it("gives the day a deadline falls on alone, for MCC's Frequency column", () => {
    expect(deadlineDayText("2026-09-01")).toBe("1st");
    expect(deadlineDayText("2026-09-02")).toBe("2nd");
    expect(deadlineDayText("2026-09-03")).toBe("3rd");
    expect(deadlineDayText("2026-09-11")).toBe("11th");
    expect(deadlineDayText("2026-09-12")).toBe("12th");
    expect(deadlineDayText("2026-09-13")).toBe("13th");
    expect(deadlineDayText("2026-09-21")).toBe("21st");
    expect(deadlineDayText("2026-09-22")).toBe("22nd");
    // Month-end is the month's own last day.
    const end = (mk: string) => deadlineDayText(mccDeadlinesIn(s({ days: [31] }), mk)[0]!.deadline);
    expect(end("2026-09")).toBe("30th");
    expect(end("2026-10")).toBe("31st");
    expect(end("2027-02")).toBe("28th");
  });
});

describe("checking what the pop-up or a sheet asks for", () => {
  it("puts days in order and month-end as 31", () => {
    expect(normalizeMccSchedule({ frequency: "twice_monthly", days: [15, null] })).toEqual({
      ok: true,
      schedule: { frequency: "twice_monthly", days: [15, 31], startMonth: null },
    });
  });

  it("refuses the wrong number of days, days out of order, and a missing month", () => {
    expect(normalizeMccSchedule({ frequency: "twice_monthly", days: [15] })).toEqual({ ok: false, error: "2 times/month needs 2 deadline days." });
    expect(normalizeMccSchedule({ frequency: "thrice_monthly", days: [20, 10, null] }).ok).toBe(false);
    expect(normalizeMccSchedule({ frequency: "twice_monthly", days: [15, 15] }).ok).toBe(false);
    expect(normalizeMccSchedule({ frequency: "quarterly", days: [15] })).toEqual({ ok: false, error: "Pick the month Quarterly is due in." });
    expect(normalizeMccSchedule({ frequency: "fortnightly", days: [15] })).toEqual({ ok: false, error: "Pick a frequency." });
  });

  it("drops a month a monthly frequency does not use", () => {
    expect(normalizeMccSchedule({ frequency: "monthly", days: [5], startMonth: 6 })).toMatchObject({ ok: true, schedule: { startMonth: null } });
  });
});

describe("storing and reading back", () => {
  it("writes the label, month_day and the 0240 columns", () => {
    expect(mccColumns(s({ frequency: "twice_monthly", days: [15, 31] }))).toEqual({
      frequency: "2 times/month",
      monthDay: 15,
      mccFrequency: "twice_monthly",
      mccDays: [15, 31],
      mccStartMonth: null,
    });
    expect(mccColumns(s({ frequency: "quarterly", days: [31], startMonth: 6 }))).toMatchObject({ monthDay: null, mccDays: null, mccStartMonth: 6 });
  });

  it("reads a compliance from before 0240 as Monthly, by month_day or month-end", () => {
    expect(mccScheduleOf({ monthDay: 7 })).toEqual({ frequency: "monthly", days: [7], startMonth: null });
    expect(mccScheduleOf({ monthDay: null })).toEqual({ frequency: "monthly", days: [31], startMonth: null });
  });

  it("round-trips every frequency through its columns", () => {
    for (const f of MCC_FREQUENCIES) {
      const n = normalizeMccSchedule({ frequency: f, days: f === "twice_monthly" ? [15, null] : f === "thrice_monthly" ? [10, 20, null] : [12], startMonth: 7 });
      if (!n.ok) throw new Error(n.error);
      expect(mccScheduleOf(mccColumns(n.schedule))).toEqual(n.schedule);
    }
  });
});

/* ── On the checklist ──────────────────────────────────────────────────── */

const item = (over: Partial<ComplianceItem>): ComplianceItem => ({
  id: "i1",
  ownerEmployeeId: "p1",
  title: "File the return",
  section: null,
  code: null,
  frequency: null,
  weekdays: 0,
  scheduleKind: "monthly",
  monthDay: null,
  isParticipantList: false,
  sortOrder: 1,
  createdById: null,
  activeFrom: null,
  ...over,
});

describe("MCC rows for each frequency", () => {
  it("gives 2 times/month two rows a month, and a quarter view a Quarterly one once", () => {
    const twice = item({ mccFrequency: "twice_monthly", mccDays: [15, 31], monthDay: 15 });
    expect(mccOccurrences([twice], ["2026-09"]).map((o) => o.deadline)).toEqual(["2026-09-15", "2026-09-30"]);
    const quarterly = item({ id: "q", mccFrequency: "quarterly", monthDay: 15, mccStartMonth: 6 });
    expect(mccOccurrences([quarterly], ["2026-07", "2026-08", "2026-09"]).map((o) => o.deadline)).toEqual(["2026-09-15"]);
    expect(mccOccurrences([quarterly], ["2026-07"])).toEqual([]);
  });

  it("counts a fill made early in the quarter against the quarter's deadline", () => {
    const quarterly = item({ mccFrequency: "quarterly", monthDay: 15, mccStartMonth: 6 });
    const occ = mccOccurrences([quarterly], ["2026-09"]);
    const fills = matchFills(occ, [{ itemId: "i1", entryDate: "2026-07-20" }]);
    expect(fills.get(occ[0]!.key)).toEqual({ itemId: "i1", entryDate: "2026-07-20" });
  });

  it("keeps each half of a 2 times/month to its own fill", () => {
    const twice = item({ mccFrequency: "twice_monthly", mccDays: [15, 31], monthDay: 15 });
    const occ = mccOccurrences([twice], ["2026-09"]);
    const fills = matchFills(occ, [{ itemId: "i1", entryDate: "2026-09-15" }]);
    expect(fills.has(occ[0]!.key)).toBe(true);
    expect(fills.has(occ[1]!.key)).toBe(false);
  });

  it("works a deadline's period out on the server, and refuses a date that is not a deadline", () => {
    const twice = { scheduleKind: "monthly", mccFrequency: "twice_monthly", mccDays: [15, 31], monthDay: 15 };
    expect(periodFor(twice, "2026-09-30")).toEqual({ mode: "month", start: "2026-09-16", end: "2026-09-30", openUntil: "2026-09-30" });
    expect(periodFor(twice, "2026-09-20")).toBeNull();
    expect(periodFor({ scheduleKind: "monthly", mccFrequency: "quarterly", monthDay: 15, mccStartMonth: 6 }, "2026-08-15")).toBeNull();
  });

  it("shows the frequency in the Frequency column, and when under it", () => {
    const q = item({ mccFrequency: "quarterly", monthDay: 15, mccStartMonth: 6 });
    expect(scheduleText(q)).toBe("Quarterly");
    expect(scheduleDetail(q)).toBe("by the 15th · Jun, Sep, Dec, Mar");
  });
});
