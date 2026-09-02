import { describe, it, expect } from "vitest";
import {
  computeEncashment,
  encashmentReason,
  ENCASHMENT_DAY_DIVISOR,
} from "@/lib/attendance/leave-encashment";

// 372000 / 12 = 31000 monthly, / 31 = exactly 1000 per day. Chosen so the
// arithmetic is checkable by eye rather than by re-running the formula.
const CTC = 372_000;

describe("leave encashment", () => {
  it("values an unused day at monthly gross / 31, not the month's real length", () => {
    expect(ENCASHMENT_DAY_DIVISOR).toBe(31);
    const e = computeEncashment({
      probationEnd: null,
      annualCtc: CTC,
      paidLeaveUsed: 0,
      onDate: "2027-09-30", // Apr-Sep closes: 3 leaves
    });
    expect(e.allowance).toBe(3);
    expect(e.unusedDays).toBe(3);
    expect(e.perDayRate).toBe(1000);
    expect(e.amount).toBe(3000);
  });

  it("pays the SAME per day in both periods, which is the point of the fixed divisor", () => {
    const sep = computeEncashment({ probationEnd: null, annualCtc: CTC, paidLeaveUsed: 0, onDate: "2027-09-30" });
    const mar = computeEncashment({ probationEnd: null, annualCtc: CTC, paidLeaveUsed: 0, onDate: "2027-03-31" });
    expect(sep.perDayRate).toBe(mar.perDayRate);
    // Different allowances (3 vs 4), same rate — so the amounts differ only by
    // entitlement, never by how long the closing month happened to be.
    expect(sep.amount).toBe(3000);
    expect(mar.amount).toBe(4000);
  });

  it("subtracts what was taken", () => {
    const e = computeEncashment({ probationEnd: null, annualCtc: CTC, paidLeaveUsed: 1, onDate: "2027-03-31" });
    expect(e.unusedDays).toBe(3);
    expect(e.amount).toBe(3000);
  });

  it("keeps HALF days all the way to the payout", () => {
    // Confirmed in November → 3.5 of 4 (pro-rata, rounded up). One taken leaves
    // 2.5 to encash; rounding that to 2 would pocket the half day the pro-rata
    // rule deliberately rounded UP to grant.
    const e = computeEncashment({
      probationEnd: "2026-11-10",
      annualCtc: CTC,
      paidLeaveUsed: 1,
      onDate: "2027-03-31",
    });
    expect(e.allowance).toBe(3.5);
    expect(e.unusedDays).toBe(2.5);
    expect(e.amount).toBe(2500);
    expect(e.cycle.proRated).toBe(true);
  });

  it("never goes negative when someone overran their allowance", () => {
    const e = computeEncashment({ probationEnd: null, annualCtc: CTC, paidLeaveUsed: 9, onDate: "2027-03-31" });
    expect(e.unusedDays).toBe(0);
    expect(e.amount).toBe(0);
  });

  it("encashes nothing without a CTC rather than dividing by zero", () => {
    const e = computeEncashment({ probationEnd: null, annualCtc: 0, paidLeaveUsed: 0, onDate: "2027-03-31" });
    expect(e.perDayRate).toBe(0);
    expect(e.amount).toBe(0);
    expect(e.unusedDays).toBe(4);
  });

  it("writes the arithmetic into the reason, since the amount is frozen", () => {
    const e = computeEncashment({ probationEnd: "2026-11-10", annualCtc: CTC, paidLeaveUsed: 1, onDate: "2027-03-31" });
    const r = encashmentReason(e);
    expect(r).toContain("Oct 2026–Mar 2027");
    expect(r).toContain("2.5 unused of 3.5");
    expect(r).toContain("/ 31");
    expect(r).toContain("pro-rated");
  });
});
