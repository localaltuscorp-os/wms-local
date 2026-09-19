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
  // ── Employee schedule settings (0228) ───────────────────────────────────
  // All optional, and every absent value resolves to the behaviour that was in
  // force before the columns existed, so a caller that has not been updated to
  // select them grades exactly as it did before.
  attendanceApplicable?: boolean | null;
  sat1Working?: boolean | null;
  sat2Working?: boolean | null;
  sat3Working?: boolean | null;
  sat4Working?: boolean | null;
  sat5Working?: boolean | null;
  satOfficialStart?: string | null;
  satOfficialEnd?: string | null;
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
  /**
   * FALSE = this person is not required to punch (0228).
   *
   * Read it as "there is no attendance expectation here", not as "they are
   * absent but forgiven": a day with no punches is not graded absent and can
   * therefore never reach a salary deduction. Callers check this FIRST, before
   * any day-code or hours arithmetic — see `isAttendanceGraded`.
   */
  attendanceApplicable: boolean;
  /**
   * Which Saturdays of the month are working days, indexed 1–5.
   * Index 0 is unused and always false so `satWorking[n]` reads naturally.
   */
  saturdayWorking: readonly boolean[];
  /** Saturday's own schedule. Equal to officialStart/End unless overridden. */
  saturdayStart: string;
  saturdayEnd: string;
  /**
   * True when either Saturday column is set, i.e. Saturday has a clock of its
   * own. When false, a Saturday grades against the weekday schedule exactly as
   * it did before 0228 — same late-after, same cutoffs.
   */
  saturdayOverridden: boolean;
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
  //
  // ── A FULL-TIMER'S DAY IS CONTRACTUAL, NOT SCHEDULED (0228) ──────────────
  // This used to be the scheduled span (end − start) whenever one was set. That
  // one number feeds three things that are not the schedule at all:
  //
  //   · the hours-rule divisor — "9h worked = 1 day of attendance"
  //     (payableDaysByHours / daysFromMinutes);
  //   · the minutes a paid leave or comp-off is credited
  //     (payableHoursForMonth);
  //   · the full/half-day cutoffs, as 7.5/9 and 4.5/9 of it.
  //
  // So widening someone's timings silently re-priced their attendance. Parvez
  // Khan, scheduled 07:30–19:30, had a 12h "day": a complete 54h week earned
  // 54 ÷ 12 = 4.5 days, and a Full Day needed 10 hours on the clock. Nobody
  // chose either number; they fell out of a start and an end time.
  //
  // The brief states the rule outright: employee timings only define the
  // scheduled working period, and 54 h/week stays the governing full-time
  // target. So the day is the worker type's contractual one (9h, i.e. 54 ÷ 6)
  // and the timings keep driving what they are actually for — late-after and
  // early-before, resolved above.
  //
  // The hourly shifts are unchanged: their day was already derived from their
  // week just below, never from the window.

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

  // Contractual for every type that is not an hourly shift (see the 0228 note
  // above): never the scheduled span, so timings cannot re-price attendance.
  const dailyTargetMinutes = hourlyShift
    ? weeklyTargetMinutes! / WORKING_DAYS_PER_WEEK
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
  //
  // ── THE 54-HOUR RULE GOVERNS, AND TIMINGS DO NOT MOVE IT (0228) ──────────
  // This used to read `dailyTargetMinutes × 6` for every span-driven type,
  // which quietly made the weekly requirement a FUNCTION OF THE SCHEDULE: an
  // admin who set 07:30–19:30 turned a 54-hour week into a 72-hour one without
  // touching anything labelled "target", and that number is the waiver
  // threshold the salary deduction is computed against.
  //
  // It was not hypothetical — Parvez Khan is scheduled 07:30–19:30 and was
  // being measured against 72h/week.
  //
  // The rule is the brief's: employee timings define WHEN the scheduled period
  // is; the contractual week stays 9h × 6 = 54h for a full-timer. An admin who
  // genuinely wants a different weekly requirement still sets
  // `weeklyTargetMinutes` explicitly, which continues to win — that is the one
  // field that means "this person's week is different".
  //
  // The hourly shifts are untouched: they already resolved week-first above,
  // and their per-person target comes from `weeklyTargetMinutes` anyway.
  //
  // The DAY is contractual as well — see the 0228 note on `dailyTargetMinutes`
  // above. It briefly stayed schedule-driven after the week was fixed, and that
  // let a 12h timing make a complete 54h week earn only 4.5 days: the same rule
  // overridden by timings, just through the hours-rule divisor instead.
  //
  // ── AND `adminWeekly` IS STILL IGNORED HERE, ON PURPOSE ──────────────────
  // The obvious-looking `?? adminWeekly` belongs in neither branch. A stored
  // `weekly_target_minutes` is the HOURLY shifts' field; when somebody moves
  // from part-time to full-time the old 1800 stays in the column, and reading
  // it here would silently measure the new full-timer against a 30-hour week.
  // `tests/unit/attendance-worker-config.test.ts` guards exactly that ("a stale
  // hourly-shift weekly target cannot leak into a full-timer") and it caught
  // this when the clause was briefly added. A full-timer's week is 54h,
  // full stop.
  const resolvedWeeklyMinutes =
    weeklyTargetMinutes ?? defaultDailyMinutesFor(workerType) * WORKING_DAYS_PER_WEEK;

  // ── Saturday (0228) ──────────────────────────────────────────────────────
  // Null means "same as Mon–Fri", which is why adding these columns changed
  // nothing for anybody. A one-sided override is honoured: setting only an end
  // time shortens Saturday and leaves its start alone.
  const saturdayStart = normClock(emp.satOfficialStart) ?? officialStart;
  const rawSaturdayEnd = normClock(emp.satOfficialEnd) ?? officialEnd;
  // Same defence the weekday pair gets: a Saturday that ends before it starts
  // would produce a negative span in every consumer. The database CHECK refuses
  // this, so reaching it means a row written before 0228 — fall back rather
  // than propagate nonsense.
  const saturdayEnd =
    clockToMinutes(rawSaturdayEnd) > clockToMinutes(saturdayStart)
      ? rawSaturdayEnd
      : officialEnd;

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
    // Absent (an un-updated caller) means applicable, which is the pre-0228
    // behaviour for everyone.
    attendanceApplicable: emp.attendanceApplicable ?? true,
    saturdayWorking: [
      false, // index 0 unused, so saturdayWorking[ordinal] reads directly
      emp.sat1Working ?? true,
      emp.sat2Working ?? true,
      emp.sat3Working ?? true,
      emp.sat4Working ?? true,
      emp.sat5Working ?? true,
    ],
    saturdayStart,
    saturdayEnd,
    saturdayOverridden:
      normClock(emp.satOfficialStart) != null || normClock(emp.satOfficialEnd) != null,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
   Schedule questions about a SPECIFIC DATE (0228)

   Pure and date-only — they take the calendar fields rather than a Date, for
   the same reason the rest of this file is pure: the grader, the salary engine
   and the reports must all get the same answer, and a timezone is the classic
   way for two callers to disagree about which day it is.
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Which Saturday of its month a date is: 1–5, or 0 when it is not a Saturday.
 *
 * "1st Saturday" is the first Saturday BY DATE in that calendar month — the
 * ordinary reading, and the one an employee means when they say they work
 * alternate Saturdays. Day 1–7 is the 1st, 8–14 the 2nd, and so on, which is
 * exact because Saturdays are 7 days apart.
 *
 * A 5th Saturday exists only in months whose Saturdays fall on the 29th, 30th
 * or 31st — roughly four or five months a year — which is why it is a separate
 * flag rather than folded into the 1st.
 */
export function saturdayOrdinal(dayOfWeek: number, dayOfMonth: number): number {
  if (dayOfWeek !== 6) return 0;
  return Math.floor((dayOfMonth - 1) / 7) + 1;
}

/**
 * Is this date a scheduled working day for this employee?
 *
 * Three ways it is not: their weekly off, a Saturday their flags exclude, or
 * attendance not applying to them at all. Holidays are NOT decided here — they
 * are org-level and already resolved by the events calendar upstream.
 */
export function isWorkingDay(
  cfg: EffectiveAttendanceConfig,
  dayOfWeek: number,
  dayOfMonth: number,
): boolean {
  if (!cfg.attendanceApplicable) return false;
  if (dayOfWeek === cfg.weeklyOff) return false;
  const ordinal = saturdayOrdinal(dayOfWeek, dayOfMonth);
  if (ordinal > 0) return cfg.saturdayWorking[ordinal] ?? true;
  return true;
}

/**
 * The scheduled start and end for a given weekday — Saturday's own pair when it
 * is a Saturday, the Mon–Fri pair otherwise.
 */
export function scheduleForDay(
  cfg: EffectiveAttendanceConfig,
  dayOfWeek: number,
): { start: string; end: string } {
  return dayOfWeek === 6
    ? { start: cfg.saturdayStart, end: cfg.saturdayEnd }
    : { start: cfg.officialStart, end: cfg.officialEnd };
}

/**
 * Should this employee's attendance be graded at all?
 *
 * The single question every consumer should ask before computing a day code, an
 * absence or a deduction. It exists as a named function rather than a bare
 * `cfg.attendanceApplicable` read so that the intent is greppable and so the
 * rule has one place to change.
 */
export function isAttendanceGraded(cfg: EffectiveAttendanceConfig): boolean {
  return cfg.attendanceApplicable;
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

/**
 * The grading schedule for one WEEKDAY (0228): Saturday's own clock when it has
 * one, the ordinary schedule otherwise.
 *
 * Returns `toAttendanceSchedule(cfg)` UNCHANGED unless the day is a Saturday
 * and `saturdayOverridden` is set, so nobody without a Saturday override grades
 * any differently than they did before.
 *
 * On an overridden Saturday:
 *
 *   · late-after   — Saturday's start plus the flat grace, when Saturday starts
 *                    at a different time; otherwise the weekday late-after.
 *   · early-before — Saturday's end, when it ends at a different time; never
 *                    later than that end either way, for the same reason the
 *                    weekday clamp exists: leaving on time is not leaving early.
 *   · cutoffs      — scaled to Saturday's span, never above the weekday ones.
 *                    A 10:30–16:00 Saturday is 5.5h scheduled, and holding it to
 *                    a 7.5h Full Day would code every complete Saturday a half
 *                    day. This moves the DAY CODE only: pay on ordinary days is
 *                    the week's pooled hours against 54h (hours-rule.ts), which
 *                    this does not touch.
 *
 * The hourly shifts keep their own cutoffs — their shift already is their day.
 */
export function attendanceScheduleForWeekday(
  cfg: EffectiveAttendanceConfig,
  dayOfWeek: number,
): { lateAfter: string; earlyBefore: string; fullDayMinutes: number; halfDayMinutes: number } {
  const base = toAttendanceSchedule(cfg);
  if (dayOfWeek !== 6 || !cfg.saturdayOverridden) return base;

  const lateAfter =
    cfg.saturdayStart !== cfg.officialStart
      ? minutesToClock(clockToMinutes(cfg.saturdayStart) + LATE_GRACE_MINUTES)
      : base.lateAfter;

  const earlyBefore =
    cfg.saturdayEnd !== cfg.officialEnd ||
    clockToMinutes(base.earlyBefore) > clockToMinutes(cfg.saturdayEnd)
      ? cfg.saturdayEnd
      : base.earlyBefore;

  const span = clockToMinutes(cfg.saturdayEnd) - clockToMinutes(cfg.saturdayStart);
  // A span that is not positive can only come from a row the resolver already
  // had to repair (see `saturdayEnd` there). Scaling cutoffs off it would make
  // them zero or negative, so keep the weekday cutoffs and move only the clock.
  if (isHourlyShift(cfg.workerType) || span <= 0) {
    return { ...base, lateAfter, earlyBefore };
  }

  const fullDayMinutes = Math.min(base.fullDayMinutes, Math.round(span * FULL_DAY_RATIO));
  const halfDayMinutes = Math.min(
    base.halfDayMinutes,
    fullDayMinutes,
    Math.round(span * HALF_DAY_RATIO),
  );
  return { lateAfter, earlyBefore, fullDayMinutes, halfDayMinutes };
}
