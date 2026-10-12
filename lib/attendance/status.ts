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
   * employee. A system-closed forgotten logout is Absent with zero worked
   * minutes; the marker prevents it being mistaken for a genuine checkout.
   */
  autoClosed?: boolean;
  /** The calendar day has ended, so an unmatched check-in is no longer live. */
  dayClosed?: boolean;
}

export interface DayCodeResult {
  code: AttendanceCode;
  dayValue: number;
  late: boolean;
  leftEarly: boolean;
  lateWaived: boolean;
  workedMinutes: number;
}

export interface DayPunchInput {
  inAt: string | null;
  outAt: string | null;
  /** Completed minutes across every check-in/check-out pair for this day. */
  workedMinutes?: number;
  /** The last check-in has not yet been paired with a check-out. */
  openInAt?: string | null;
}

function workedForDay(punch: DayPunchInput, refNow: string): number {
  const completed = punch.workedMinutes ?? (punch.inAt ? Math.max(0, (punch.outAt ? toMin(punch.outAt) : toMin(refNow)) - toMin(punch.inAt)) : 0);
  const open = punch.openInAt ? Math.max(0, toMin(refNow) - toMin(punch.openInAt)) : 0;
  return Math.max(0, completed + open);
}

/**
 * After an employee's configured late cutoff, they have one hour in which the
 * day remains a late-mark day. Later arrivals are half-days. The cutoff itself
 * remains employee-specific; this is only the policy window after it.
 */
export const LATE_MARK_WINDOW_MINUTES = 60;

/**
 * Pure day-code rules engine. Given a check-in/check-out pair, the resolved
 * schedule, the day context, and a reference "now" (HH:mm) used to compute
 * worked minutes when the person hasn't checked out yet, return the day code.
 */
export function computeDayCode(
  punch: DayPunchInput,
  sched: AttendanceSchedule,
  ctx: DayContext,
  refNow: string,
): DayCodeResult {
  const { inAt, outAt } = punch;
  const worked = workedForDay(punch, refNow);
  const hasOpenSession = !!punch.openInAt || (!!inAt && !outAt && punch.workedMinutes == null);

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
    if (inAt || worked > 0) {
      const late = inAt ? toMin(inAt) > toMin(sched.lateAfter) : false;
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
    if (worked > 0) {
      if (worked >= sched.fullDayMinutes) return { code: "P", dayValue: 1, late: false, leftEarly: false, lateWaived: false, workedMinutes: worked };
      if (worked >= sched.halfDayMinutes) return { code: "H/D", dayValue: 0.5, late: false, leftEarly: false, lateWaived: false, workedMinutes: worked };
      return { code: "A", dayValue: 0, late: false, leftEarly: false, lateWaived: false, workedMinutes: worked };
    }
    if (outAt) {
      return { code: "H/D", dayValue: 0.5, late: false, leftEarly: false, lateWaived: false, workedMinutes: 0 };
    }
    return { code: "A", dayValue: 0, late: false, leftEarly: false, lateWaived: false, workedMinutes: 0 };
  }

  const late = toMin(inAt) > toMin(sched.lateAfter);
  const lateBeyondHalfDayWindow =
    toMin(inAt) > toMin(sched.lateAfter) + LATE_MARK_WINDOW_MINUTES;
  // Early = left strictly BEFORE the early-before time (7:30 pm). At exactly the
  // cutoff it is NOT early (Sir: "7:30 ke pehle logout = early").
  const leftEarly = !hasOpenSession && outAt != null && toMin(outAt) < toMin(sched.earlyBefore);

  // A live check-in keeps accumulating time while today's shift is open. Once
  // the calendar day has ended, an unmatched check-in is a forgotten logout and
  // therefore Absent with no credited hours. This fallback matters when the
  // nightly auto-close job was delayed or missed.
  if (hasOpenSession) {
    if (ctx.dayClosed) {
      return { code: "A", dayValue: 0, late, leftEarly: false, lateWaived: false, workedMinutes: 0 };
    }
    return { code: "H/D", dayValue: 0.5, late, leftEarly: false, lateWaived: false, workedMinutes: worked };
  }

  // The nightly job stamps its out-punch at the check-in time and marks it as a
  // system close. Policy: forgetting to punch out makes the day Absent and must
  // never contribute artificial punch-in-to-midnight hours to the weekly total.
  if (ctx.autoClosed) {
    return { code: "A", dayValue: 0, late, leftEarly: false, lateWaived: false, workedMinutes: 0 };
  }

  // THREE-TIER day rule. The cutoffs come from the employee's own resolved
  // config (lib/attendance/effective-config.ts). A standard full-timer grades
  // at 9h/5h; an hourly-shift worker grades against their own complete shift.
  // Neither can ever inherit the other's absolute hours.
  //
  //   ≥ fullDayMinutes → Full Day (P)
  //   ≥ halfDayMinutes → Half Day (H/D)
  //   below            → Absent   (A)  ← present but under the floor
  //
  // Someone below the half-day minimum is still absent, even if they also left
  // before the cutoff. A half-day requires at least the employee's configured
  // half-day minimum.
  if (worked < sched.halfDayMinutes) {
    return { code: "A", dayValue: 0, late, leftEarly, lateWaived: false, workedMinutes: worked };
  }

  // Completing the employee's full-day target always earns a Full Day. Clock
  // marks remain visible for punctuality reporting, but an early start or a
  // late finish must not turn nine completed hours into a half-day.
  if (worked >= sched.fullDayMinutes) {
    return { code: "P", dayValue: 1, late, leftEarly, lateWaived: late, workedMinutes: worked };
  }

  // Below the full-day target, a check-in more than one hour after the
  // employee's configured late cutoff, or a checkout before their configured
  // end time, is a half-day. For example, a 10:30-11:30 late window followed
  // by a 19:30 checkout is short of a nine-hour day and remains H/D.
  if (lateBeyondHalfDayWindow || leftEarly) {
    return { code: "H/D", dayValue: 0.5, late, leftEarly, lateWaived: false, workedMinutes: worked };
  }

  return { code: "H/D", dayValue: 0.5, late, leftEarly, lateWaived: false, workedMinutes: worked };
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
  punch: DayPunchInput,
  sched: AttendanceSchedule,
  leave: "paid" | "unpaid",
  refNow: string,
): DayCodeResult {
  const worked = workedForDay(punch, refNow);
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
