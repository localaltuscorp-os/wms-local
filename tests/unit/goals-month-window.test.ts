import { describe, it, expect } from "vitest";
import {
  fyStartYearOfMonthKey,
  groupQuarterKeysByFy,
  monthKey,
  monthsOfQuarterKey,
  quarterKey,
  quarterKeyOfMonthKey,
  shiftQuarterKey,
} from "@/lib/goals/types";
import { MONTH_WINDOW_QUARTERS, monthWindowQuarters } from "@/components/goals/board/month-window-nav";

/**
 * The Monthly board's month navigator shows SIX MONTHS — the live quarter and
 * the next — with every month sitting under its quarter and every quarter under
 * its financial year. "Six" is a consequence of `MONTH_WINDOW_QUARTERS`, not a
 * second rule, and no month, quarter or year is named anywhere in the nav.
 *
 * These pin down what a hardcoded implementation always gets wrong: the window
 * that straddles two FYs (Jan–Mar's quarter is followed by NEXT FY's Q1), the
 * "Show past" reveal stepping backwards over the same boundary, and Jan–Mar
 * months belonging to the FY that started the previous April.
 */

describe("monthWindowQuarters — the live quarter plus the next", () => {
  it("matches the brief's August-2026 example: Q2 then Q3, six months", () => {
    // August 2026 sits in Q2 (Jul–Sep) of FY 2026-27.
    expect(quarterKey("2026-08-10")).toBe("2026-Q2");

    const window = monthWindowQuarters("2026-Q2");
    expect(window).toEqual(["2026-Q2", "2026-Q3"]);
    expect(window.flatMap(monthsOfQuarterKey)).toEqual([
      "2026-07", "2026-08", "2026-09", // Q2 · Jul–Sep
      "2026-10", "2026-11", "2026-12", // Q3 · Oct–Dec
    ]);
  });

  it("always shows exactly six consecutive months, wherever it starts", () => {
    for (const anchor of ["2026-Q1", "2026-Q2", "2026-Q3", "2026-Q4"]) {
      const quarters = monthWindowQuarters(anchor);
      expect(quarters).toHaveLength(MONTH_WINDOW_QUARTERS);
      expect(quarters[0]).toBe(anchor);
      expect(quarters[1]).toBe(shiftQuarterKey(anchor, 1));

      const months = quarters.flatMap(monthsOfQuarterKey);
      expect(months).toHaveLength(6);
      expect(new Set(months).size).toBe(6);
      // Chronological, with no gap: the keys sort into the order they're drawn.
      expect([...months].sort()).toEqual(months);
    }
  });

  it("rolls into the next FY when the live quarter is the last one", () => {
    // A January board: Q4 of FY 2026-27, then Q1 of FY 2027-28.
    expect(quarterKey("2027-01-15")).toBe("2026-Q4");
    const window = monthWindowQuarters("2026-Q4");
    expect(window).toEqual(["2026-Q4", "2027-Q1"]);
    expect(window.flatMap(monthsOfQuarterKey)).toEqual([
      "2027-01", "2027-02", "2027-03", // Jan–Mar — still FY 2026-27
      "2027-04", "2027-05", "2027-06", // Apr–Jun — FY 2027-28
    ]);
  });
});

describe("the FY brackets the month nav draws", () => {
  it("draws ONE bracket when both quarters share an FY", () => {
    expect(groupQuarterKeysByFy(monthWindowQuarters("2026-Q2"))).toEqual([
      { fy: 2026, keys: ["2026-Q2", "2026-Q3"] },
    ]);
  });

  it("draws TWO brackets across the FY boundary, in order", () => {
    expect(groupQuarterKeysByFy(monthWindowQuarters("2026-Q4"))).toEqual([
      { fy: 2026, keys: ["2026-Q4"] },
      { fy: 2027, keys: ["2027-Q1"] },
    ]);
  });

  it("files Jan–Mar under the FY that started the previous April", () => {
    expect(fyStartYearOfMonthKey("2027-03")).toBe(2026);
    expect(fyStartYearOfMonthKey("2027-04")).toBe(2027);
    // …which is what makes the January window's two brackets differ at all.
    expect(quarterKeyOfMonthKey("2027-03")).toBe("2026-Q4");
    expect(quarterKeyOfMonthKey("2027-04")).toBe("2027-Q1");
  });
});

describe('"Show past" — the previous quarter, revealed in place', () => {
  it("prepends the quarter behind the window, still in chronological order", () => {
    const past = shiftQuarterKey("2026-Q2", -1);
    expect(past).toBe("2026-Q1");
    const revealed = [past, ...monthWindowQuarters("2026-Q2")].sort();
    expect(revealed.flatMap(monthsOfQuarterKey)).toEqual([
      "2026-04", "2026-05", "2026-06", // Q1 · Apr–Jun (past)
      "2026-07", "2026-08", "2026-09",
      "2026-10", "2026-11", "2026-12",
    ]);
  });

  it("steps back across the FY boundary from the first quarter of a year", () => {
    // April's board reveals Jan–Mar, which belong to the PREVIOUS financial year.
    const past = shiftQuarterKey("2026-Q1", -1);
    expect(past).toBe("2025-Q4");
    expect(monthsOfQuarterKey(past)).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(groupQuarterKeysByFy([past, ...monthWindowQuarters("2026-Q1")].sort())).toEqual([
      { fy: 2025, keys: ["2025-Q4"] },
      { fy: 2026, keys: ["2026-Q1", "2026-Q2"] },
    ]);
  });
});

describe("the selected month — no month, quarter or year hardcoded", () => {
  it("derives today's month key and its quarter from the date alone", () => {
    // Whatever "today" is, its month sits in the anchor quarter of the window —
    // which is what makes the current month selected by default.
    const today = new Date();
    const anchor = quarterKey(today);
    expect(quarterKeyOfMonthKey(monthKey(today))).toBe(anchor);
    expect(monthsOfQuarterKey(anchor)).toContain(monthKey(today));
    expect(monthWindowQuarters(anchor)[0]).toBe(anchor);
  });

  it("treats a month as past by plain key order (keys are sortable)", () => {
    // The nav's de-emphasis rule is `monthKey < currentMonthKey` — valid only
    // because 'YYYY-MM' sorts chronologically, including across a year end.
    expect("2026-12" < "2027-01").toBe(true);
    expect("2027-03" < "2027-04").toBe(true);
    expect("2026-09" < "2026-08").toBe(false);
  });
});
