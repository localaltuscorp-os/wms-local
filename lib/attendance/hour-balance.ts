// WEEKLY HOUR RECONCILIATION + MONTHLY HOUR BALANCE.
//
// Pure (no DB, no Date) so it is unit-testable and so the self-view, the
// reports and the salary engine read one implementation.
//
// THE CORE SEPARATION (spec §5) — this module NEVER rewrites daily attendance.
// A Monday graded Half Day stays a Half Day forever; that record is auditable.
// What this module produces is a SECOND, parallel view: did the WEEK meet its
// hour requirement once surplus from earlier in the same month is applied. The
// two answers are allowed to differ, and both are reported.
//
//     Daily Attendance   ≠   Weekly Hour Reconciliation
//
// THE CARRY IS SIGNED (spec 2026-08) — BOTH directions travel week to week
// inside the month. A 58h week leaves +4h that LOWERS next week's effective
// target to 50h; a 50h week leaves −4h that RAISES it to 58h. The effective
// target is floored at zero so a huge surplus can never demand negative hours.
//
// MONTH BOUNDARY (spec §4) — balances are scoped to a calendar month and start
// at zero. August surplus can never pay for a September shortfall, and an
// August deficit never follows anyone into September. A week that straddles
// the boundary is split: each day is reconciled inside the month it actually
// falls in, and that week's target is prorated to the working days present in
// that portion, so a 2-day tail is never measured against a full 54-hour
// target.

import { isOrdinaryAttendanceDay } from "./hours-rule";

/** One graded day, exactly as the day engine produced it. Read-only here. */
export interface GradedDayInput {
  /** yyyy-mm-dd */
  date: string;
  /** Monday-anchored week bucket, yyyy-mm-dd (see hours-rule.weekKeyOf). */
  weekKey: string;
  code: string;
  dayValue: number;
  workedMinutes: number;
  late: boolean;
  leftEarly: boolean;
}

export interface WeekReconciliation {
  weekKey: string;
  /** yyyy-mm this week's portion belongs to. */
  month: string;
  /** Ordinary (punchable) days of this week that fall inside the month. */
  expectedDays: number;
  weeklyTargetMinutes: number;
  actualMinutes: number;
  /**
   * The SIGNED balance walking IN to this week from the earlier weeks of the
   * same month: positive = banked surplus, negative = outstanding deficit.
   * Always 0 for the month's first week (spec: months are independent).
   */
  carryInMinutes: number;
  /**
   * What this week actually had to produce once the carry is applied:
   * `max(0, target − carryIn)`. A +4h surplus turns 54h into 50h; a −4h
   * deficit turns it into 58h. Floored at zero — a target is never negative.
   */
  effectiveTargetMinutes: number;
  /** Hours beyond this week's own base target (raw, before any carry). */
  surplusMinutes: number;
  /** Shortfall still standing against the EFFECTIVE target after the carry. */
  deficitMinutes: number;
  /** Banked surplus actually spent covering this week's base-target shortfall. */
  balanceAppliedMinutes: number;
  /** SIGNED balance AFTER this week settled (may be negative — a deficit). */
  closingBalanceMinutes: number;
  /** actual ≥ effectiveTarget — the carry-adjusted requirement (spec §4–6). */
  requirementSatisfied: boolean;
  /**
   * Did RAW hours reach the waiver threshold (spec §6)? Deliberately ignores
   * the carried balance: the policy is about hours actually worked in that
   * calendar week, not hours borrowed from a previous one.
   */
  deviationsWaived: boolean;
}

export interface HalfDayCharge {
  date: string;
  /** 1-based index among the month's chargeable half-days. */
  ordinal: number;
  /** true for the first 3 (warning only), false from the 4th (salary-impacting). */
  waived: boolean;
}

export interface MonthReconciliation {
  month: string;
  weeks: WeekReconciliation[];
  /**
   * SIGNED balance at month end: totalActual − totalTarget. Positive surplus
   * simply dies here (it is a target-balancing device, never pay — spec §14/§15);
   * negative is the month's unmet hours, which the salary engine prices.
   * Never carried out of the month.
   */
  monthlyHourBalanceMinutes: number;
  totalTargetMinutes: number;
  totalActualMinutes: number;
  /** Half-days that survived the weekly waiver, in date order. */
  halfDayCharges: HalfDayCharge[];
  /** Count charged at 50% of a day's salary (the 4th onward). */
  chargeableHalfDays: number;
  /** Count waived by the 3-per-month grace (warning only). */
  warnedHalfDays: number;
  /** Half-days removed by the weekly-hours waiver — these do NOT use a grace slot. */
  waiverAbsorbedHalfDays: number;
}

/** How many of the month's half-days are forgiven before salary is touched. */
export const MONTHLY_HALF_DAY_GRACE = 3;

/** Each chargeable half-day costs half of that day's salary. */
export const HALF_DAY_SALARY_FRACTION = 0.5;

/** yyyy-mm-dd → yyyy-mm. */
export function monthKeyOf(ymd: string): string {
  return ymd.slice(0, 7);
}

/**
 * Reconcile one employee's month.
 *
 * `weeklyTargetMinutes` and `waiverThresholdMinutes` come from that employee's
 * resolved config (lib/attendance/effective-config.ts) — a part-timer is
 * measured against 27h and waived at 27h, never at 54h.
 */
export function reconcileMonth(
  days: GradedDayInput[],
  opts: {
    month: string;
    weeklyTargetMinutes: number;
    waiverThresholdMinutes: number;
    workingDaysPerWeek: number;
  },
): MonthReconciliation {
  const { month, weeklyTargetMinutes, waiverThresholdMinutes, workingDaysPerWeek } = opts;

  // Only this month's days. A straddling week contributes just its in-month part.
  const inMonth = days
    .filter((d) => monthKeyOf(d.date) === month)
    .sort((a, b) => a.date.localeCompare(b.date));

  // Group by week, preserving chronological order of first appearance.
  const weekOrder: string[] = [];
  const byWeek = new Map<string, GradedDayInput[]>();
  for (const d of inMonth) {
    let arr = byWeek.get(d.weekKey);
    if (!arr) {
      arr = [];
      byWeek.set(d.weekKey, arr);
      weekOrder.push(d.weekKey);
    }
    arr.push(d);
  }

  /** SIGNED running carry: Σ(actual − target) over the weeks settled so far. */
  let balance = 0;
  let totalTarget = 0;
  let totalActual = 0;
  const weeks: WeekReconciliation[] = [];
  /** Week keys whose deviations the hours waiver cleared. */
  const waivedWeeks = new Set<string>();

  for (const weekKey of weekOrder) {
    const week = byWeek.get(weekKey)!;

    // Only ORDINARY days (P / H/D / A) carry an hour expectation. Paid leave,
    // comp-off, holidays and weekly offs expect no hours, so counting them
    // would invent a deficit the employee could never have worked off.
    const ordinary = week.filter((d) => isOrdinaryAttendanceDay(d.code));
    const expectedDays = ordinary.length;
    const actualMinutes = ordinary.reduce((s, d) => s + d.workedMinutes, 0);

    // Prorate: a partial week (month boundary, mid-month joiner, a week full of
    // holidays) is measured only against the days it actually owed.
    const target = Math.round(
      (weeklyTargetMinutes * expectedDays) / Math.max(1, workingDaysPerWeek),
    );

    // BOTH directions carry (spec §5/§6): surplus banked earlier lowers this
    // week's effective target, a deficit raises it — never below zero.
    const carryIn = balance;
    const effectiveTarget = Math.max(0, target - carryIn);

    const net = actualMinutes - target;
    const surplus = net > 0 ? net : 0;
    // Banked surplus actually consumed by this week's base-target shortfall —
    // kept for display ("2h of last week's surplus covered Tuesday").
    const balanceApplied =
      net < 0 ? Math.min(Math.max(carryIn, 0), -net) : 0;

    balance = carryIn + net;

    const requirementSatisfied = actualMinutes >= effectiveTarget;

    // Waiver is on RAW weekly hours against this employee's own threshold,
    // prorated the same way so a short week is not held to a full-week bar.
    const waiverBar = Math.round(
      (waiverThresholdMinutes * expectedDays) / Math.max(1, workingDaysPerWeek),
    );
    const deviationsWaived = expectedDays > 0 && actualMinutes >= waiverBar;
    if (deviationsWaived) waivedWeeks.add(weekKey);

    totalTarget += target;
    totalActual += actualMinutes;

    weeks.push({
      weekKey,
      month,
      expectedDays,
      weeklyTargetMinutes: target,
      actualMinutes,
      carryInMinutes: carryIn,
      effectiveTargetMinutes: effectiveTarget,
      surplusMinutes: surplus,
      deficitMinutes: Math.max(0, effectiveTarget - actualMinutes),
      balanceAppliedMinutes: balanceApplied,
      closingBalanceMinutes: balance,
      requirementSatisfied,
      deviationsWaived,
    });
  }

  // ── Monthly half-day grace (spec §7) ─────────────────────────────────────
  // A half-day inside a waived week is absorbed by the weekly-hours waiver and
  // must NOT consume one of the three monthly grace slots.
  const halfDayCharges: HalfDayCharge[] = [];
  let waiverAbsorbed = 0;
  let ordinal = 0;

  for (const d of inMonth) {
    if (d.code !== "H/D") continue;
    if (waivedWeeks.has(d.weekKey)) {
      waiverAbsorbed += 1;
      continue;
    }
    ordinal += 1;
    halfDayCharges.push({
      date: d.date,
      ordinal,
      waived: ordinal <= MONTHLY_HALF_DAY_GRACE,
    });
  }

  return {
    month,
    weeks,
    monthlyHourBalanceMinutes: balance,
    totalTargetMinutes: totalTarget,
    totalActualMinutes: totalActual,
    halfDayCharges,
    chargeableHalfDays: halfDayCharges.filter((c) => !c.waived).length,
    warnedHalfDays: halfDayCharges.filter((c) => c.waived).length,
    waiverAbsorbedHalfDays: waiverAbsorbed,
  };
}

/**
 * Day-value deduction owed for the month's chargeable half-days, in DAYS.
 * The salary engine multiplies this by the per-day rate it already computes —
 * this module deliberately does not know about money (spec §11).
 */
export function halfDayDeductionDays(m: MonthReconciliation): number {
  return m.chargeableHalfDays * HALF_DAY_SALARY_FRACTION;
}

/* ────────────────────────────────────────────────────────────────────────────
   PAYABLE HOURS — the bridge from graded attendance to payroll (spec §13).

   The order below is the spec's, and the order matters:

     scheduled working days  (weekly offs + holidays already excluded, because
                              those days never grade as ordinary attendance)
        ↓ target hours
     actual worked hours
        ↓ MONTH-LEVEL netting: payable = min(actual, target) across the whole
          month, so a short week later repaid — in either order — costs nothing
          (spec §9: no deduction for one sub-54h week if the running month is
          eventually square), while hours beyond the month's requirement never
          become pay (spec §14/§15: surplus balances targets, it is not money)
        ↓ credited days (paid leave / comp-off / holiday-working) paid at target
     final payable hours
        ↓ ROUNDED DOWN to a whole hour (spec §2)
     × hourly rate  =  salary

   Holidays need no special case here: a holiday grades "H", which is not an
   ordinary attendance day, so it contributes to NEITHER target nor payable and
   the month's requirement falls by exactly one day automatically (spec §3/§5).
   ──────────────────────────────────────────────────────────────────────────── */

/** Day codes that are PAID but expect no hours — credited at the daily target. */
const PAID_CREDITED_CODES = new Set(["PL", "CO", "HP", "H-H/D"]);

export interface PayableHoursResult {
  /** Hours the employee was actually required to work this month. */
  targetMinutes: number;
  /** Precise worked minutes — kept for reporting, NOT used for salary. */
  actualMinutes: number;
  /** After rebalancing + credited days, before rounding. */
  payableMinutesRaw: number;
  /** Whole hours, ROUNDED DOWN (53.8h → 53h). This is what salary uses. */
  payableHours: number;
  /** Target expressed in hours (may be fractional, e.g. 22.5 part-time). */
  targetHours: number;
  /** Minutes credited for paid-but-not-worked days. */
  creditedMinutes: number;
  /**
   * Hours worked BEYOND everything the month required, netted across the whole
   * month — `max(0, totalActual − totalTarget)`, i.e. the positive side of the
   * signed month-end carry. A 25h week followed by a 29h week nets to zero:
   * the surplus was consumed covering the shortfall, and nothing is owed
   * either way. (Reported for the hourly-shift surplus display; a full-timer's
   * surplus is only ever a target-balancing device — spec §14.)
   */
  netSurplusMinutes: number;
}

/**
 * Convert one reconciled month into the hours payroll should pay for.
 *
 * `dailyTargetMinutes` is THIS employee's day (9h full-time, 4.5h part-time),
 * so a part-timer's paid leave is credited 4.5h, never 9h.
 */
export function payableHoursForMonth(
  days: GradedDayInput[],
  recon: MonthReconciliation,
  dailyTargetMinutes: number,
): PayableHoursResult {
  // Ordinary days: the MONTH-LEVEL net (spec §9). Hours are payable up to what
  // the whole month required — a 50h week followed by a 58h week is square and
  // pays in full, whichever order the two weeks came in. The min() is also what
  // stops hours beyond the month's requirement becoming pay: month-end surplus
  // balances targets (spec §14/§15), it is never money, and it dies here.
  const ordinaryPayable = Math.min(
    recon.totalActualMinutes,
    recon.totalTargetMinutes,
  );

  // Credited paid days expect no hours but must still be paid, so they add to
  // BOTH sides. Without that a month spent entirely on approved paid leave
  // would have a zero target, zero payable, and pay nothing.
  let creditedMinutes = 0;
  for (const d of days) {
    if (monthKeyOf(d.date) !== recon.month) continue;
    if (PAID_CREDITED_CODES.has(d.code)) creditedMinutes += dailyTargetMinutes;
  }

  const targetMinutes = recon.totalTargetMinutes + creditedMinutes;
  const payableMinutesRaw = ordinaryPayable + creditedMinutes;

  // Credited days sit on both sides of the comparison, so they cancel — a month
  // spent partly on approved paid leave is neither in surplus nor in deficit
  // because of that leave.
  const netSurplusMinutes = Math.max(
    0,
    recon.totalActualMinutes - recon.totalTargetMinutes,
  );

  return {
    targetMinutes,
    actualMinutes: recon.totalActualMinutes,
    netSurplusMinutes,
    payableMinutesRaw,
    // ROUND DOWN (spec §2): 53.8h and 53.9h both pay 53h. Never rounds up.
    payableHours: Math.floor(payableMinutesRaw / 60),
    targetHours: targetMinutes / 60,
    creditedMinutes,
  };
}
