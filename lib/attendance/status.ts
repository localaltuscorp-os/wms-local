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
  compOffRedeemed?: boolean;
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
      const leftEarly = outAt != null && toMin(outAt) <= toMin(sched.earlyBefore);
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

  // No check-in: weekly off => W/O (full credit), otherwise absent.
  if (!inAt) {
    return ctx.isWeeklyOff
      ? { code: "W/O", dayValue: 1, late: false, leftEarly: false, lateWaived: false, workedMinutes: 0 }
      : { code: "A", dayValue: 0, late: false, leftEarly: false, lateWaived: false, workedMinutes: 0 };
  }

  const worked = Math.max(0, (outAt ? toMin(outAt) : toMin(refNow)) - toMin(inAt));
  const late = toMin(inAt) > toMin(sched.lateAfter);
  const leftEarly = outAt != null && toMin(outAt) <= toMin(sched.earlyBefore);

  // Checked in but not out yet — can't grade the day.
  if (!outAt) {
    return { code: "incomplete", dayValue: 0, late, leftEarly: false, lateWaived: false, workedMinutes: worked };
  }

  if (worked < sched.halfDayMinutes) {
    return { code: "H/D", dayValue: 0.5, late, leftEarly, lateWaived: false, workedMinutes: worked };
  }

  // Late/early arrival is forgiven when the person still puts in a full day.
  const lateWaived = (late || leftEarly) && worked >= sched.fullDayMinutes;
  // Phase A keeps a worked weekly-off as "P" — HP (holiday-pay) extra-pay
  // crediting is a Phase B concern, so we don't special-case W/O here.
  return { code: "P", dayValue: 1, late, leftEarly, lateWaived, workedMinutes: worked };
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
  const leftEarly = toMin(outAt) <= toMin(sched.earlyBefore);
  if (worked < sched.halfDayMinutes) return "attendance_half_day";
  if ((late || leftEarly) && worked >= sched.fullDayMinutes) {
    return "attendance_late_waived";
  }
  return null;
}
