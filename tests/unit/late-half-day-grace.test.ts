import { describe, expect, it } from "vitest";
import { reconcileMonth, type GradedDayInput } from "@/lib/attendance/hour-balance";
import { weekKeyOf } from "@/lib/attendance/hours-rule";

const OPTIONS = {
  weeklyTargetMinutes: 54 * 60,
  waiverThresholdMinutes: 54 * 60,
  workingDaysPerWeek: 6,
};

function lateHalfDays(): GradedDayInput[] {
  return Array.from({ length: 5 }, (_, index) => {
    const date = `2026-09-${String(7 + index).padStart(2, "0")}`;
    return {
      date,
      weekKey: weekKeyOf(date),
      code: "H/D",
      dayValue: 0.5,
      workedMinutes: 8 * 60,
      late: true,
      leftEarly: false,
    };
  });
}

describe("late half-day grace", () => {
  it("waives the first three late half-days in a missed-target week", () => {
    const result = reconcileMonth(lateHalfDays(), { month: "2026-09", ...OPTIONS });

    expect(result.halfDayCharges.map((charge) => charge.waived)).toEqual([
      true,
      true,
      true,
      false,
      false,
    ]);
    expect(result.warnedHalfDays).toBe(3);
    expect(result.chargeableHalfDays).toBe(2);
  });

  it("resets the three-day grace in a new week", () => {
    const nextWeek: GradedDayInput[] = lateHalfDays().slice(0, 1).map((day) => ({
      ...day,
      date: "2026-09-14",
      weekKey: weekKeyOf("2026-09-14"),
    }));
    const result = reconcileMonth([...lateHalfDays(), ...nextWeek], {
      month: "2026-09",
      ...OPTIONS,
    });

    expect(result.halfDayCharges.at(-1)).toMatchObject({ date: "2026-09-14", ordinal: 1, waived: true });
  });
});
