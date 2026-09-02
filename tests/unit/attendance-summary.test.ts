import { describe, it, expect } from "vitest";
import { summarize, type SummaryDay } from "@/lib/attendance/summary";
import type { DayCodeResult } from "@/lib/attendance/status";

function day(
  date: string,
  weekKey: string,
  res: Partial<DayCodeResult> & { code: DayCodeResult["code"]; dayValue: number; workedMinutes: number },
  opts: { offDay?: boolean; elapsed?: boolean } = {},
): SummaryDay {
  return {
    date,
    weekKey,
    offDay: opts.offDay ?? false,
    elapsed: opts.elapsed ?? true,
    result: {
      late: false,
      leftEarly: false,
      lateWaived: false,
      ...res,
    } as DayCodeResult,
  };
}

const P = (date: string, wk: string, extra: Partial<DayCodeResult> = {}) =>
  day(date, wk, { code: "P", dayValue: 1, workedMinutes: 540, ...extra });
const HD = (date: string, wk: string, extra: Partial<DayCodeResult> = {}) =>
  day(date, wk, { code: "H/D", dayValue: 0.5, workedMinutes: 300, ...extra });

describe("attendance summarize", () => {
  it("54h of ordinary attendance earns a full 6-day week", () => {
    // 6 days × 9h = 54h exactly. One day was late + a half-day on paper.
    const wk = "2026-07-06";
    const days = [
      P("2026-07-06", wk),
      P("2026-07-07", wk, { late: true }), // late but full 9h
      P("2026-07-08", wk),
      P("2026-07-09", wk),
      P("2026-07-10", wk),
      day("2026-07-11", wk, { code: "H/D", dayValue: 0.5, workedMinutes: 540, late: true }), // odd but 9h
    ];
    const s = summarize(days, 1000);
    // HOURS RULE (2026-08): 54h of ordinary attendance earns the full 6 days, so
    // there is nothing to deduct. The late / half-day MARKS are still counted and
    // shown — they tell the employee what happened — they simply no longer drive
    // a deduction, because the hours already reflect the shortfall (or lack of
    // one). Under the old all-or-nothing waiver these were zeroed out entirely.
    expect(s.workingDays).toBe(6);
    expect(s.presentDays).toBe(6);
    expect(s.salaryReduced).toBe(0);
    expect(s.deductionDays).toBe(0);
    expect(s.lateDays).toBe(2);
    expect(s.halfDays).toBe(1);
  });

  it("under 54h, days are earned proportionally from hours (9h = 1 day)", () => {
    const wk = "2026-07-13";
    const days = [
      P("2026-07-13", wk, { late: true }), // late mark 1
      P("2026-07-14", wk, { leftEarly: true }), // early mark 2
      P("2026-07-15", wk, { late: true }), // late mark 3 → +0.5 deduction
      HD("2026-07-16", wk), // half day → 0.5 short
      day("2026-07-17", wk, { code: "A", dayValue: 0, workedMinutes: 0 }), // absent
    ]; // total worked = 540*3 + 300 = 1920 min < 3240 → no waiver
    const s = summarize(days, 1000);
    expect(s.workingDays).toBe(5);
    // 1920 worked minutes ÷ 540 (9h) = 3.55 → 3.5 days to the nearest half.
    expect(s.presentDays).toBe(3.5);
    // Marks are still surfaced as information…
    expect(s.lateDays).toBe(2);
    expect(s.earlyDays).toBe(1);
    expect(s.halfDays).toBe(1);
    expect(s.absentDays).toBe(1);
    // …but the old "every 3 marks costs half a day" cut is RETIRED: arriving
    // late already lands as fewer worked hours, so charging for it again
    // deducted twice for one event.
    expect(s.markDeductionDays).toBe(0);
    // deduction = 5 expected − 3.5 earned = 1.5 → ₹1500
    expect(s.deductionDays).toBe(1.5);
    expect(s.salaryReduced).toBe(1500);
  });

  it("ignores off-days and future (non-elapsed) days", () => {
    const wk = "2026-07-13";
    const days = [
      P("2026-07-13", wk),
      day("2026-07-19", wk, { code: "W/O", dayValue: 1, workedMinutes: 0 }, { offDay: true }),
      P("2026-07-20", "2026-07-20", {}), // future
    ];
    days[2]!.elapsed = false;
    const s = summarize(days, 1000);
    expect(s.workingDays).toBe(1);
    expect(s.presentDays).toBe(1);
  });
});
