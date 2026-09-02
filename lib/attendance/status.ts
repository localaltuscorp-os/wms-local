import type { AttendanceCode } from "@/db/enums";
import type { AttendanceSchedule } from "./schedule";

/** Parse a "HH:mm" clock string into minutes-since-midnight. */
export function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":");
  return parseInt(h ?? "0", 10) * 60 + parseInt(m ?? "0", 10);
}

/** Per-day context the engine needs. The query layer resolves whether the day
 *  is a weekly-off / holiday and whether an approved leave or redeemed comp-off
 *  applies, then passes the flags in. All Phase-B fields are optional so
 *  Phase-A callers are unaffected. */
export interface DayContext {
  isWeeklyOff: boolean;
  isHoliday?: boolean;
  leave?: "paid" | "unpaid" | null;
  /**
   * This day is a HALF-day of the approved leave — the boundary day whose other
   * half is worked (0208). Only meaningful alongside `leave`.
   *
   * WHY THE ENGINE HAS TO KNOW: without it, a half-day leave grades PL and hands
   * out a FULL day's credit while only half a day is deducted from the balance.
   * That is a silent over-credit with a rupee value, produced by the request
   * form and invisible to everyone reading the sheet.
   */
  leaveHalf?: boolean;
  compOffRedeemed?: boolean;
  /**
   * The out-punch was written by the compulsory-punch-out cron, not by the
   * employee.
   *
   * WHY THE ENGINE HAS TO KNOW: the cron stamps its out at the CLOCK-IN time, so
   * worked ≈ 0. Left to the ordinary three-tier rule that lands below the
   * half-day floor and grades ABSENT — the exact opposite of the policy the cron
   * is named after, and of the rule that a missing punch-out costs half a day
   * rather than all of it. Passing the flag lets the day be floored at H/D
   * without inventing a fake worked duration to get there.
   */
  autoClosed?: boolean;
}

export interface DayCodeResult {
  code: AttendanceCode;
  dayValue: number;
  late: boolean;
  leftEarly: boolean;
  lateWaived: boolean;
  workedMinutes: number;
}

/**
 * Pure day-code rules engine. Given a check-in/check-out pair, the resolved
 * schedule, the day context, and a reference "now" (HH:mm) used to compute
 * worked minutes when the person hasn't checked out yet, return the day code.
 */
export function computeDayCode(
  punch: { inAt: string | null; outAt: string | null },
  sched: AttendanceSchedule,
  ctx: DayContext,
  refNow: string,
): DayCodeResult {
  const { inAt, outAt } = punch;

  // ── Phase-B precedence (runs before the Phase-A work logic) ──────────────
  // 1. Approved leave wins outright — paid grants a full day, unpaid is unpaid.
  //    Unless it is only HALF the day, in which case the other half is work and
  //    has to be graded as such (0208).
  if (ctx.leave && ctx.leaveHalf) {
    return halfLeaveDay(punch, sched, ctx.leave, refNow);
  }
  if (ctx.leave === "paid") {
    return { code: "PL", dayValue: 1, late: false, leftEarly: false, lateWaived: false, workedMinutes: 0 };
  }
  if (ctx.leave === "unpaid") {
    return { code: "LWP", dayValue: 0, late: false, leftEarly: false, lateWaived: false, workedMinutes: 0 };
  }
  // 2. Redeemed comp-off — full-day credit, no work expected.
  if (ctx.compOffRedeemed) {
    return { code: "CO", dayValue: 1, late: false, leftEarly: false, lateWaived: false, workedMinutes: 0 };
  }
  // 3. Holiday or weekly-off. Working on one earns holiday-pay (HP, 2×) or a
  //    holiday half-day (H-H/D, 1.5×); not working credits a plain H / W/O day.
  if (ctx.isHoliday || ctx.isWeeklyOff) {
    if (inAt) {
      const worked = Math.max(0, (outAt ? toMin(outAt) : toMin(refNow)) - toMin(inAt));
      const late = toMin(inAt) > toMin(sched.lateAfter);
      // Strict `<`, matching the ordinary-day rule below: leaving exactly AT the
      // cutoff is on time, never early.
      const leftEarly = outAt != null && toMin(outAt) < toMin(sched.earlyBefore);
      if (worked >= sched.halfDayMinutes) {
        return { code: "HP", dayValue: 2, late, leftEarly, lateWaived: false, workedMinutes: worked };
      }
      if (worked > 0) {
        return { code: "H-H/D", dayValue: 1.5, late, leftEarly, lateWaived: false, workedMinutes: worked };
      }
    }
    return ctx.isHoliday
      ? { code: "H", dayValue: 1, late: false, leftEarly: false, lateWaived: false, workedMinutes: 0 }
      : { code: "W/O", dayValue: 1, late: false, leftEarly: false, lateWaived: false, workedMinutes: 0 };
  }

  // No check-in.
  if (!inAt) {
    if (ctx.isWeeklyOff) {
      return { code: "W/O", dayValue: 1, late: false, leftEarly: false, lateWaived: false, workedMinutes: 0 };
    }
    // CHECKED OUT BUT NEVER CHECKED IN — the mirror of the missing-punch-out
    // rule below, and it has to be stated separately because the absence of an
    // in-punch is what this branch is for. An out-punch is evidence the person
    // was here: something happened at the end of a day they were present for.
    // Grading that ABSENT punishes a missing punch as though it were a missing
    // day. Half a day, exactly like forgetting to punch out.
    if (outAt) {
      return { code: "H/D", dayValue: 0.5, late: false, leftEarly: false, lateWaived: false, workedMinutes: 0 };
    }
    return { code: "A", dayValue: 0, late: false, leftEarly: false, lateWaived: false, workedMinutes: 0 };
  }

  const worked = Math.max(0, (outAt ? toMin(outAt) : toMin(refNow)) - toMin(inAt));
  const late = toMin(inAt) > toMin(sched.lateAfter);
  // Early = left strictly BEFORE the early-before time (7:30 pm). At exactly the
  // cutoff it is NOT early (Sir: "7:30 ke pehle logout = early").
  const leftEarly = outAt != null && toMin(outAt) < toMin(sched.earlyBefore);

  // Checked in but NEVER checked out (Sir #12): credit a HALF-DAY, not the old
  // "incomplete/0". The person came in; a missing punch-out shouldn't zero them.
  if (!outAt) {
    return { code: "H/D", dayValue: 0.5, late, leftEarly: false, lateWaived: false, workedMinutes: worked };
  }

  // Same day, one step later: the cron has since written the out-punch itself.
  // The rule must not change just because a system row now exists where a
  // missing one used to be — see DayContext.autoClosed.
  if (ctx.autoClosed) {
    return { code: "H/D", dayValue: 0.5, late, leftEarly: false, lateWaived: false, workedMinutes: worked };
  }

  // THREE-TIER day rule. The cutoffs come from the employee's own resolved
  // config (lib/attendance/effective-config.ts), which derives them as ratios of
  // that person's daily target — so a full-timer grades at 7.5h/4.5h against a 9h
  // day and a part-timer at 3.5h/2.5h against a 4.5h day. Neither can ever
  // inherit the other's absolute hours.
  //
  //   ≥ fullDayMinutes → Full Day (P)
  //   ≥ halfDayMinutes → Half Day (H/D)
  //   below            → Absent   (A)  ← present but under the floor
  //
  // A late arrival / early exit that STILL lands a full day is forgiven
  // (lateWaived) — the hours were made up, so the mark should not also bite.
  if (worked >= sched.fullDayMinutes) {
    const lateWaived = late || leftEarly;
    return { code: "P", dayValue: 1, late, leftEarly, lateWaived, workedMinutes: worked };
  }
  if (worked >= sched.halfDayMinutes) {
    return { code: "H/D", dayValue: 0.5, late, leftEarly, lateWaived: false, workedMinutes: worked };
  }
  // Under the half-day floor. The person punched in, so the marks stay visible
  // and auditable (spec §5) even though the day itself credits nothing.
  return { code: "A", dayValue: 0, late, leftEarly, lateWaived: false, workedMinutes: worked };
}

/**
 * A day that is HALF leave and half work (0208).
 *
 * The employee owes half a day, so `halfDayMinutes` — the threshold that earns
 * a half day on an ordinary day — is a COMPLETE performance here, not a partial
 * one. That is why the three-tier rule is not reused: measuring a half day
 * against `fullDayMinutes` would grade every honoured half-leave as a shortfall.
 *
 *   PAID   + worked the half → P    (1.0)  leave covers the other half
 *   PAID   + didn't          → H/D  (0.5)  the paid half still stands
 *   UNPAID + worked the half → H/D  (0.5)  half earned, half unpaid
 *   UNPAID + didn't          → A    (0.0)  nothing earned, nothing granted
 *
 * LATE AND EARLY MARKS ARE SUPPRESSED, deliberately. The schedule's `lateAfter`
 * and `earlyBefore` describe a full day: someone returning from a morning's
 * leave arrives around midday and would be marked late for keeping exactly the
 * arrangement that was approved, and late marks carry a payroll deduction. The
 * flags do not record which half was taken, so there is no honest way to shift
 * the cutoffs — and marking nobody is the direction that cannot overcharge.
 */
function halfLeaveDay(
  punch: { inAt: string | null; outAt: string | null },
  sched: AttendanceSchedule,
  leave: "paid" | "unpaid",
  refNow: string,
): DayCodeResult {
  const { inAt, outAt } = punch;
  const worked = inAt ? Math.max(0, (outAt ? toMin(outAt) : toMin(refNow)) - toMin(inAt)) : 0;
  const workedTheHalf = worked >= sched.halfDayMinutes;

  if (leave === "paid") {
    return workedTheHalf
      ? { code: "P", dayValue: 1, late: false, leftEarly: false, lateWaived: false, workedMinutes: worked }
      : { code: "H/D", dayValue: 0.5, late: false, leftEarly: false, lateWaived: false, workedMinutes: worked };
  }
  return workedTheHalf
    ? { code: "H/D", dayValue: 0.5, late: false, leftEarly: false, lateWaived: false, workedMinutes: worked }
    : { code: "A", dayValue: 0, late: false, leftEarly: false, lateWaived: false, workedMinutes: worked };
}

/**
 * (Task B8) Did recording one more late arrival cross a multiple-of-3 boundary?
 *
 * The org deducts a ½-day's salary for every 3rd late in a pay period. This
 * pure predicate answers "should we fire the deduction alert now?" given the
 * employee's un-waived late count BEFORE and AFTER this punch added a late.
 * It fires only when the NEW count lands exactly on a multiple of 3 AND it
 * actually increased — so a re-punch that leaves the count unchanged (3→3) or
 * a non-boundary increment (3→4) stays silent, while 2→3, 5→6 and 0→3 fire.
 */
export function lateDeductionCrossed(
  prevLateCount: number,
  newLateCount: number,
): boolean {
  return newLateCount % 3 === 0 && newLateCount > prevLateCount;
}

/** Which attendance kind a finalized in+out day should email about (Task A8).
 *  Pure so it can be unit-tested alongside `computeDayCode`. Returns null when
 *  no email is warranted (clean day, or the day isn't finalized yet). */
export type CheckoutNotifyKind =
  | "attendance_late_waived"
  | "attendance_half_day";

export function decideCheckoutNotification(input: {
  inAt: string | null;
  outAt: string | null;
  sched: AttendanceSchedule;
}): CheckoutNotifyKind | null {
  const { inAt, outAt, sched } = input;
  if (!inAt || !outAt) return null;
  const worked = Math.max(0, toMin(outAt) - toMin(inAt));
  const late = toMin(inAt) > toMin(sched.lateAfter);
  // Strict `<` — must agree with `computeDayCode`, or the notification would
  // announce an early checkout the grader never recorded.
  const leftEarly = toMin(outAt) < toMin(sched.earlyBefore);
  if (worked < sched.halfDayMinutes) return "attendance_half_day";
  if ((late || leftEarly) && worked >= sched.fullDayMinutes) {
    return "attendance_late_waived";
  }
  return null;
}
