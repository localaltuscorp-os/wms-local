import { describe, it, expect } from "vitest";
import {
  leaveDays,
  leaveDaysInWindow,
  isHalfLeaveDay,
} from "@/lib/attendance/leave-cycle";
import { computeDayCode } from "@/lib/attendance/status";
import type { AttendanceSchedule } from "@/lib/attendance/schedule";

/**
 * HALF-DAY LEAVE BOUNDARIES (0208).
 *
 * The case the feature was asked for is the one at the top: out from the second
 * half of 24 Sep, back on the second half of 30 Sep. Every other test here
 * exists because getting that one right is easy to do in a way that is wrong
 * everywhere else — at a period boundary, on a single day, or in the grader.
 */

const SCHED: AttendanceSchedule = {
  lateAfter: "10:45",
  earlyBefore: "19:30",
  fullDayMinutes: 420, // 7h
  halfDayMinutes: 300, // 5h
};

describe("leaveDays", () => {
  it("the asked-for case: 24 Sep 2nd half → 30 Sep 1st half is 6 days, not 7", () => {
    expect(
      leaveDays({
        startDate: "2026-09-24",
        endDate: "2026-09-30",
        startHalfDay: true,
        endHalfDay: true,
      }),
    ).toBe(6);
  });

  it("a plain range is the inclusive count", () => {
    expect(leaveDays({ startDate: "2026-09-24", endDate: "2026-09-30" })).toBe(7);
  });

  it("one half boundary shaves exactly half a day", () => {
    expect(
      leaveDays({ startDate: "2026-09-24", endDate: "2026-09-30", startHalfDay: true }),
    ).toBe(6.5);
    expect(
      leaveDays({ startDate: "2026-09-24", endDate: "2026-09-30", endHalfDay: true }),
    ).toBe(6.5);
  });

  it("a single day with either flag is half a day", () => {
    expect(leaveDays({ startDate: "2026-09-24", endDate: "2026-09-24", startHalfDay: true })).toBe(0.5);
    expect(leaveDays({ startDate: "2026-09-24", endDate: "2026-09-24", endHalfDay: true })).toBe(0.5);
  });

  it("a single day flagged at BOTH ends is still half a day, never zero", () => {
    // The DB CHECK refuses this combination; the clamp is what keeps the
    // arithmetic honest for anything already stored, and stops a leave that
    // costs nothing.
    expect(
      leaveDays({
        startDate: "2026-09-24",
        endDate: "2026-09-24",
        startHalfDay: true,
        endHalfDay: true,
      }),
    ).toBe(0.5);
  });

  it("an inverted range is zero, not negative", () => {
    expect(leaveDays({ startDate: "2026-09-30", endDate: "2026-09-24" })).toBe(0);
  });

  it("a two-day leave half at both ends is one day", () => {
    expect(
      leaveDays({
        startDate: "2026-09-24",
        endDate: "2026-09-25",
        startHalfDay: true,
        endHalfDay: true,
      }),
    ).toBe(1);
  });
});

describe("leaveDaysInWindow", () => {
  const SEP = { from: "2026-04-01", to: "2026-09-30" };

  it("charges a half only when the day carrying it is inside the window", () => {
    // Starts 29 Sep (2nd half), runs to 3 Oct (1st half). Apr–Sep sees the
    // half-day start and two full days of continuation; the October half
    // belongs to the next period entirely.
    const span = {
      startDate: "2026-09-29",
      endDate: "2026-10-03",
      startHalfDay: true,
      endHalfDay: true,
    };
    expect(leaveDaysInWindow(span, SEP.from, SEP.to)).toBe(1.5); // 29th half + 30th
  });

  it("a clipped edge is a full day — it is not the boundary the flag names", () => {
    // The leave's own start is in August, so the window's 1 Sep edge carries no
    // half: the employee was on leave for all of it.
    const span = {
      startDate: "2026-08-28",
      endDate: "2026-09-02",
      startHalfDay: true,
      endHalfDay: true,
    };
    expect(leaveDaysInWindow(span, "2026-09-01", "2026-09-30")).toBe(1.5); // 1st full + 2nd half
  });

  it("no overlap is zero", () => {
    expect(
      leaveDaysInWindow({ startDate: "2026-11-01", endDate: "2026-11-03" }, SEP.from, SEP.to),
    ).toBe(0);
  });

  it("a one-day overlap that is the flagged boundary costs half", () => {
    expect(
      leaveDaysInWindow(
        { startDate: "2026-09-30", endDate: "2026-10-04", startHalfDay: true },
        SEP.from,
        SEP.to,
      ),
    ).toBe(0.5);
  });
});

describe("isHalfLeaveDay", () => {
  const span = {
    startDate: "2026-09-24",
    endDate: "2026-09-30",
    startHalfDay: true,
    endHalfDay: true,
  };

  it("names both boundaries and nothing in between", () => {
    expect(isHalfLeaveDay(span, "2026-09-24")).toBe(true);
    expect(isHalfLeaveDay(span, "2026-09-30")).toBe(true);
    expect(isHalfLeaveDay(span, "2026-09-27")).toBe(false);
  });

  it("is false for a boundary that was not flagged", () => {
    expect(isHalfLeaveDay({ startDate: "2026-09-24", endDate: "2026-09-30" }, "2026-09-24")).toBe(
      false,
    );
  });

  it("a single flagged day is half whichever flag carried it", () => {
    expect(
      isHalfLeaveDay(
        { startDate: "2026-09-24", endDate: "2026-09-24", endHalfDay: true },
        "2026-09-24",
      ),
    ).toBe(true);
  });
});

describe("computeDayCode on a half-leave day", () => {
  const ctx = (leave: "paid" | "unpaid", half: boolean) => ({
    isWeeklyOff: false,
    isHoliday: false,
    leave,
    leaveHalf: half,
  });

  it("a FULL paid leave still grades PL at full value", () => {
    const r = computeDayCode({ inAt: null, outAt: null }, SCHED, ctx("paid", false), "23:59");
    expect(r.code).toBe("PL");
    expect(r.dayValue).toBe(1);
  });

  it("half PAID leave + the half worked = a full day", () => {
    // 10:30 → 16:00 is 330 minutes, over the 300-minute half-day threshold.
    const r = computeDayCode({ inAt: "10:30", outAt: "16:00" }, SCHED, ctx("paid", true), "23:59");
    expect(r.code).toBe("P");
    expect(r.dayValue).toBe(1);
  });

  it("half PAID leave with no work is still worth the paid half", () => {
    const r = computeDayCode({ inAt: null, outAt: null }, SCHED, ctx("paid", true), "23:59");
    expect(r.code).toBe("H/D");
    expect(r.dayValue).toBe(0.5);
  });

  it("half UNPAID leave + the half worked = half a day", () => {
    const r = computeDayCode({ inAt: "10:30", outAt: "16:00" }, SCHED, ctx("unpaid", true), "23:59");
    expect(r.code).toBe("H/D");
    expect(r.dayValue).toBe(0.5);
  });

  it("half UNPAID leave with no work earns nothing", () => {
    const r = computeDayCode({ inAt: null, outAt: null }, SCHED, ctx("unpaid", true), "23:59");
    expect(r.code).toBe("A");
    expect(r.dayValue).toBe(0);
  });

  it("the half is measured against the HALF-day threshold, not the full one", () => {
    // 330 minutes is short of a full day (420) but is a complete half. Reusing
    // the three-tier rule would grade this a shortfall on a day where the
    // employee did exactly what was agreed.
    const r = computeDayCode({ inAt: "10:30", outAt: "16:00" }, SCHED, ctx("paid", true), "23:59");
    expect(r.dayValue).toBe(1);
  });

  it("late and early marks are suppressed on a half-leave day", () => {
    // Back from a morning's leave at 14:00 — long after `lateAfter`, and exactly
    // as approved. A late mark here carries a payroll deduction for keeping the
    // arrangement.
    const r = computeDayCode({ inAt: "14:00", outAt: "19:30" }, SCHED, ctx("paid", true), "23:59");
    expect(r.late).toBe(false);
    expect(r.leftEarly).toBe(false);
  });
});
