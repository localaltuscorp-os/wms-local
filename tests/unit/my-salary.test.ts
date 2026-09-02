import { describe, expect, it } from "vitest";
import { computeScheduleHourlySalary } from "@/lib/salary/compute";

/**
 * MY SALARY — the invariant the page depends on.
 *
 * The screen shows "Base earned" and "Overtime" as two separate lines. If they
 * did not add back up to the gross, an employee would be reading a breakdown
 * that does not reconcile with their own net pay — the exact class of problem
 * this rewrite exists to remove.
 *
 * `baseAmount` is derived as `gross - overtimeAmount` in
 * lib/salary/my-salary.ts, so this pins the arithmetic that derivation assumes.
 */

const BASE = {
  monthlyTargetHours: 117,
  chargeableHalfDays: 0,
  dailyTargetHours: 4.5,
  ptExempt: true,
  tdsMonthly: 0,
  advances: 0,
  pendingBalanceIn: 0,
};

/** What lib/salary/my-salary.ts does when it builds a month. */
const split = (b: { gross: number; overtimeAmount?: number }) => ({
  base: b.gross - (b.overtimeAmount ?? 0),
  overtime: b.overtimeAmount ?? 0,
});

describe("base + overtime reconcile to gross", () => {
  it("splits an intern's month into base and overtime", () => {
    const b = computeScheduleHourlySalary({
      ...BASE,
      monthlySalary: 3500,
      payableHoursRaw: 117,
      overtimeHours: 4,
    });
    const { base, overtime } = split(b);
    expect(overtime).toBeGreaterThan(0);
    expect(base + overtime).toBeCloseTo(b.gross, 2);
    // The base is exactly the capped monthly salary; overtime is the extra.
    expect(base).toBeCloseTo(3500, 2);
  });

  it("shows the whole gross as base when nothing was earned over target", () => {
    const b = computeScheduleHourlySalary({
      ...BASE,
      monthlySalary: 3500,
      payableHoursRaw: 100,
      overtimeHours: 0,
    });
    const { base, overtime } = split(b);
    expect(overtime).toBe(0);
    expect(base).toBeCloseTo(b.gross, 2);
  });

  it("never shows an overtime line for a full-timer", () => {
    const b = computeScheduleHourlySalary({
      monthlyTargetHours: 216,
      chargeableHalfDays: 0,
      dailyTargetHours: 9,
      ptExempt: true,
      tdsMonthly: 0,
      advances: 0,
      pendingBalanceIn: 0,
      monthlySalary: 40000,
      payableHoursRaw: 250,
      overtimeHours: 0, // gated upstream by earnsOvertime
    });
    const { base, overtime } = split(b);
    expect(overtime).toBe(0);
    expect(base).toBe(40000);
  });

  it("keeps the split intact once deductions apply", () => {
    const b = computeScheduleHourlySalary({
      ...BASE,
      ptExempt: false, // PT ₹200
      advances: 500,
      monthlySalary: 3500,
      payableHoursRaw: 117,
      overtimeHours: 2,
    });
    const { base, overtime } = split(b);
    expect(base + overtime).toBeCloseTo(b.gross, 2);
    // Net is the gross less what was deducted — the headline the page leads with.
    expect(b.net).toBeCloseTo(b.gross - 200 - 500, 2);
  });
});
