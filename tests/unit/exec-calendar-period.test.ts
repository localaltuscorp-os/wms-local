import { describe, it, expect } from "vitest";
import {
  isNow,
  periodLabel,
  periodRange,
  stepPeriod,
} from "@/lib/exec-calendar/period";

/** Thursday 17 September 2026 — the day the toolbar was specified against. */
const TODAY = "2026-09-17";

describe("what each view loads", () => {
  it("loads day, week, month, Month at a Glance and quarter ranges", () => {
    expect(periodRange("day", TODAY)).toEqual({ from: TODAY, to: TODAY });
    expect(periodRange("week", TODAY)).toEqual({ from: "2026-09-14", to: "2026-09-20" });
    expect(periodRange("month", TODAY)).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(periodRange("monthgrid", TODAY)).toEqual({ from: "2026-08-31", to: "2026-10-04" });
    expect(periodRange("quarter", TODAY)).toEqual({ from: "2026-07-01", to: "2026-09-30" });
  });

  it("gets February right in a leap year", () => {
    expect(periodRange("month", "2028-02-10").to).toBe("2028-02-29");
  });

  it("includes adjacent-month dates across six calendar weeks", () => {
    expect(periodRange("monthgrid", "2026-08-12")).toEqual({ from: "2026-07-27", to: "2026-09-06" });
  });
});

describe("where the arrows go", () => {
  it("steps by one of whatever you are looking at", () => {
    expect(stepPeriod("day", TODAY, 1)).toBe("2026-09-18");
    expect(stepPeriod("week", TODAY, -1)).toBe("2026-09-10");
    expect(stepPeriod("month", TODAY, 1)).toBe("2026-10-01");
    expect(stepPeriod("monthgrid", TODAY, 1)).toBe("2026-10-01");
    expect(stepPeriod("quarter", TODAY, 1)).toBe("2026-10-01");
    expect(stepPeriod("quarter", "2027-01-31", -1)).toBe("2026-10-01");
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

  it("labels the quarter", () => {
    expect(periodLabel("quarter", "2026-07-01", TODAY)).toBe("This quarter");
    expect(periodLabel("quarter", "2026-10-01", TODAY)).toBe("Q4 2026");
  });
});

describe("knowing when you are already on now", () => {
  it("is true for the containing period and false outside it", () => {
    expect(isNow("day", TODAY, TODAY)).toBe(true);
    expect(isNow("day", "2026-09-18", TODAY)).toBe(false);
    expect(isNow("week", "2026-09-14", TODAY)).toBe(true);
    expect(isNow("month", "2026-09-01", TODAY)).toBe(true);
    expect(isNow("month", "2026-10-01", TODAY)).toBe(false);
    expect(isNow("quarter", "2026-07-01", TODAY)).toBe(true);
  });
});
