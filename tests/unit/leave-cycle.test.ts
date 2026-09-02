import { describe, it, expect } from "vitest";
import {
  leaveCycleFor,
  daysInDateRange,
  balanceWindow,
  overlapDays,
} from "@/lib/attendance/leave-cycle";
describe("leaveCycleFor", () => {
  it("first 6 months after probation-end → allowance 3", () => {
    const c = leaveCycleFor("2026-01-01", "2026-03-15");
    expect(c.allowance).toBe(3); expect(c.half).toBe(1); expect(c.beforeProbation).toBe(false);
    expect(c.cycleStart).toBe("2026-01-01"); expect(c.cycleEnd).toBe("2026-06-30");
  });
  it("months 6-12 → allowance 4", () => {
    const c = leaveCycleFor("2026-01-01", "2026-09-15");
    expect(c.allowance).toBe(4); expect(c.half).toBe(2);
    expect(c.cycleStart).toBe("2026-07-01"); expect(c.cycleEnd).toBe("2026-12-31");
  });
  it("second year repeats", () => {
    const c = leaveCycleFor("2026-01-01", "2027-02-01");
    expect(c.allowance).toBe(3); expect(c.cycleStart).toBe("2027-01-01");
  });
  it("before probation-end → 0", () => {
    const c = leaveCycleFor("2026-06-01", "2026-03-01");
    expect(c.allowance).toBe(0); expect(c.beforeProbation).toBe(true);
  });
  it("daysInDateRange inclusive", () => {
    expect(daysInDateRange("2026-03-01","2026-03-03")).toBe(3);
    expect(daysInDateRange("2026-03-01","2026-03-01")).toBe(1);
  });
});

describe("balanceWindow (probation clamp)", () => {
  it("clamps the lower bound up to probation-end when it's after cycleStart", () => {
    // probation-end mid-cycle → window starts at probation-end, not cycleStart.
    const w = balanceWindow("2026-03-15", "2026-01-01", "2026-06-30");
    expect(w).toEqual({ from: "2026-03-15", to: "2026-06-30" });
  });
  it("keeps cycleStart when probation-end precedes it", () => {
    const w = balanceWindow("2025-12-01", "2026-01-01", "2026-06-30");
    expect(w).toEqual({ from: "2026-01-01", to: "2026-06-30" });
  });
  it("returns null when probation-end is after cycleEnd (empty window)", () => {
    expect(balanceWindow("2026-08-01", "2026-01-01", "2026-06-30")).toBeNull();
  });
});

describe("overlapDays (clamped used-day count)", () => {
  it("counts only days inside the window", () => {
    // leave 10–20 Mar, window opens 15 Mar → only 15–20 count (6 days).
    expect(overlapDays("2026-03-10", "2026-03-20", "2026-03-15", "2026-06-30")).toBe(6);
  });
  it("counts the full leave when entirely inside the window", () => {
    expect(overlapDays("2026-04-01", "2026-04-03", "2026-01-01", "2026-06-30")).toBe(3);
  });
  it("returns 0 when the leave is entirely before the window", () => {
    expect(overlapDays("2026-02-01", "2026-02-05", "2026-03-15", "2026-06-30")).toBe(0);
  });
  it("clamps the upper bound to cycleEnd", () => {
    // leave 28 Jun – 5 Jul, cycle ends 30 Jun → 28,29,30 count (3 days).
    expect(overlapDays("2026-06-28", "2026-07-05", "2026-01-01", "2026-06-30")).toBe(3);
  });
});
