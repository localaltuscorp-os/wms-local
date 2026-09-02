import { describe, it, expect } from "vitest";
import {
  leaveCycleFor,
  leaveCycleLabel,
  previousCycleEnd,
  daysInDateRange,
  balanceWindow,
  overlapDays,
  proRataAllowance,
  roundUpToHalf,
  FY_RULE_FROM,
} from "@/lib/attendance/leave-cycle";
import {
  allowedLeaveKinds,
  isPaidLeaveEligible,
  leaveKindAllowedFor,
} from "@/lib/attendance/leave-eligibility";
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
  it("second year uses the financial halves (Feb belongs to Oct-Mar)", () => {
    const c = leaveCycleFor("2026-01-01", "2027-02-01");
    expect(c.allowance).toBe(4); expect(c.half).toBe(2);
    expect(c.cycleStart).toBe("2026-10-01"); expect(c.cycleEnd).toBe("2027-03-31");
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

describe("leaveCycleFor — fixed calendar half-years (Jan–Jun / Jul–Dec)", () => {
  it("puts the period boundaries on the calendar, NOT on the probation anniversary", () => {
    // Probation ended 15 Mar. The old anchored rule gave this person a private
    // Mar–Aug window; the calendar rule gives them Jan–Jun like everyone else.
    const c = leaveCycleFor("2026-03-15", "2026-05-20");
    expect(c.cycleStart).toBe("2026-01-01");
    expect(c.cycleEnd).toBe("2026-06-30");
    expect(c.half).toBe(1);
    // Confirmed 15 Mar, so only Mar-Jun of the period is earned: 3 x 4/6 = 2.
    expect(c.allowance).toBe(2);
    expect(c.fullAllowance).toBe(3);
    expect(c.proRated).toBe(true);
  });

  it("two employees with different probation dates share one period", () => {
    const a = leaveCycleFor("2024-02-10", "2026-09-01");
    const b = leaveCycleFor("2026-07-30", "2026-09-01");
    expect(a.cycleStart).toBe(b.cycleStart);
    expect(a.cycleEnd).toBe(b.cycleEnd);
    expect(a.allowance).toBe(4);
    expect(b.allowance).toBe(4);
  });

  it("every month maps to the right half", () => {
    for (const m of ["01", "02", "03", "04", "05", "06"]) {
      expect(leaveCycleFor("2020-01-01", `2026-${m}-15`).half).toBe(1);
    }
    for (const m of ["07", "08", "09", "10", "11", "12"]) {
      expect(leaveCycleFor("2020-01-01", `2026-${m}-15`).half).toBe(2);
    }
  });

  it("boundary days belong to their own period", () => {
    expect(leaveCycleFor("2020-01-01", "2026-06-30").cycleEnd).toBe("2026-06-30");
    expect(leaveCycleFor("2020-01-01", "2026-07-01").cycleStart).toBe("2026-07-01");
  });

  it("before probation-end: 0 allowance, but the period is still named", () => {
    const c = leaveCycleFor("2026-09-01", "2026-08-20");
    expect(c.beforeProbation).toBe(true);
    expect(c.allowance).toBe(0);
    expect(c.cycleStart).toBe("2026-07-01");
    expect(c.cycleEnd).toBe("2026-12-31");
  });

  it("nothing carries across the Jun/Dec boundary — H2 grants its own 4", () => {
    // Someone who used 0 of 3 in H1 still gets exactly 4 (not 7) in H2.
    expect(leaveCycleFor("2026-01-01", "2026-07-01").allowance).toBe(4);
  });
});

describe("leaveCycleLabel / previousCycleEnd", () => {
  it("labels each half", () => {
    expect(leaveCycleLabel({ cycleStart: "2026-01-01", cycleEnd: "2026-06-30" })).toBe("Jan–Jun 2026");
    expect(leaveCycleLabel({ cycleStart: "2026-07-01", cycleEnd: "2026-12-31" })).toBe("Jul–Dec 2026");
    expect(leaveCycleLabel({ cycleStart: "2026-10-01", cycleEnd: "2027-03-31" })).toBe("Oct 2026–Mar 2027");
    expect(leaveCycleLabel({ cycleStart: "2027-04-01", cycleEnd: "2027-09-30" })).toBe("Apr–Sep 2027");
  });
  it("walks back one period, crossing the year at January", () => {
    expect(previousCycleEnd("2026-07-01")).toBe("2026-06-30");
    expect(previousCycleEnd("2026-01-01")).toBe("2025-12-31");
  });
  it("walks back across the financial halves too", () => {
    expect(previousCycleEnd("2026-10-01")).toBe("2026-09-30");
    expect(previousCycleEnd("2027-04-01")).toBe("2027-03-31");
  });
});

describe("leave eligibility by worker type", () => {
  it("only a full-timer accrues paid leave", () => {
    expect(isPaidLeaveEligible("full_time")).toBe(true);
    expect(isPaidLeaveEligible("second_half")).toBe(false);
    expect(isPaidLeaveEligible("hybrid")).toBe(false);
    expect(isPaidLeaveEligible("project_remote")).toBe(false);
  });

  it("a full-timer is offered both kinds; everyone else only unpaid", () => {
    expect([...allowedLeaveKinds("full_time")]).toEqual(["paid", "unpaid"]);
    expect([...allowedLeaveKinds("second_half")]).toEqual(["unpaid"]);
    expect([...allowedLeaveKinds("hybrid")]).toEqual(["unpaid"]);
    expect([...allowedLeaveKinds("project_remote")]).toEqual(["unpaid"]);
  });

  it("the guard refuses paid leave for the hourly/contract archetypes", () => {
    expect(leaveKindAllowedFor("full_time", "paid")).toBe(true);
    expect(leaveKindAllowedFor("second_half", "paid")).toBe(false);
    expect(leaveKindAllowedFor("hybrid", "paid")).toBe(false);
    expect(leaveKindAllowedFor("project_remote", "paid")).toBe(false);
  });

  it("unpaid leave is available to every archetype", () => {
    for (const w of ["full_time", "second_half", "hybrid", "project_remote"] as const) {
      expect(leaveKindAllowedFor(w, "unpaid")).toBe(true);
    }
  });
});

describe("financial halves (Apr-Sep 3 / Oct-Mar 4) from the switch date", () => {
  it("switches exactly on FY_RULE_FROM, which is itself a boundary", () => {
    expect(FY_RULE_FROM).toBe("2026-10-01");
    // The day before still answers with the calendar half it was granted under,
    // so no live balance is re-dated under anyone mid-period.
    const before = leaveCycleFor(null, "2026-09-30");
    expect(before.cycleStart).toBe("2026-07-01");
    expect(before.cycleEnd).toBe("2026-12-31");
    // The switch day opens the first financial half.
    const after = leaveCycleFor(null, "2026-10-01");
    expect(after.cycleStart).toBe("2026-10-01");
    expect(after.cycleEnd).toBe("2027-03-31");
    expect(after.allowance).toBe(4);
  });

  it("Jan-Mar belongs to the period that opened the PREVIOUS October", () => {
    // The case a naive month test gets wrong: January must not be handed a
    // period that has not started yet.
    for (const d of ["2027-01-05", "2027-02-14", "2027-03-31"]) {
      const c = leaveCycleFor(null, d);
      expect(c.cycleStart).toBe("2026-10-01");
      expect(c.cycleEnd).toBe("2027-03-31");
      expect(c.half).toBe(2);
      expect(c.allowance).toBe(4);
    }
  });

  it("Apr-Sep grants 3 and lapses on 30 Sep", () => {
    const c = leaveCycleFor(null, "2027-06-15");
    expect(c.cycleStart).toBe("2027-04-01");
    expect(c.cycleEnd).toBe("2027-09-30");
    expect(c.half).toBe(1);
    expect(c.allowance).toBe(3);
  });

  it("nothing crosses the boundary — each period grants its own amount", () => {
    expect(leaveCycleFor(null, "2027-03-31").allowance).toBe(4);
    expect(leaveCycleFor(null, "2027-04-01").allowance).toBe(3);
  });
});

describe("pro-rata entitlement from the confirmation date", () => {
  it("the November example: confirmed Nov, Oct-Mar period, 3.5 of 4", () => {
    // Nov through Mar is 5 of the 6 months: 4 x 5/6 = 3.33, rounded UP to 3.5.
    const c = leaveCycleFor("2026-11-10", "2026-12-01");
    expect(c.cycleStart).toBe("2026-10-01");
    expect(c.allowance).toBe(3.5);
    expect(c.fullAllowance).toBe(4);
    expect(c.proRated).toBe(true);
  });

  it("is computed from the date, not hardcoded to November", () => {
    // Confirmed a month later: Dec-Mar is 4/6, so 4 x 4/6 = 2.67, up to 3.
    expect(leaveCycleFor("2026-12-02", "2027-01-01").allowance).toBe(3);
    // A month later still: Jan-Mar is 3/6, exactly 2.
    expect(leaveCycleFor("2027-01-20", "2027-02-01").allowance).toBe(2);
  });

  it("after the period ends the employee gets the NEXT period in full", () => {
    expect(leaveCycleFor("2026-11-10", "2027-05-01").allowance).toBe(3);
    expect(leaveCycleFor("2026-11-10", "2027-11-01").allowance).toBe(4);
  });

  it("confirmation on or before the period start earns the full allowance", () => {
    expect(leaveCycleFor("2026-10-01", "2026-12-01").allowance).toBe(4);
    expect(leaveCycleFor("2020-01-01", "2026-12-01").allowance).toBe(4);
  });

  it("no confirmation date recorded means full allowance, never pro-rated", () => {
    // 21 of 24 live employees have no probation_end; reading that as
    // "confirmed today" would pro-rate almost the whole roster down.
    const c = leaveCycleFor(null, "2026-12-01");
    expect(c.allowance).toBe(4);
    expect(c.proRated).toBe(false);
  });

  it("rounds UP to the nearest half day, never past the full allowance", () => {
    expect(roundUpToHalf(3.1)).toBe(3.5);
    expect(roundUpToHalf(3.5)).toBe(3.5);
    expect(roundUpToHalf(3.6)).toBe(4);
    expect(roundUpToHalf(2)).toBe(2);
    expect(proRataAllowance(4, "2026-10-01", "2026-10-01", "2027-03-31")).toBe(4);
    expect(proRataAllowance(4, "2025-01-01", "2026-10-01", "2027-03-31")).toBe(4);
  });

  it("confirmation after the period ends earns nothing in it", () => {
    expect(proRataAllowance(4, "2027-05-01", "2026-10-01", "2027-03-31")).toBe(0);
  });
});
