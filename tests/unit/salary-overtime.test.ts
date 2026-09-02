import { describe, expect, it } from "vitest";
import { computeScheduleHourlySalary } from "@/lib/salary/compute";
import {
  payableHoursForMonth,
  reconcileMonth,
  type GradedDayInput,
} from "@/lib/attendance/hour-balance";
import { weekKeyOf } from "@/lib/attendance/hours-rule";
import { earnsOvertime, isHourlyShift } from "@/lib/attendance/worker-type";
import {
  defaultDailyMinutesFor,
  resolveEffectiveConfig,
} from "@/lib/attendance/effective-config";

/**
 * OVERTIME POLICY (Sir, 2026-08).
 *
 *   Full-time  — surplus hours are CREDIT against a short week inside the same
 *                month, never money. 56h in week 1 buys a 52h week later; the
 *                extra 2h is never paid.
 *   Interns    — part-time and afternoon/college shift are PAID for hours that
 *                survive to month end, at their normal hourly rate (1x).
 *
 * The netting is deliberately monthly: a 25h week followed by a 29h week is a
 * person who hit their target, not someone owed two hours.
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

describe("the hourly-shift category — one schedule for both", () => {
  it("gives afternoon/college shift the SAME day as part-time", () => {
    expect(defaultDailyMinutesFor("second_half")).toBe(5 * 60);
    expect(defaultDailyMinutesFor("second_half")).toBe(
      defaultDailyMinutesFor("hybrid"),
    );
  });

  it("keeps full-time and project/remote on the 9h day", () => {
    expect(defaultDailyMinutesFor("full_time")).toBe(9 * 60);
    expect(defaultDailyMinutesFor("project_remote")).toBe(9 * 60);
  });

  it("resolves a 30h week for BOTH hourly shifts, with no target set", () => {
    for (const workerType of ["hybrid", "second_half"] as const) {
      const cfg = resolveEffectiveConfig({ workerType }, {});
      expect(cfg.dailyTargetMinutes).toBe(5 * 60);
      expect(cfg.weeklyTargetMinutes).toBe(30 * 60);
    }
  });

  it("honours an admin-set weekly target on afternoon shift too", () => {
    const cfg = resolveEffectiveConfig(
      { workerType: "second_half", weeklyTargetMinutes: 20 * 60 },
      {},
    );
    expect(cfg.weeklyTargetMinutes).toBe(20 * 60);
  });

  it("agrees with the overtime gate about who is in the category", () => {
    for (const w of ["hybrid", "second_half"] as const) {
      expect(isHourlyShift(w)).toBe(true);
      expect(earnsOvertime(w)).toBe(true);
    }
    for (const w of ["full_time", "project_remote"] as const) {
      expect(isHourlyShift(w)).toBe(false);
    }
  });
});

describe("earnsOvertime — who is paid for extra hours", () => {
  it("pays the two hourly-graded shifts", () => {
    expect(earnsOvertime("hybrid")).toBe(true);
    expect(earnsOvertime("second_half")).toBe(true);
  });

  it("never pays a full-timer or a retainer", () => {
    expect(earnsOvertime("full_time")).toBe(false);
    expect(earnsOvertime("project_remote")).toBe(false);
  });
});

describe("computeScheduleHourlySalary — overtime money", () => {
  it("pays nothing extra when there is no surplus", () => {
    const r = computeScheduleHourlySalary({
      ...BASE,
      monthlySalary: 3500,
      payableHoursRaw: 117,
      overtimeHours: 0,
    });
    expect(r.overtimeHours).toBe(0);
    expect(r.overtimeAmount).toBe(0);
    expect(r.gross).toBe(3500);
  });

  it("pays surplus hours at the SAME hourly rate, on top of the base", () => {
    const r = computeScheduleHourlySalary({
      ...BASE,
      monthlySalary: 3500,
      payableHoursRaw: 117,
      overtimeHours: 4,
    });
    const rate = 3500 / 117; // ≈ 29.91
    expect(r.hourlyRate).toBeCloseTo(rate, 2);
    expect(r.overtimeHours).toBe(4);
    expect(r.overtimeAmount).toBeCloseTo(rate * 4, 2);
    // The base was already at the cap, so gross must exceed the monthly salary.
    expect(r.gross).toBeCloseTo(3500 + rate * 4, 1);
    expect(r.gross).toBeGreaterThan(3500);
  });

  /**
   * The cap on the base is what makes an over-target month pay the same as an
   * on-target one. Overtime has to be added OUTSIDE it or the whole feature is
   * silently a no-op.
   */
  it("adds overtime outside the monthly-salary cap", () => {
    const capped = computeScheduleHourlySalary({
      ...BASE,
      monthlySalary: 3500,
      payableHoursRaw: 200, // far beyond target; base still capped
      overtimeHours: 0,
    });
    expect(capped.gross).toBe(3500);

    const withOt = computeScheduleHourlySalary({
      ...BASE,
      monthlySalary: 3500,
      payableHoursRaw: 200,
      overtimeHours: 10,
    });
    expect(withOt.gross).toBeGreaterThan(capped.gross);
  });

  it("carries the overtime into net pay, and deductions still apply", () => {
    const r = computeScheduleHourlySalary({
      ...BASE,
      ptExempt: false, // PT is ₹200
      monthlySalary: 3500,
      payableHoursRaw: 117,
      overtimeHours: 2,
    });
    expect(r.net).toBeCloseTo(r.gross - 200, 2);
  });

  it("treats a negative overtime input as zero rather than a deduction", () => {
    const r = computeScheduleHourlySalary({
      ...BASE,
      monthlySalary: 3500,
      payableHoursRaw: 117,
      overtimeHours: -5,
    });
    expect(r.overtimeAmount).toBe(0);
    expect(r.gross).toBe(3500);
  });

  it("a full-timer passed 0 is paid exactly their salary despite long weeks", () => {
    const r = computeScheduleHourlySalary({
      monthlyTargetHours: 216,
      chargeableHalfDays: 0,
      dailyTargetHours: 9,
      ptExempt: true,
      tdsMonthly: 0,
      advances: 0,
      pendingBalanceIn: 0,
      monthlySalary: 40000,
      payableHoursRaw: 240, // 24h over
      overtimeHours: 0, // generate.ts gates this to 0 for full_time
    });
    expect(r.gross).toBe(40000);
    expect(r.overtimeAmount).toBe(0);
  });
});

/* ── The netting, end to end through reconcileMonth ──────────────────────── */

/** Six 4.5h-target weekdays for one week, each carrying `mins/6` worked. */
function week(dates: string[], totalMinutes: number): GradedDayInput[] {
  const per = totalMinutes / dates.length;
  return dates.map((date) => ({
    date,
    weekKey: weekKeyOf(date),
    code: "P",
    dayValue: 1,
    workedMinutes: per,
    late: false,
    leftEarly: false,
  }));
}

const W1 = ["2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06", "2026-08-07", "2026-08-08"];
const W2 = ["2026-08-10", "2026-08-11", "2026-08-12", "2026-08-13", "2026-08-14", "2026-08-15"];

/** An intern's week: 27h target, 4.5h days. */
const PART_TIME = {
  month: "2026-08",
  weeklyTargetMinutes: 27 * 60,
  waiverThresholdMinutes: 27 * 60,
  workingDaysPerWeek: 6,
};

/** A full-timer's week: 54h target, 9h days. */
const FULL_TIME = {
  ...PART_TIME,
  weeklyTargetMinutes: 54 * 60,
  waiverThresholdMinutes: 54 * 60,
};

/** The exact figure payroll pays overtime from, for a set of graded days. */
function netSurplusHours(
  days: GradedDayInput[],
  opts: typeof PART_TIME = PART_TIME,
): number {
  const recon = reconcileMonth(days, opts);
  const dailyMinutes = opts.weeklyTargetMinutes / opts.workingDaysPerWeek;
  return payableHoursForMonth(days, recon, dailyMinutes).netSurplusMinutes / 60;
}

describe("monthly netting decides what counts as overtime", () => {
  it("a short week then a long week nets to zero — no overtime, no deduction", () => {
    // 54h required, 54h worked — square. The raw carry-forward balance would
    // wrongly read +2h here, because it never spends a surplus on an EARLIER
    // deficit; that is precisely the bug this figure exists to avoid.
    expect(netSurplusHours([...week(W1, 25 * 60), ...week(W2, 29 * 60)])).toBe(0);
  });

  it("only the surplus that survives every short week becomes overtime", () => {
    // 58h worked against 54h required; 2h of the 6h surplus paid off week 1.
    expect(netSurplusHours([...week(W1, 25 * 60), ...week(W2, 33 * 60)])).toBe(4);
  });

  it("two on-target weeks leave nothing to pay", () => {
    expect(netSurplusHours([...week(W1, 27 * 60), ...week(W2, 27 * 60)])).toBe(0);
  });

  it("Sir's example: a full-timer doing 56h then 52h is square", () => {
    // 54h/week target. The 2h over in week one is exactly the 2h short in week
    // two, so the month owes nothing in either direction — and because a
    // full-timer is gated to 0 overtime anyway, it could never have paid.
    expect(netSurplusHours([...week(W1, 56 * 60), ...week(W2, 52 * 60)], FULL_TIME)).toBe(0);
  });

  it("a full-timer genuinely over target still nets a surplus — it is just never paid", () => {
    expect(netSurplusHours([...week(W1, 60 * 60), ...week(W2, 54 * 60)], FULL_TIME)).toBe(6);
  });

  it("a month that ends short has no surplus, so overtime is never negative", () => {
    expect(netSurplusHours([...week(W1, 20 * 60), ...week(W2, 22 * 60)])).toBe(0);
  });

  /** The full path: reconcile → gate by worker type → price it. */
  it("prices an intern's surviving surplus and leaves a full-timer's alone", () => {
    const surplus = netSurplusHours([...week(W1, 25 * 60), ...week(W2, 33 * 60)]);
    expect(surplus).toBe(4);

    const intern = computeScheduleHourlySalary({
      ...BASE,
      monthlySalary: 3500,
      payableHoursRaw: 117,
      overtimeHours: earnsOvertime("hybrid") ? surplus : 0,
    });
    expect(intern.overtimeHours).toBe(4);
    expect(intern.overtimeAmount).toBeGreaterThan(0);

    const fullTimer = computeScheduleHourlySalary({
      ...BASE,
      monthlySalary: 3500,
      payableHoursRaw: 117,
      overtimeHours: earnsOvertime("full_time") ? surplus : 0,
    });
    expect(fullTimer.overtimeAmount).toBe(0);
    expect(fullTimer.gross).toBe(3500);
  });
});
