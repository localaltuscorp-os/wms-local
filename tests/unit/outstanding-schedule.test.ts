import { describe, it, expect } from "vitest";
import { generateSchedule } from "@/lib/outstanding/schedule";
import type { ContractInput } from "@/lib/outstanding/types";

const base: ContractInput = {
  id: "c1", clientName: "Parimal Gala", cycle: "subscription",
  baseAmount: 25000, gstRate: 0, startDate: "2025-09-01",
  periods: 3, endDate: null, status: "active",
};

describe("generateSchedule", () => {
  it("subscription with periods=3 → 3 monthly rows", () => {
    const rows = generateSchedule(base, "2027-01-01");
    expect(rows.map((r) => r.dueDate)).toEqual(["2025-09-01", "2025-10-01", "2025-11-01"]);
    expect(rows.every((r) => r.amount === 25000)).toBe(true);
    expect(rows.map((r) => r.periodIndex)).toEqual([0, 1, 2]);
  });
  it("full_payment → exactly one row at startDate", () => {
    const rows = generateSchedule({ ...base, cycle: "full_payment", periods: null }, "2027-01-01");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.dueDate).toBe("2025-09-01");
  });
  it("applies GST to amount", () => {
    const rows = generateSchedule({ ...base, periods: 1, gstRate: 18 }, "2027-01-01");
    expect(rows[0]!.amount).toBe(29500); // 25000 * 1.18
  });
  it("open-ended (no periods/endDate) generates monthly up to horizon", () => {
    const rows = generateSchedule({ ...base, periods: null }, "2025-12-01");
    expect(rows.map((r) => r.dueDate)).toEqual(["2025-09-01","2025-10-01","2025-11-01","2025-12-01"]);
  });
  it("endDate bounds the schedule inclusive", () => {
    const rows = generateSchedule({ ...base, periods: null, endDate: "2025-10-01" }, "2027-01-01");
    expect(rows).toHaveLength(2);
  });
  it("addMonths crosses a year boundary cleanly for 1st-of-month starts", () => {
    const rows = generateSchedule({ ...base, startDate: "2025-11-01", periods: 5 }, "2030-01-01");
    expect(rows.map((r) => r.dueDate)).toEqual([
      "2025-11-01", "2025-12-01", "2026-01-01", "2026-02-01", "2026-03-01",
    ]);
  });
  it("applies GST with round-half-up (10*1.05=10.5 → 11)", () => {
    expect(generateSchedule({ ...base, periods: 1, baseAmount: 10, gstRate: 5 }, "2030-01-01")[0]!.amount).toBe(11);
    // 5*1.05 = 5.25 → 5 (rounds down); confirms no float drift either way
    expect(generateSchedule({ ...base, periods: 1, baseAmount: 5, gstRate: 5 }, "2030-01-01")[0]!.amount).toBe(5);
  });
  // addMonths clamps a day-31 (or day-30) start to the target month's last day,
  // so a Jan-31 start never skips February: it lands on Feb-28 (or Feb-29 in a
  // leap year), then resumes the natural day-of-month on longer months.
  it("day-31 start clamps to month-end (no February skip)", () => {
    const rows = generateSchedule({ ...base, startDate: "2025-01-31", periods: 4 }, "2030-01-01");
    expect(rows.map((r) => r.dueDate)).toEqual([
      "2025-01-31", "2025-02-28", "2025-03-31", "2025-04-30",
    ]);
  });
});
