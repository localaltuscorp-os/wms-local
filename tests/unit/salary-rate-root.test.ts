import { describe, expect, it } from "vitest";
import {
  computeDailySalary,
  computeHourlySalary,
  deriveSalaryRate,
} from "@/lib/salary/compute";
import { isHoursPayrollMonth } from "@/lib/attendance/payroll-month";

const MONTHLY_SALARY = 5_000;
const AUGUST_DAYS = 31;
const SCHEDULE_HOURS = 8;

describe("salary-rate root", () => {
  it("uses actual month length before configured schedule hours", () => {
    const august = deriveSalaryRate({
      monthlySalary: MONTHLY_SALARY,
      daysInMonth: AUGUST_DAYS,
      workingHoursPerDay: SCHEDULE_HOURS,
    });
    expect(august.perDay).toBe(161.29);
    expect(august.perHour).toBe(20.16);

    expect(deriveSalaryRate({ monthlySalary: MONTHLY_SALARY, daysInMonth: 28, workingHoursPerDay: SCHEDULE_HOURS }).perDay).toBe(178.57);
    expect(deriveSalaryRate({ monthlySalary: MONTHLY_SALARY, daysInMonth: 29, workingHoursPerDay: SCHEDULE_HOURS }).perDay).toBe(172.41);
    expect(deriveSalaryRate({ monthlySalary: MONTHLY_SALARY, daysInMonth: 30, workingHoursPerDay: SCHEDULE_HOURS }).perDay).toBe(166.67);
  });

  it("keeps rate root identical while worker policy changes overtime only", () => {
    const employee = computeDailySalary({
      monthlySalary: MONTHLY_SALARY,
      daysInMonth: AUGUST_DAYS,
      workingHoursPerDay: SCHEDULE_HOURS,
      payableDayValue: AUGUST_DAYS,
      workedHours: 250,
      targetHours: 248,
      ptExempt: true,
      tdsMonthly: 0,
      advances: 0,
      pendingBalanceIn: 0,
    });
    const intern = computeHourlySalary({
      monthlyPayAtTarget: MONTHLY_SALARY,
      weeklyTargetHours: 48,
      daysInMonth: AUGUST_DAYS,
      workingHoursPerDay: SCHEDULE_HOURS,
      workedMinutes: 250 * 60,
      eligibleTargetHours: 248,
      overtimeEligible: true,
      ptExempt: true,
      tdsMonthly: 0,
      advances: 0,
      pendingBalanceIn: 0,
    });

    expect(employee.perDay).toBe(161.29);
    expect(intern.perDay).toBe(161.29);
    expect(employee.hourlyRate).toBe(20.16);
    expect(intern.hourlyRate).toBe(20.16);

    // Existing worker-type policy: full-time surplus is not paid; eligible
    // hourly/intern surplus is paid at the authoritative 1x hourly rate.
    expect(employee.overtimeHours).toBe(0);
    expect(employee.overtimeAmount).toBe(0);
    expect(employee.gross).toBe(5_000);
    expect(intern.overtimeHours).toBe(2);
    expect(intern.overtimeAmount).toBe(40.32);
    expect(intern.gross).toBe(5_040.32);
  });
});

describe("September 2026 salary-calculation cutoff", () => {
  it("preserves August and earlier history while pricing September onward", () => {
    expect(isHoursPayrollMonth("2026-08")).toBe(false);
    expect(isHoursPayrollMonth("2026-09")).toBe(true);
    expect(isHoursPayrollMonth("2026-10")).toBe(true);
  });

  it("uses each payroll month's calendar-day denominator", () => {
    const rate = (monthDays: number) => deriveSalaryRate({
      monthlySalary: MONTHLY_SALARY,
      daysInMonth: monthDays,
      workingHoursPerDay: SCHEDULE_HOURS,
    });
    expect(rate(30).perDay).toBe(166.67);
    expect(rate(31).perDay).toBe(161.29);
    expect(rate(28).perDay).toBe(178.57);
    expect(rate(29).perDay).toBe(172.41);
  });
});

describe("Layer 2 deduction chain — synthetic employee and intern", () => {
  const monthlyDaily = (payableDayValue: number, overrides: Partial<Parameters<typeof computeDailySalary>[0]> = {}) => computeDailySalary({
    monthlySalary: MONTHLY_SALARY,
    daysInMonth: AUGUST_DAYS,
    workingHoursPerDay: SCHEDULE_HOURS,
    payableDayValue,
    ptExempt: true,
    tdsMonthly: 0,
    advances: 0,
    pendingBalanceIn: 0,
    ...overrides,
  });
  const hourlyIntern = (workedHours: number, overrides: Partial<Parameters<typeof computeHourlySalary>[0]> = {}) => computeHourlySalary({
    monthlyPayAtTarget: MONTHLY_SALARY,
    weeklyTargetHours: 48,
    daysInMonth: AUGUST_DAYS,
    workingHoursPerDay: SCHEDULE_HOURS,
    workedMinutes: workedHours * 60,
    eligibleTargetHours: 248,
    overtimeEligible: true,
    ptExempt: true,
    tdsMonthly: 0,
    advances: 0,
    pendingBalanceIn: 0,
    ...overrides,
  });

  it("uses the same August rate root for full-time daily and intern hourly pay", () => {
    const employee = monthlyDaily(31);
    const intern = hourlyIntern(248);

    expect(employee.perDay).toBe(161.29);
    expect(employee.hourlyRate).toBe(20.16);
    expect(employee.gross).toBe(5_000);
    expect(intern.perDay).toBe(161.29);
    expect(intern.hourlyRate).toBe(20.16);
    expect(intern.gross).toBe(5_000);
  });

  it("prices one unpaid day and one half day from actual calendar-day salary", () => {
    expect(monthlyDaily(30).gross).toBe(4_838.71);
    expect(monthlyDaily(30.5).gross).toBe(4_919.35);
    expect(hourlyIntern(240).gross).toBe(4_838.71);
    expect(hourlyIntern(244).gross).toBe(4_919.35);
  });

  it("prices two unpaid intern working hours from the Layer 1 hourly rate", () => {
    const complete = hourlyIntern(248);
    const shortfall = hourlyIntern(246);
    expect(complete.gross - shortfall.gross).toBeCloseTo(40.32, 2);
    expect(shortfall.gross).toBe(4_959.68);
  });

  it("keeps eligible overtime as earnings, including with an unpaid day", () => {
    const overtime = hourlyIntern(250);
    const overtimeWithUnpaidDay = hourlyIntern(242, { eligibleTargetHours: 240 });
    expect(overtime.overtimeHours).toBe(2);
    expect(overtime.overtimeAmount).toBe(40.32);
    expect(overtime.gross).toBe(5_040.32);
    expect(overtimeWithUnpaidDay.overtimeHours).toBe(2);
    expect(overtimeWithUnpaidDay.gross).toBe(4_879.03);
  });

  it("carries PT, TDS, advance, and pending balance exactly once", () => {
    const result = monthlyDaily(31, {
      ptExempt: false,
      tdsMonthly: 100,
      advances: 500,
      pendingBalanceIn: 50,
    });
    expect(result.gross).toBe(5_000);
    expect(result.pt).toBe(200);
    expect(result.tds).toBe(100);
    expect(result.advances).toBe(500);
    expect(result.pendingBalanceIn).toBe(50);
    expect(result.net).toBe(4_250);
  });
});
