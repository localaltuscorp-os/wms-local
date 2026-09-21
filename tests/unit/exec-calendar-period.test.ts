import { describe, it, expect } from "vitest";
import {
  isNow,
  periodLabel,
  periodRange,
  stepPeriod,
  yearChoices,
} from "@/lib/exec-calendar/period";

/** Thursday 17 September 2026 — the day the toolbar was specified against. */
const TODAY = "2026-09-17";

describe("what each view loads", () => {
  it("loads exactly the day, the week, the month or the year", () => {
    expect(periodRange("day", TODAY)).toEqual({ from: TODAY, to: TODAY });
    expect(periodRange("week", TODAY)).toEqual({ from: "2026-09-14", to: "2026-09-20" });
    expect(periodRange("month", TODAY)).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(periodRange("year", TODAY)).toEqual({ from: "2026-01-01", to: "2026-12-31" });
  });

  it("gets February right in a leap year", () => {
    expect(periodRange("month", "2028-02-10").to).toBe("2028-02-29");
  });
});

describe("where the arrows go", () => {
  it("steps by one of whatever you are looking at", () => {
    expect(stepPeriod("day", TODAY, 1)).toBe("2026-09-18");
    expect(stepPeriod("week", TODAY, -1)).toBe("2026-09-10");
    expect(stepPeriod("month", TODAY, 1)).toBe("2026-10-01");
    expect(stepPeriod("year", TODAY, -1)).toBe("2025-09-17");
  });

  it("crosses the year boundary by month", () => {
    expect(stepPeriod("month", "2026-12-05", 1)).toBe("2027-01-01");
  });
});

describe("what the button says", () => {
  it("names the day the way a person would", () => {
    expect(periodLabel("day", TODAY, TODAY)).toBe("Today");
    expect(periodLabel("day", "2026-09-16", TODAY)).toBe("Yesterday");
    expect(periodLabel("day", "2026-09-18", TODAY)).toBe("Tomorrow");
  });

  it("falls back to a date once past one step away", () => {
    expect(periodLabel("day", "2026-09-24", TODAY)).toBe("24 Sep");
  });

  it("adds the year only when it is not this one", () => {
    expect(periodLabel("day", "2027-01-04", TODAY)).toBe("4 Jan 2027");
  });

  it("names the week, then gives the range", () => {
    expect(periodLabel("week", TODAY, TODAY)).toBe("This week");
    expect(periodLabel("week", "2026-09-10", TODAY)).toBe("Last week");
    expect(periodLabel("week", "2026-09-24", TODAY)).toBe("Next week");
    // The brief's own example: a range that crosses a month.
    expect(periodLabel("week", "2026-09-30", TODAY)).toBe("28 Sep – 4 Oct");
  });

  it("names the month, with the year only when it differs", () => {
    expect(periodLabel("month", TODAY, TODAY)).toBe("September");
    expect(periodLabel("month", "2026-11-02", TODAY)).toBe("November");
    expect(periodLabel("month", "2027-03-02", TODAY)).toBe("March 2027");
  });

  it("names the year", () => {
    expect(periodLabel("year", "2027-05-01", TODAY)).toBe("2027");
  });
});

describe("knowing when you are already on now", () => {
  it("is true for the containing period and false outside it", () => {
    expect(isNow("day", TODAY, TODAY)).toBe(true);
    expect(isNow("day", "2026-09-18", TODAY)).toBe(false);
    expect(isNow("week", "2026-09-14", TODAY)).toBe(true);
    expect(isNow("month", "2026-09-01", TODAY)).toBe(true);
    expect(isNow("month", "2026-10-01", TODAY)).toBe(false);
    expect(isNow("year", "2026-01-01", TODAY)).toBe(true);
  });
});

describe("the year jump strip", () => {
  it("offers this year and the next ones, never the past", () => {
    expect(yearChoices(TODAY, 4)).toEqual([2026, 2027, 2028, 2029]);
    expect(yearChoices(TODAY, 2)).toEqual([2026, 2027]);
  });
});
