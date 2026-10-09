import { describe, expect, it } from "vitest";
import {
  payableHoursForMonth,
  reconcileMonth,
  type GradedDayInput,
} from "@/lib/attendance/hour-balance";
import { weekKeyOf } from "@/lib/attendance/hours-rule";
import { computeDailySalary } from "@/lib/salary/compute";

const FULL_TIME_OPTIONS = {
  weeklyTargetMinutes: 54 * 60,
  waiverThresholdMinutes: 54 * 60,
  workingDaysPerWeek: 6,
};

function sixDayWeek(
  monday: string,
  minutesPerDay: number,
  lateCount = 0,
): GradedDayInput[] {
  const start = new Date(`${monday}T00:00:00Z`);
  return Array.from({ length: 6 }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    const ymd = date.toISOString().slice(0, 10);
    return {
      date: ymd,
      weekKey: weekKeyOf(ymd),
      code: "P",
      dayValue: 1,
      workedMinutes: minutesPerDay,
      late: index < lateCount,
      leftEarly: false,
    };
  });
}

describe("October 2026 weekly late-mark policy", () => {
  it("charges two half-days for four late marks below 54 hours, then one more for each late", () => {
    const four = reconcileMonth(sixDayWeek("2026-10-05", 530, 4), {
      month: "2026-10",
      ...FULL_TIME_OPTIONS,
    });
    const five = reconcileMonth(sixDayWeek("2026-10-05", 530, 5), {
      month: "2026-10",
      ...FULL_TIME_OPTIONS,
    });
    const six = reconcileMonth(sixDayWeek("2026-10-05", 530, 6), {
      month: "2026-10",
      ...FULL_TIME_OPTIONS,
    });

    expect(four.weeks[0]?.actualMinutes).toBe(53 * 60);
    expect(four.latePenaltyHalfDays).toBe(2);
    expect(five.latePenaltyHalfDays).toBe(3);
    expect(six.latePenaltyHalfDays).toBe(4);
  });

  it("does not apply a late-mark deduction once the 54-hour weekly target is met", () => {
    const result = reconcileMonth(sixDayWeek("2026-10-05", 540, 6), {
      month: "2026-10",
      ...FULL_TIME_OPTIONS,
    });

    expect(result.weeks[0]?.actualMinutes).toBe(54 * 60);
    expect(result.weeks[0]?.lateMarks).toBe(6);
    expect(result.latePenaltyHalfDays).toBe(0);
  });

  it("does not retroactively apply the policy to September", () => {
    const result = reconcileMonth(sixDayWeek("2026-09-07", 530, 6), {
      month: "2026-09",
      ...FULL_TIME_OPTIONS,
    });

    expect(result.latePenaltyHalfDays).toBe(0);
  });

  it("does not let a long week pay for a later short week", () => {
    const octoberDays = [
      ...sixDayWeek("2026-10-05", 580), // 58h
      ...sixDayWeek("2026-10-12", 500), // 50h
    ];
    const october = reconcileMonth(octoberDays, {
      month: "2026-10",
      ...FULL_TIME_OPTIONS,
    });
    const octoberPayable = payableHoursForMonth(octoberDays, october, 540);

    expect(october.weeks[1]?.carryInMinutes).toBe(0);
    expect(october.weeks[1]?.effectiveTargetMinutes).toBe(54 * 60);
    expect(octoberPayable.payableHours).toBe(104);

    const septemberDays = [
      ...sixDayWeek("2026-09-07", 580),
      ...sixDayWeek("2026-09-14", 500),
    ];
    const september = reconcileMonth(septemberDays, {
      month: "2026-09",
      ...FULL_TIME_OPTIONS,
    });
    const septemberPayable = payableHoursForMonth(septemberDays, september, 540);

    expect(september.weeks[1]?.carryInMinutes).toBe(4 * 60);
    expect(septemberPayable.payableHours).toBe(108);
  });

  it("prices each policy half-day as half of one day's salary", () => {
    const salary = computeDailySalary({
      monthlySalary: 31_000,
      daysInMonth: 31,
      payableDayValue: 31,
      latePenaltyHalfDays: 2,
      ptExempt: true,
      tdsMonthly: 0,
      advances: 0,
      pendingBalanceIn: 0,
    });

    expect(salary.lateDeductionDays).toBe(1);
    expect(salary.effectiveDays).toBe(30);
    expect(salary.gross).toBe(30_000);
  });
});
