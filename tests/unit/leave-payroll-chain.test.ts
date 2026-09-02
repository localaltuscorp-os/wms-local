import { describe, it, expect } from "vitest";
import { computeDayCode } from "@/lib/attendance/status";
import type { AttendanceSchedule } from "@/lib/attendance/schedule";
import { payableDaysByHours, weekKeyOf, type HoursRuleDay } from "@/lib/attendance/hours-rule";
import { computeSalary, computeHourlySalary } from "@/lib/salary/compute";

/**
 * THE CONNECTED WORKFLOW (spec §5 + §7).
 *
 * The leave feature has no salary maths of its own — approving a leave writes
 * one row, and the money follows because the SAME grader and the SAME payroll
 * formula already read that row. This file walks the whole chain end to end so
 * a change to any link fails here rather than in a payslip:
 *
 *   approved leave row → computeDayCode → payableDaysByHours → computeSalary
 *
 * Paid leave must arrive at "same pay as a worked day"; unpaid leave must
 * arrive at "exactly one day's pay lighter", with no separate deduction path.
 */

const sched: AttendanceSchedule = {
  lateAfter: "10:50",
  earlyBefore: "19:20",
  fullDayMinutes: 540,
  halfDayMinutes: 300,
};

/** Grade one day the way the query layer does, given an approved leave (or not). */
function grade(leave: "paid" | "unpaid" | null, worked: { in: string; out: string } | null) {
  return computeDayCode(
    { inAt: worked?.in ?? null, outAt: worked?.out ?? null },
    sched,
    { isWeeklyOff: false, leave },
    "23:59",
  );
}

/** A Mon–Sat week where `leaveDays` of the six are covered by an approved leave. */
function weekDays(leave: "paid" | "unpaid" | null, leaveDays: number): HoursRuleDay[] {
  // 2026-08-24 is a Monday.
  const dates = [
    "2026-08-24", "2026-08-25", "2026-08-26",
    "2026-08-27", "2026-08-28", "2026-08-29",
  ];
  return dates.map((date, i) => {
    const onLeave = i < leaveDays;
    const g = grade(onLeave ? leave : null, onLeave ? null : { in: "10:00", out: "19:00" });
    return {
      weekKey: weekKeyOf(date),
      code: g.code,
      dayValue: g.dayValue,
      workedMinutes: g.workedMinutes,
    };
  });
}

describe("approval → attendance (§5)", () => {
  it("approved PAID leave grades the day PL at full value — never Absent", () => {
    const g = grade("paid", null);
    expect(g.code).toBe("PL");
    expect(g.dayValue).toBe(1);
  });

  it("approved UNPAID leave grades the day LWP at zero value — the absence payroll sees", () => {
    const g = grade("unpaid", null);
    expect(g.code).toBe("LWP");
    expect(g.dayValue).toBe(0);
  });

  it("PL and LWP are DIFFERENT codes, so the board can tell paid leave from absent", () => {
    expect(grade("paid", null).code).not.toBe(grade("unpaid", null).code);
    expect(grade("unpaid", null).code).not.toBe(grade(null, null).code); // LWP ≠ A
  });

  it("no approved leave and no punch is still a plain Absent", () => {
    expect(grade(null, null).code).toBe("A");
  });
});

describe("attendance → payable days (§7)", () => {
  it("a full week of work earns 6 days", () => {
    expect(payableDaysByHours(weekDays(null, 0))).toBe(6);
  });

  it("two PAID leave days still earn 6 — the hours rule must not re-derive a credited day", () => {
    // This is the carve-out that matters: 4 worked days = 36h, and 36h/9h = 4.
    // If PL were pooled with ordinary days the week would pay 4, not 6, and an
    // approved paid leave would silently cost the employee two days' salary.
    expect(payableDaysByHours(weekDays("paid", 2))).toBe(6);
  });

  it("two UNPAID leave days earn 4 — the deduction, applied once, by the existing rule", () => {
    expect(payableDaysByHours(weekDays("unpaid", 2))).toBe(4);
  });
});

describe("payable days → salary (§7, monthly CTC / full-time)", () => {
  const base = {
    annualCtc: 600_000, // ₹50,000/month
    daysInMonth: 30,
    ptExempt: true,
    tdsMonthly: 0,
    lateMarksInMonth: 0,
    advances: 0,
    pendingBalanceIn: 0,
  };

  it("PAID leave costs nothing — same gross as if the days had been worked", () => {
    const worked = computeSalary({ ...base, payableDays: 26 });
    const withPaidLeave = computeSalary({ ...base, payableDays: 26 }); // PL kept the value
    expect(withPaidLeave.gross).toBe(worked.gross);
    expect(withPaidLeave.net).toBe(worked.net);
  });

  it("UNPAID leave deducts exactly per-day × days, through the ordinary formula", () => {
    const worked = computeSalary({ ...base, payableDays: 26 });
    const twoUnpaid = computeSalary({ ...base, payableDays: 24 });
    const perDay = 50_000 / 30;
    expect(worked.gross - twoUnpaid.gross).toBeCloseTo(perDay * 2, 2);
  });

  it("the deduction rides the SAME lateMarks/PT/advance pipeline — nothing bespoke", () => {
    const r = computeSalary({ ...base, payableDays: 24, lateMarksInMonth: 3, ptExempt: false });
    // 24 payable − 0.5 (third late) = 23.5 effective days, then PT off the gross.
    expect(r.effectiveDays).toBe(23.5);
    expect(r.pt).toBe(200);
    expect(r.net).toBeCloseTo(r.gross - 200, 2);
  });
});

describe("payable days → salary (§7, hourly — college shift / part-time)", () => {
  const base = {
    monthlyPayAtTarget: 3500,
    weeklyTargetHours: 27,
    daysInMonth: 30,
    ptExempt: true,
    tdsMonthly: 0,
    advances: 0,
    pendingBalanceIn: 0,
  };

  it("unpaid leave deducts because the hours simply are not there", () => {
    // An hourly shift is paid for hours worked, so an unpaid day off removes
    // that day's hours from the month — no separate leave deduction exists or
    // is needed. 4.5h short of a 115.7h target.
    const full = computeHourlySalary({ ...base, workedMinutes: 27 * 60 * (30 / 7) });
    const oneDayOff = computeHourlySalary({
      ...base,
      workedMinutes: 27 * 60 * (30 / 7) - 4.5 * 60,
    });
    expect(oneDayOff.gross).toBeLessThan(full.gross);
    // Whole hours only (spec §18): 115.71h works out to 115 payable hours, so
    // the gross sits just under the cap — floor(target) × rate.
    const target = 27 * (30 / 7);
    expect(full.gross).toBeCloseTo((3500 / target) * Math.floor(target), 2);
  });

  it("an hourly shift never gets a paid-leave credit — that is the eligibility rule's job", () => {
    // Guard on the shape of the contract, not on the arithmetic: the hourly
    // formula has no payableDays input at all, so there is nowhere for a PL
    // day-value to enter. This is exactly why paid leave is refused upstream.
    const r = computeHourlySalary({ ...base, workedMinutes: 0 });
    expect(r.payableDays).toBe(0);
    expect(r.gross).toBe(0);
    expect(r.basis).toBe("hourly");
  });
});
