import { describe, it, expect } from "vitest";
import { computeSalary, computeHourlySalary, computeFixedFeeSalary } from "@/lib/salary/compute";

const base = {
  annualCtc: 1_200_000, // ₹12L/yr → ₹1L/mo
  payableDays: 30,
  daysInMonth: 30,
  ptExempt: false,
  tdsMonthly: 0,
  lateMarksInMonth: 0,
  advances: 0,
  pendingBalanceIn: 0,
};

describe("computeSalary", () => {
  it("full month, no deductions → gross = monthly CTC, net = gross - PT", () => {
    const r = computeSalary(base);
    expect(r.monthlyCtc).toBe(100000);
    expect(r.perDay).toBeCloseTo(100000 / 30, 2);
    expect(r.payableDays).toBe(30);
    expect(r.lateDeductionDays).toBe(0);
    expect(r.gross).toBe(100000);
    expect(r.pt).toBe(200);
    expect(r.net).toBe(99800);
  });
  it("PT exemption removes the ₹200", () => {
    expect(computeSalary({ ...base, ptExempt: true }).pt).toBe(0);
    expect(computeSalary({ ...base, ptExempt: true }).net).toBe(100000);
  });
  it("partial attendance scales gross by payable days", () => {
    const r = computeSalary({ ...base, payableDays: 15 });
    expect(r.gross).toBe(50000);
    expect(r.net).toBe(49800);
  });
  it("late deduction: floor(lates/3) * 0.5 days", () => {
    expect(computeSalary({ ...base, lateMarksInMonth: 2 }).lateDeductionDays).toBe(0);
    expect(computeSalary({ ...base, lateMarksInMonth: 3 }).lateDeductionDays).toBe(0.5);
    expect(computeSalary({ ...base, lateMarksInMonth: 6 }).lateDeductionDays).toBe(1.0);
    const r = computeSalary({ ...base, lateMarksInMonth: 3 });
    expect(r.gross).toBeCloseTo((100000 / 30) * (30 - 0.5), 2);
  });
  it("HP days (>1.0 dayValue) can push payable days above daysInMonth", () => {
    const r = computeSalary({ ...base, payableDays: 32 });
    expect(r.gross).toBeCloseTo((100000 / 30) * 32, 2);
  });
  it("tds, advances, pending all flow into net", () => {
    const r = computeSalary({ ...base, tdsMonthly: 1000, advances: 5000, pendingBalanceIn: 2000 });
    expect(r.net).toBe(100000 - 200 - 1000 - 5000 + 2000); // 95800
  });
  it("net can be negative (heavy advances) — caller decides carry-forward", () => {
    expect(computeSalary({ ...base, advances: 200000 }).net).toBeLessThan(0);
  });
  it("zero CTC → all zeros except PT", () => {
    const r = computeSalary({ ...base, annualCtc: 0 });
    expect(r.gross).toBe(0);
    expect(r.net).toBe(-200);
  });
  it("rounds money to 2 decimals", () => {
    const r = computeSalary({ ...base, annualCtc: 1_000_000, payableDays: 7, daysInMonth: 31 });
    expect(Number.isInteger(r.gross * 100)).toBe(true);
    expect(Number.isInteger(r.net * 100)).toBe(true);
  });
  it("tags the monthly_ctc basis", () => {
    expect(computeSalary(base).basis).toBe("monthly_ctc");
  });
});

describe("computeHourlySalary (hourly shifts)", () => {
  const h = {
    monthlyPayAtTarget: 3500, weeklyTargetHours: 27, daysInMonth: 31,
    ptExempt: true, tdsMonthly: 0, advances: 0, pendingBalanceIn: 0,
  };
  const target = 27 * (31 / 7); // ≈ 119.57h
  const rate = 3500 / target;
  it("pays WHOLE hours only (spec §18): the fractional target hour is not paid", () => {
    // 119.57h worked → 119 payable hours. The cap therefore only binds when the
    // whole-hour pay would exceed it — one rule, same as the full-time floor.
    const r = computeHourlySalary({ ...h, workedMinutes: target * 60 });
    expect(r.workedHours).toBe(Math.floor(target));
    expect(r.gross).toBeCloseTo(rate * Math.floor(target), 2);
    expect(r.basis).toBe("hourly");
  });
  it("53.8h and 53.9h pay the same 53 whole hours", () => {
    const a = computeHourlySalary({ ...h, workedMinutes: 53.8 * 60 });
    const b = computeHourlySalary({ ...h, workedMinutes: 53.9 * 60 });
    expect(a.workedHours).toBe(53);
    expect(a.gross).toBe(b.gross);
  });
  it("half the hours → half-ish pay, floored to the whole hour", () => {
    const r = computeHourlySalary({ ...h, workedMinutes: (target / 2) * 60 });
    expect(r.gross).toBeCloseTo(rate * Math.floor(target / 2), 2);
  });
  it("over target is CAPPED at ₹3,500 when no surplus is earned", () => {
    expect(computeHourlySalary({ ...h, workedMinutes: 300 * 60 }).gross).toBe(3500);
  });
  it("zero hours → zero gross", () => {
    expect(computeHourlySalary({ ...h, workedMinutes: 0 }).gross).toBe(0);
  });
  it("deductions flow into net; non-exempt charges PT", () => {
    const r = computeHourlySalary({ ...h, workedMinutes: target * 60, ptExempt: false, tdsMonthly: 100, advances: 200, pendingBalanceIn: 50 });
    expect(r.net).toBeCloseTo(r.gross - 200 - 100 - 200 + 50, 2);
  });
});

describe("computeHourlySalary — the ELIGIBLE monthly target anchors the rate", () => {
  // A 31-day month whose eligible calendar is 125h (25 working days × 5h):
  // holidays and weekly offs already removed, exactly like the full-time
  // engine's monthlyTargetHours. Salary ₹3,500 at target.
  const h = {
    monthlyPayAtTarget: 3500, weeklyTargetHours: 30, daysInMonth: 31,
    eligibleTargetHours: 125, overtimeEligible: true,
    ptExempt: true, tdsMonthly: 0, advances: 0, pendingBalanceIn: 0,
  };
  const rate = 3500 / 125; // ₹28/h — NOT 3500 ÷ (30 × 31/7)

  it("the rate divides by the eligible target, not the raw calendar", () => {
    const r = computeHourlySalary({ ...h, workedMinutes: 125 * 60 });
    expect(r.hourlyRate).toBeCloseTo(rate, 2);
    expect(r.targetHours).toBe(125);
  });

  it("completing the eligible month pays EXACTLY the full monthly figure", () => {
    const r = computeHourlySalary({ ...h, workedMinutes: 125 * 60 });
    expect(r.gross).toBeCloseTo(3500, 2);
    expect(r.overtimeHours).toBe(0);
  });

  it("surplus beyond the eligible target is additional pay at the SAME rate — base stays the full salary", () => {
    // 174h worked of a 125h month: base = 125 × rate = ₹3,500, plus 49h × rate.
    const r = computeHourlySalary({ ...h, workedMinutes: 174 * 60 });
    expect(r.overtimeHours).toBe(49);
    expect(r.overtimeAmount).toBeCloseTo(49 * rate, 2);
    expect(r.gross - (r.overtimeAmount ?? 0)).toBeCloseTo(3500, 2);
    expect(r.gross).toBeCloseTo(174 * rate, 2);
  });

  it("a short month deducts only the missing eligible hours", () => {
    const r = computeHourlySalary({ ...h, workedMinutes: 120 * 60 });
    expect(r.gross).toBeCloseTo(3500 - 5 * rate, 2);
  });

  it("a holiday-shrunk target RAISES the rate — the holiday costs nothing", () => {
    const normal = computeHourlySalary({ ...h, workedMinutes: 125 * 60 });
    const shrunk = computeHourlySalary({
      ...h, eligibleTargetHours: 120, workedMinutes: 120 * 60,
    });
    expect(shrunk.hourlyRate ?? 0).toBeGreaterThan(normal.hourlyRate ?? 0);
    expect(shrunk.gross).toBeCloseTo(3500, 2);
  });

  it("a degenerate eligible target (sparse grading) falls back to the calendar rate", () => {
    // 20h "eligible" against a ~133h calendar month would price ₹175/h and pay
    // the full figure for three days of work — the guard refuses it.
    const r = computeHourlySalary({ ...h, eligibleTargetHours: 20, workedMinutes: 60 * 60 });
    expect(r.hourlyRate).toBeCloseTo(3500 / (30 * (31 / 7)), 2);
  });

  it("without surplus eligibility the cap still lands on the monthly figure", () => {
    const r = computeHourlySalary({ ...h, overtimeEligible: false, workedMinutes: 174 * 60 });
    expect(r.gross).toBe(3500);
    expect(r.overtimeHours).toBe(0);
  });
});

describe("computeFixedFeeSalary (project)", () => {
  it("gross = fee, net = fee − tds − advances + pending, no PT", () => {
    const r = computeFixedFeeSalary({ monthlyFee: 20000, tdsMonthly: 1000, advances: 2000, pendingBalanceIn: 500 });
    expect(r.gross).toBe(20000);
    expect(r.pt).toBe(0);
    expect(r.net).toBe(17500);
    expect(r.basis).toBe("fixed_fee");
    expect(r.fee).toBe(20000);
  });
});
