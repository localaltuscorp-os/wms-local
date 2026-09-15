// HOURS-BASED ATTENDANCE — the single source of truth for "how many days of
// attendance did these worked hours earn". Pure (no DB, no Date) so it is
// unit-testable and so the self-view, the reports and the SALARY engine can all
// read the identical rule and never disagree.
//
// Sir's rule (2026-08):
//   "A person gets full attendance if he attends for 54 hours. If he works for
//    45 hrs, give him attendance for 5 days."
//
// So a day of attendance IS 9 worked hours, and a full Mon–Sat week is 6 × 9h =
// 54h. Hours convert to days proportionally rather than the older all-or-nothing
// 54h waiver (which gave a full week at 54h but nothing between).
//
//   54h → 6.0 days (full week)      45h → 5.0 days      31.5h → 3.5 days
//
// IMPORTANT — this rule governs ORDINARY ATTENDANCE DAYS ONLY (codes P / H/D /
// A: the days the person was expected to punch in). Credited days keep their own
// value and are NEVER re-derived from hours, because no hours are expected on
// them: paid leave (PL=1), comp-off (CO=1), holidays (H=1), weekly off (W/O=1),
// leave-without-pay (LWP=0) and holiday-working premiums (HP=2, H-H/D=1.5).
// Without that carve-out an approved paid leave would silently pay zero.

/** One day of attendance = 9 worked hours. */
export const FULL_DAY_MINUTES = 9 * 60;

/** A full Mon–Sat week = 6 × 9h. Reaching this earns full weekly attendance. */
export const WEEK_TARGET_MINUTES = 54 * 60;

/** Day codes that are ORDINARY attendance days — the ones the hours rule grades. */
const ORDINARY_CODES = new Set(["P", "H/D", "A"]);

/** Is this day one the hours rule should grade (vs a credited leave/holiday)? */
export function isOrdinaryAttendanceDay(code: string): boolean {
  return ORDINARY_CODES.has(code);
}

/**
 * Codes that carry NO SCHEDULED-HOUR EXPECTATION — the days that must not
 * appear in an employee's "required hours".
 *
 * Weekly off, declared holiday, approved paid leave, comp-off and approved
 * unpaid leave are the obvious five. The two HOLIDAY-WORKING codes are the
 * load-bearing additions:
 *
 *   HP     — worked a holiday or weekly off (credited 2×)
 *   H-H/D  — worked part of one           (credited 1.5×)
 *
 * A holiday is a holiday whether or not somebody chose to come in, so turning
 * up on one must not RAISE the hours that person was required to work. It used
 * to: `reconcileMonth` correctly excluded HP from the salary target (it is not
 * an ordinary attendance day), while the Attendance KPI's "required hours" and
 * the overtime threshold counted it — so an employee who worked a holiday was
 * shown a bigger target on Attendance than the payslip was measuring them
 * against, and their Hrs Balance quietly lost a day. Two surfaces, one fact,
 * two numbers.
 *
 * Deliberately SEPARATE from `OFF_CODES` (lib/queries/attendance-summary.ts),
 * which answers a different question: whether the day counts toward "Effective
 * Days Worked". A worked holiday IS a day worked and belongs in that count; it
 * is simply not a day whose hours were ever required.
 */
const NO_HOUR_EXPECTATION = new Set([
  "W/O",
  "H",
  "PL",
  "CO",
  "LWP",
  "HP",
  "H-H/D",
]);

/**
 * Was this day one the employee's SCHEDULE required hours on?
 *
 * The single definition behind every "target / required hours" figure in the
 * app — the Attendance KPI bar, the overtime threshold the salary engine
 * measures surplus against, and the monthly payroll view. THE one place to add
 * a new kind of exempt day.
 */
export function expectsScheduledHours(code: string): boolean {
  return !NO_HOUR_EXPECTATION.has(code);
}

/**
 * Worked minutes → attendance days, rounded to the nearest HALF day (the
 * granularity the rest of the system already uses) and never exceeding the
 * number of days the person was actually expected in.
 *
 * The cap matters: 54h squeezed into 4 long days still cannot earn more than the
 * 4 days that were expected — overtime is not extra attendance.
 */
export function daysFromMinutes(
  workedMinutes: number,
  expectedDays: number,
  /**
   * What ONE day of attendance is worth in minutes FOR THIS EMPLOYEE. Defaults
   * to the full-time 9h so existing callers are unchanged, but a part-timer
   * must pass their own 4.5h — otherwise their full 27h week divides by 9h and
   * reports 3 days earned out of 6, i.e. a phantom shortfall that prices real
   * money out of their pay.
   */
  dayMinutes: number = FULL_DAY_MINUTES,
): number {
  if (expectedDays <= 0) return 0;
  const perDay = dayMinutes > 0 ? dayMinutes : FULL_DAY_MINUTES;
  const raw = workedMinutes / perDay;
  const halfSteps = Math.round(raw * 2) / 2;
  return Math.max(0, Math.min(halfSteps, expectedDays));
}

/**
 * PART-TIME / COLLEGE-SHIFT weekly hours target — 30h (5h × 6 days), Sir 2026-08.
 * A part-timer is paid hourly against this weekly target, so it is what their pay
 * is prorated against. `employees.weekly_target_minutes` is nullable and has no
 * DB default, so resolve it HERE rather than at each call site: an unset value
 * means the standard 30-hour week, never zero hours (which would make the hourly
 * rate divide by zero).
 */
export const DEFAULT_PART_TIME_WEEK_MINUTES = 30 * 60;

export function weeklyTargetMinutesFor(minutes: number | null | undefined): number {
  return minutes != null && minutes > 0 ? minutes : DEFAULT_PART_TIME_WEEK_MINUTES;
}

/** One graded day, as the rule needs to see it. */
export interface HoursRuleDay {
  /** Monday-anchored week bucket, yyyy-mm-dd. */
  weekKey: string;
  code: string;
  /** The day's own credited value (used only for non-ordinary days). */
  dayValue: number;
  workedMinutes: number;
}

/**
 * Total payable day-value for a set of graded days, applying the hours rule
 * week by week. Ordinary days in a week are pooled and converted from hours;
 * every other day keeps its own credited value.
 */
export function payableDaysByHours(
  days: HoursRuleDay[],
  /** This employee's own day length in minutes (see `daysFromMinutes`). */
  dayMinutes: number = FULL_DAY_MINUTES,
): number {
  const byWeek = new Map<string, HoursRuleDay[]>();
  for (const d of days) {
    const arr = byWeek.get(d.weekKey);
    if (arr) arr.push(d);
    else byWeek.set(d.weekKey, [d]);
  }

  let total = 0;
  for (const [, week] of byWeek) {
    let ordinaryMinutes = 0;
    let ordinaryDays = 0;
    for (const d of week) {
      if (isOrdinaryAttendanceDay(d.code)) {
        ordinaryMinutes += d.workedMinutes;
        ordinaryDays += 1;
      } else {
        // Credited day (PL / CO / H / W/O / LWP / HP / H-H/D) — value stands.
        total += d.dayValue;
      }
    }
    total += daysFromMinutes(ordinaryMinutes, ordinaryDays, dayMinutes);
  }
  // Keep the half-day granularity clean of float drift.
  return Math.round(total * 2) / 2;
}

/**
 * Monday-anchored week key for a `yyyy-mm-dd` date string. Pure string/UTC math
 * (no local-time Date construction) so it can't drift across timezones.
 */
export function weekKeyOf(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  // getUTCDay: 0=Sun … 6=Sat. Monday-anchored → Sunday belongs to the week that
  // started 6 days earlier.
  const dow = dt.getUTCDay();
  const backToMonday = dow === 0 ? 6 : dow - 1;
  dt.setUTCDate(dt.getUTCDate() - backToMonday);
  return dt.toISOString().slice(0, 10);
}
