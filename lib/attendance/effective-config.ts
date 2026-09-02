// THE single source of truth for "what schedule and targets does this employee
// grade against". Pure (no DB, no Date) so the grader, the weekly reconciler,
// the self-view, the reports and the SALARY engine all read one resolver and
// can never disagree.
//
// WHY THIS FILE EXISTS — the bug it fixes:
//   `employees` carries TWO pairs of schedule columns. The Admin Panel writes
//   both, but the attendance engine only ever read one of them:
//
//     att_official_start / att_official_end   ← Admin wrote it, engine IGNORED it
//     att_late_after     / att_early_before   ← engine read this
//
//   So an admin could set Official End = 19:00, leave `att_early_before` blank,
//   and the grader silently fell back to the ORG default (19:20/19:30). A 19:00
//   checkout then read as 19:00 < 19:20 → EARLY CHECKOUT, and that flowed into
//   a salary deduction. The Admin Panel and Attendance were reading different
//   columns for the same concept.
//
//   `resolveEffectiveConfig` closes that: the official start/end are now the
//   PRIMARY input, and late-after / early-before are graces derived from them
//   unless an admin has explicitly overridden those too.

import { type WorkerType, asWorkerType, isHourlyShift } from "./worker-type";

/* ────────────────────────────────────────────────────────────────────────────
   Policy constants. Named and derived, never sprinkled as literals — "54" used
   to be hardcoded in the hours rule, the month calendar AND the self-view copy,
   which is how part-timers ended up being shown a full-timer's week.
   ──────────────────────────────────────────────────────────────────────────── */

/** A standard working week is Mon–Sat for every day-graded worker type. */
export const WORKING_DAYS_PER_WEEK = 6;

/** Daily target hours by worker type. Weekly target = target × 6. */
export const FULL_TIME_DAILY_MINUTES = 9 * 60; // 9h  → 54h/week
/** The hourly-shift day — part-time AND afternoon/college shift (Sir, 2026-08). */
export const PART_TIME_DAILY_MINUTES = 5 * 60; // 5h → 30h/week

/**
 * Day-grade cutoffs, expressed as a FRACTION of that employee's own daily
 * target rather than as absolute hours, so a custom schedule scales instead of
 * inheriting a 9-hour day's absolutes.
 *
 *   ≥ FULL_DAY_RATIO × target → Full Day (P)
 *   ≥ HALF_DAY_RATIO × target → Half Day (H/D)
 *   below that                → Absent   (A)
 *
 * Sir, 2026-08: against the standard 9h full-time day these are EXACTLY
 * 7.5h and 4.5h — 7.5–9h is a Full Day, 4.5–7.5h a Half Day, under 4.5h
 * Absent. (7.4h is a half day; 4.4h is absent. NOT "anything under 9h is a
 * half day".) Hourly shifts never read these — their whole shift is the day
 * (see the hourlyShift branch below).
 */
export const FULL_DAY_RATIO = 7.5 / 9;
export const HALF_DAY_RATIO = 4.5 / 9;

/**
 * Punctuality grace when an employee has an official start but no explicit
 * late-after override. 50 minutes reproduces the org default exactly
 * (10:00 official start → 10:50 late-after), so deriving the grace changes
 * nothing for the standard schedule while making a custom start time work.
 *
 * Deliberately FLAT, not proportional to shift length: turning up on time is a
 * punctuality policy, not something a part-timer should get less of.
 */
export const LATE_GRACE_MINUTES = 50;

/** Fallbacks used only when neither the employee nor org settings say otherwise. */
const FALLBACK_OFFICIAL_START = "10:00";
const FALLBACK_OFFICIAL_END = "19:00";

/* ────────────────────────────────────────────────────────────────────────────
   Types
   ──────────────────────────────────────────────────────────────────────────── */

/** The employee columns this resolver reads. */
export interface EmployeeConfigInput {
  workerType?: string | null;
  weeklyOff?: number | null;
  attOfficialStart?: string | null;
  attOfficialEnd?: string | null;
  attLateAfter?: string | null;
  attEarlyBefore?: string | null;
  attFullDayMinutes?: number | null;
  attHalfDayMinutes?: number | null;
  weeklyTargetMinutes?: number | null;
}

/** The org_settings columns this resolver reads. */
export interface OrgConfigInput {
  attLateAfter?: string | null;
  attEarlyBefore?: string | null;
  attFullDayHours?: string | number | null;
  attHalfDayHours?: string | number | null;
}

export interface EffectiveAttendanceConfig {
  workerType: WorkerType;
  /** 0=Sun … 6=Sat. */
  weeklyOff: number;
  /** "HH:mm" — what the Admin Panel shows as the employee's schedule. */
  officialStart: string;
  officialEnd: string;
  /** Arriving strictly AFTER this is Late. */
  lateAfter: string;
  /** Leaving strictly BEFORE this is Early. Never later than `officialEnd`. */
  earlyBefore: string;
  /** What a full day of work is meant to be (drives weekly target). */
  dailyTargetMinutes: number;
  /** ≥ this worked → Full Day. */
  fullDayMinutes: number;
  /** ≥ this worked (but < fullDayMinutes) → Half Day; below → Absent. */
  halfDayMinutes: number;
  workingDaysPerWeek: number;
  /** dailyTarget × workingDays, or the admin-set part-time target. */
  weeklyTargetMinutes: number;
  /**
   * Weekly hours that trigger the deviation waiver. Equal to the employee's own
   * weekly target — a part-timer is NEVER measured against 54h.
   */
  waiverThresholdMinutes: number;
  /** True when day-code grading applies (false for project/session workers). */
  dayGraded: boolean;
}

/* ────────────────────────────────────────────────────────────────────────────
   Helpers
   ──────────────────────────────────────────────────────────────────────────── */

/** "HH:mm" or "HH:mm:ss" → minutes since midnight. */
export function clockToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":");
  return parseInt(h ?? "0", 10) * 60 + parseInt(m ?? "0", 10);
}

/** minutes since midnight → "HH:mm" (clamped to the day). */
export function minutesToClock(min: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(min)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Postgres `time` comes back as "HH:mm:ss"; normalise and drop blanks. */
function normClock(v: string | null | undefined): string | null {
  if (!v) return null;
  const t = v.trim();
  if (!t) return null;
  const [h, m] = t.split(":");
  if (h == null || m == null) return null;
  return `${h.padStart(2, "0")}:${m.padStart(2, "0")}`;
}

/** The default daily target for a worker type, before per-employee overrides. */
export function defaultDailyMinutesFor(w: WorkerType): number {
  return isHourlyShift(w) ? PART_TIME_DAILY_MINUTES : FULL_TIME_DAILY_MINUTES;
}

/* ────────────────────────────────────────────────────────────────────────────
   The resolver
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Resolve one employee's effective attendance configuration.
 *
 * Precedence, highest first:
 *   1. an explicit per-employee override,
 *   2. a value DERIVED from that employee's own official start/end,
 *   3. the org-wide default,
 *   4. a hardcoded fallback.
 *
 * Step 2 is the fix: it is what makes the Admin Panel's "Official End 19:00"
 * actually govern whether 19:00 counts as an early checkout.
 */
export function resolveEffectiveConfig(
  emp: EmployeeConfigInput,
  org: OrgConfigInput = {},
): EffectiveAttendanceConfig {
  const workerType = asWorkerType(emp.workerType);
  const dayGraded = workerType !== "project_remote";

  // ── Official schedule — what the Admin Panel displays ────────────────────
  const officialStart =
    normClock(emp.attOfficialStart) ?? FALLBACK_OFFICIAL_START;
  const officialEnd = normClock(emp.attOfficialEnd) ?? FALLBACK_OFFICIAL_END;

  // ── Late-after: explicit override → derived from official start → org ────
  const lateAfter =
    normClock(emp.attLateAfter) ??
    (normClock(emp.attOfficialStart)
      ? minutesToClock(clockToMinutes(officialStart) + LATE_GRACE_MINUTES)
      : (normClock(org.attLateAfter) ?? minutesToClock(
          clockToMinutes(FALLBACK_OFFICIAL_START) + LATE_GRACE_MINUTES,
        )));

  // ── Early-before: explicit override → the official END itself → org ──────
  //
  // Leaving AT the official end is NOT early (spec §1, Test 1): `computeDayCode`
  // compares with a strict `<`, so earlyBefore == officialEnd makes a 19:00
  // checkout against a 19:00 schedule clean, and 18:30 still early.
  //
  // The final clamp is the belt-and-braces half of the same fix: an org default
  // of 19:30 must never make an employee whose day ends at 19:00 "early" for
  // leaving on time. earlyBefore can never sit past the official end.
  const rawEarlyBefore =
    normClock(emp.attEarlyBefore) ??
    (normClock(emp.attOfficialEnd)
      ? officialEnd
      : (normClock(org.attEarlyBefore) ?? FALLBACK_OFFICIAL_END));

  const earlyBefore =
    clockToMinutes(rawEarlyBefore) > clockToMinutes(officialEnd)
      ? officialEnd
      : rawEarlyBefore;

  // ── Daily target ─────────────────────────────────────────────────────────
  // The scheduled span (end − start) is the employee's real day when it is set;
  // otherwise fall back to the worker-type default. This is what makes
  // "10:00 → 14:30" a 4.5h part-time day without anyone typing 4.5 anywhere.
  const scheduledSpan =
    normClock(emp.attOfficialStart) && normClock(emp.attOfficialEnd)
      ? clockToMinutes(officialEnd) - clockToMinutes(officialStart)
      : null;

  // ── THE HOURLY SHIFTS ARE MEASURED BY THE WEEK, NOT BY THE WINDOW ────────
  // For part-time and afternoon/college shift the official start/end is the
  // WINDOW they may attend inside, not the hours they owe. Every one of them is
  // currently scheduled 03:00-20:00, and reading that as a 17-hour day set their
  // monthly target to 408h and their hourly rate to a third of what it should
  // be — the schedule span silently rewrote their pay.
  //
  // So for these two types the WEEK is primary (27h by default, or whatever the
  // Admin Panel set) and the day is derived from it. The span still defines a
  // real day for everyone else, which is what makes "10:00 -> 19:00" a 9h day
  // without anyone typing 9 anywhere.
  const adminWeekly =
    emp.weeklyTargetMinutes != null && emp.weeklyTargetMinutes > 0
      ? emp.weeklyTargetMinutes
      : null;

  const hourlyShift = isHourlyShift(workerType);

  const weeklyTargetMinutes = hourlyShift
    ? (adminWeekly ?? defaultDailyMinutesFor(workerType) * WORKING_DAYS_PER_WEEK)
    : null; // resolved below from the day, for span-driven types

  const dailyTargetMinutes = hourlyShift
    ? weeklyTargetMinutes! / WORKING_DAYS_PER_WEEK
    : scheduledSpan != null && scheduledSpan > 0
      ? scheduledSpan
      : defaultDailyMinutesFor(workerType);

  // ── Day-grade cutoffs ────────────────────────────────────────────────────
  let fullDayMinutes: number;
  let halfDayMinutes: number;

  if (hourlyShift) {
    // COLLEGE / AFTERNOON SHIFT + PART-TIME (Sir, 2026-08): a full shift IS the
    // day — ≥ their own daily target → Full Day (P), below it → Absent (A), with
    // NO hours-based half-day tier. (A forgotten punch is still graded H/D
    // upstream in computeDayCode; that rule is worker-type-agnostic by design.)
    // Grading these against a 9h full-day used to mean a college-shift person who
    // worked their entire 5h shift was mis-coded a half-day and never a full one.
    fullDayMinutes = emp.attFullDayMinutes ?? Math.round(dailyTargetMinutes);
    halfDayMinutes = emp.attHalfDayMinutes ?? Math.round(dailyTargetMinutes);
  } else {
    // full_time / project_remote — ratios of their OWN target (≥7.5h Full,
    // ≥4.5h Half against a 9h day), so neither type inherits the other's
    // absolute hours.
    fullDayMinutes = emp.attFullDayMinutes ?? Math.round(dailyTargetMinutes * FULL_DAY_RATIO);
    halfDayMinutes = emp.attHalfDayMinutes ?? Math.round(dailyTargetMinutes * HALF_DAY_RATIO);
  }

  // A half-day cutoff above the full-day cutoff would make "Half Day"
  // unreachable; keep them ordered whatever the stored overrides say.
  if (halfDayMinutes > fullDayMinutes) halfDayMinutes = fullDayMinutes;

  // ── Weekly target ────────────────────────────────────────────────────────
  // Span-driven types get target × 6; the hourly shifts already resolved theirs
  // above, week-first. NEVER a hardcoded 54, and never a hardcoded 27.
  const resolvedWeeklyMinutes =
    weeklyTargetMinutes ?? dailyTargetMinutes * WORKING_DAYS_PER_WEEK;

  return {
    workerType,
    weeklyOff: emp.weeklyOff ?? 0,
    officialStart,
    officialEnd,
    lateAfter,
    earlyBefore,
    dailyTargetMinutes,
    fullDayMinutes,
    halfDayMinutes,
    workingDaysPerWeek: WORKING_DAYS_PER_WEEK,
    weeklyTargetMinutes: resolvedWeeklyMinutes,
    // The waiver threshold IS the employee's own weekly requirement (spec §6).
    waiverThresholdMinutes: resolvedWeeklyMinutes,
    dayGraded,
  };
}

/** Adapter: the legacy `AttendanceSchedule` shape the grader already takes. */
export function toAttendanceSchedule(cfg: EffectiveAttendanceConfig): {
  lateAfter: string;
  earlyBefore: string;
  fullDayMinutes: number;
  halfDayMinutes: number;
} {
  return {
    lateAfter: cfg.lateAfter,
    earlyBefore: cfg.earlyBefore,
    fullDayMinutes: cfg.fullDayMinutes,
    halfDayMinutes: cfg.halfDayMinutes,
  };
}
