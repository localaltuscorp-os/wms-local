import { describe, it, expect } from "vitest";
import {
  groupQuarterKeysByFy,
  quarterKey,
  quarterWindow,
  shiftQuarterKey,
} from "@/lib/goals/types";

/**
 * The Quarterly board's quarter navigator shows a ROLLING WINDOW — the live
 * quarter plus the next three — bracketed under the financial year that owns
 * each one. The FY boundary is the only hard part, and the whole point of this
 * module is that it is written down exactly once (`shiftQuarterKey`'s
 * absolute-quarter arithmetic): the window and the FY grouping both fall out of
 * it. These tests pin that down, including the two rollovers a hardcoded
 * implementation always gets wrong — Q4 → next FY's Q1, and Jan–Mar belonging
 * to the FY that STARTED the previous April.
 */

describe("quarterKey — which FY quarter a date falls in", () => {
  it("maps each FY quarter to its months (Q1 = Apr–Jun)", () => {
    expect(quarterKey("2026-04-01")).toBe("2026-Q1"); // Apr
    expect(quarterKey("2026-06-30")).toBe("2026-Q1"); // Jun
    expect(quarterKey("2026-07-01")).toBe("2026-Q2"); // Jul
    expect(quarterKey("2026-09-30")).toBe("2026-Q2"); // Sep
    expect(quarterKey("2026-10-01")).toBe("2026-Q3"); // Oct
    expect(quarterKey("2026-12-31")).toBe("2026-Q3"); // Dec
    expect(quarterKey("2027-01-01")).toBe("2026-Q4"); // Jan — still FY 2026-27
    expect(quarterKey("2027-03-31")).toBe("2026-Q4"); // Mar — last day of the FY
  });

  it("rolls into the next FY on 1 April, not 1 January", () => {
    expect(quarterKey("2027-03-31")).toBe("2026-Q4");
    expect(quarterKey("2027-04-01")).toBe("2027-Q1");
  });
});

describe("shiftQuarterKey", () => {
  it("steps forward across the FY boundary", () => {
    expect(shiftQuarterKey("2026-Q4", 1)).toBe("2027-Q1");
    expect(shiftQuarterKey("2026-Q2", 4)).toBe("2027-Q2");
  });

  it("steps backward across the FY boundary", () => {
    expect(shiftQuarterKey("2026-Q1", -1)).toBe("2025-Q4");
    expect(shiftQuarterKey("2026-Q1", -5)).toBe("2024-Q4");
  });

  it("is the identity at delta 0 and reversible", () => {
    expect(shiftQuarterKey("2026-Q3", 0)).toBe("2026-Q3");
    for (const d of [1, 3, 7, 12, -1, -6]) {
      expect(shiftQuarterKey(shiftQuarterKey("2026-Q3", d), -d)).toBe("2026-Q3");
    }
  });
});

describe("quarterWindow — the current quarter plus the next three", () => {
  it("matches the brief's August-2026 example", () => {
    // August 2026 sits in Q2 (Jul–Sep) of FY 2026-27.
    expect(quarterKey("2026-08-10")).toBe("2026-Q2");
    expect(quarterWindow("2026-Q2")).toEqual(["2026-Q2", "2026-Q3", "2026-Q4", "2027-Q1"]);
  });

  it("always returns four consecutive quarters, wherever it starts", () => {
    for (const anchor of ["2026-Q1", "2026-Q2", "2026-Q3", "2026-Q4"]) {
      const win = quarterWindow(anchor);
      expect(win).toHaveLength(4);
      expect(win[0]).toBe(anchor);
      expect(new Set(win).size).toBe(4);
      // Consecutive: every step is exactly one quarter on from the last.
      expect(win.slice(1)).toEqual(win.slice(0, -1).map((k) => shiftQuarterKey(k, 1)));
    }
  });

  it("spans at most two financial years and never skips one", () => {
    // Anchored on Q1 the window is a single FY; anywhere else it straddles two.
    expect(groupQuarterKeysByFy(quarterWindow("2026-Q1")).map((g) => g.fy)).toEqual([2026]);
    expect(groupQuarterKeysByFy(quarterWindow("2026-Q4")).map((g) => g.fy)).toEqual([2026, 2027]);
  });
});

describe("groupQuarterKeysByFy — the FY brackets the nav draws", () => {
  it("groups the August-2026 window as FY 2026-27 (Q2–Q4) then FY 2027-28 (Q1)", () => {
    expect(groupQuarterKeysByFy(quarterWindow("2026-Q2"))).toEqual([
      { fy: 2026, keys: ["2026-Q2", "2026-Q3", "2026-Q4"] },
      { fy: 2027, keys: ["2027-Q1"] },
    ]);
  });

  it("keeps every quarter, in order, across the split", () => {
    const keys = quarterWindow("2026-Q3");
    expect(groupQuarterKeysByFy(keys).flatMap((g) => g.keys)).toEqual(keys);
  });

  it("absorbs the revealed past quarters into their own FY's bracket", () => {
    // "Show past" merges FY 2026-27's earlier quarters back into the window.
    const merged = [...new Set(["2026-Q1", ...quarterWindow("2026-Q2")])].sort();
    expect(groupQuarterKeysByFy(merged)).toEqual([
      { fy: 2026, keys: ["2026-Q1", "2026-Q2", "2026-Q3", "2026-Q4"] },
      { fy: 2027, keys: ["2027-Q1"] },
    ]);
  });

  it("returns nothing for no keys", () => {
    expect(groupQuarterKeysByFy([])).toEqual([]);
  });
});
