import {
  DEFAULT_PART_TIME_WEEK_MINUTES,
  FULL_DAY_MINUTES,
  WEEK_TARGET_MINUTES,
} from "@/lib/attendance/hours-rule";
import { isHourlyShift, type WorkerType } from "@/lib/attendance/worker-type";

/**
 * Display helpers for the editor's schedule panel — PURE, no React, so the
 * numbers on screen can be unit-tested without rendering anything.
 *
 * NOT A SECOND SOURCE OF TRUTH. Every figure is derived from
 * `lib/attendance/hours-rule.ts`, the module the attendance grader and the
 * salary engine actually read:
 *
 *   FULL_DAY_MINUTES                9h  - one day of attendance
 *   WEEK_TARGET_MINUTES            54h  - a full Mon-Sat week (6 x 9h)
 *   DEFAULT_PART_TIME_WEEK_MINUTES 27h  - a part-timer's weekly target
 *
 * "9 hours/day / 54 hours/week" and "4.5 hours/day / 27 hours/week" appear
 * nowhere here as literals - they fall out of those constants. Change the policy
 * there and this panel follows automatically, which is the whole point: the
 * Admin Panel must show what Attendance enforces, not its own copy of it.
 */

/** A standard working week is Mon-Sat, matching the hours rule's 54h = 6 x 9h. */
const WORKING_DAYS_PER_WEEK = WEEK_TARGET_MINUTES / FULL_DAY_MINUTES;

/** 540 -> "9h", 270 -> "4.5h". */
export function hoursLabel(minutes: number): string {
  const h = Math.round((minutes / 60) * 10) / 10;
  return `${h}h`;
}

/**
 * Daily + weekly target minutes for this worker type.
 *
 * An hourly-shift employee is measured against a WEEKLY target (27h) and their
 * day is that spread over the same six working days - never 9h. Deriving
 * the daily figure from the weekly one, rather than the other way round, keeps
 * it consistent with how the hours rule prices a part-time week.
 */
export function targetsFor(w: WorkerType): { daily: number; weekly: number } {
  // Part-time AND afternoon/college shift are one category (Sir, 2026-08).
  if (isHourlyShift(w)) {
    const weekly = DEFAULT_PART_TIME_WEEK_MINUTES;
    return { daily: weekly / WORKING_DAYS_PER_WEEK, weekly };
  }
  return { daily: FULL_DAY_MINUTES, weekly: WEEK_TARGET_MINUTES };
}

/** This worker type's requirement, e.g. "9h/day - 54h/week". */
export function requirementFor(w: WorkerType): string {
  const { daily, weekly } = targetsFor(w);
  return `${hoursLabel(daily)}/day · ${hoursLabel(weekly)}/week`;
}

/** "10:00" -> "10:00 AM". Anything not HH:mm returns "" so callers can fall back. */
export function to12h(hhmm: string): string {
  if (!/^\d{2}:\d{2}$/.test(hhmm)) return "";
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  if (h > 23 || m > 59) return "";
  const suffix = h < 12 ? "AM" : "PM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}
