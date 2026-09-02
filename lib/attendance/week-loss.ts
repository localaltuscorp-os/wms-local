/**
 * WEEK LOSS — what last week actually cost you, in days and in rupees.
 *
 * PURE + CLIENT-SAFE (no DB, no I/O, no `new Date()`): the server assembler and
 * the Monday dialog compute from the same functions, and the whole thing is
 * unit-testable without a database. Same discipline as
 * lib/attendance/hours-rule.ts, whose rule this module reuses rather than
 * restates.
 *
 * ── WHERE THE NUMBERS COME FROM ────────────────────────────────────────────
 * Pay is earned from WORKED HOURS (lib/attendance/hours-rule.ts): 9 worked hours
 * = one day of attendance, 54h = a full Mon-Sat week. So an attendance loss is
 * not a separate penalty ledger — it is simply the gap between the days a person
 * was expected in and the days their hours actually earned:
 *
 *     daysLost = (expected ordinary days - days earned from hours)
 *              + unpaid-leave days
 *
 * A late arrival or an early exit is already IN that gap as fewer worked hours;
 * it is never charged a second time. (The salary engine made the same call —
 * see the `applyLate = false` note in lib/salary/generate.ts.) Lateness is
 * still COUNTED and shown, as information about how the gap happened.
 *
 * Credited days — paid leave, comp-off, holidays, weekly off — are worth a full
 * day and no hours are expected on them, so they cost nothing. The one credited
 * day that does cost is LWP (leave without pay, dayValue 0), which is counted
 * separately so the dialog can name it for what it is.
 *
 * ── AND WHY THE MONEY FIGURE IS HONEST ─────────────────────────────────────
 * Three pay bases exist, and only two of them can lose money to attendance:
 *   · monthly_ctc  -> daysLost x per-day rate      (the common case)
 *   · hourly       -> shortfall hours x hourly rate (part-timers)
 *   · fixed_fee    -> ZERO, always                  (project/remote staff)
 * A fixed-fee person is told plainly that their pay does not move with
 * attendance, rather than being shown a fabricated rupee figure.
 */

import {
  FULL_DAY_MINUTES,
  daysFromMinutes,
  isOrdinaryAttendanceDay,
} from "./hours-rule";
// The app already has ONE definition of how a person is paid — reuse it rather
// than restate the union here, so a new pay basis can never be added to the
// enum and silently mis-priced by this module.
import type { PayBasis } from "@/db/enums";

export type { PayBasis };

/** One graded day, structurally compatible with `DayRow`
 *  (lib/queries/attendance-status.ts) so the loader can pass rows straight in. */
export interface WeekLossDay {
  /** yyyy-mm-dd. */
  logDate: string;
  code: string;
  dayValue: number;
  workedMinutes: number;
  late: boolean;
  leftEarly: boolean;
}

/** The rates the money figure is priced at. Assembled server-side from the
 *  employee's salary profile; all zero is a valid state (no profile on file)
 *  and simply yields a rupee figure of 0 with `priced: false`. */
export interface WeekLossPay {
  basis: PayBasis;
  /** monthly_ctc: rupees earned per attendance day. */
  perDay: number;
  /** hourly: rupees per worked hour. */
  hourlyRate: number;
  /** hourly: the weekly hours target the pay is prorated against, in minutes. */
  weeklyTargetMinutes: number;
  /**
   * What ONE attendance day is worth in minutes for this employee (9h full-time,
   * 4.5h part-time). Optional so existing callers still compile; when absent the
   * full-time day is assumed. Supplying it is what stops a part-timer's complete
   * week being priced as a multi-day shortfall.
   */
  dailyTargetMinutes?: number;
}

export interface WeekLoss {
  /** Inclusive Mon-Sun bounds of the week being reported. */
  weekStart: string;
  weekEnd: string;

  /* ── attendance ── */
  /** Days the person was expected in (ordinary attendance days). */
  expectedDays: number;
  /** Days their worked hours actually earned. */
  earnedDays: number;
  /** expected - earned, floored at 0. */
  hoursShortfallDays: number;
  /** Days of leave-without-pay in the week. */
  unpaidLeaveDays: number;
  /** The headline: hours shortfall + unpaid leave. */
  daysLost: number;

  /* ── how the gap happened (information only, never re-charged) ── */
  workedMinutes: number;
  /** expectedDays x 9h — the hours those days were worth. */
  targetMinutes: number;
  /** targetMinutes - workedMinutes, floored at 0. */
  shortMinutes: number;
  lateCount: number;
  leftEarlyCount: number;
  /** Days marked absent (code "A"). */
  absentDays: number;

  /* ── money ── */
  moneyLost: number;
  basis: PayBasis;
  /** True when this person's pay cannot move with attendance (fixed fee). */
  payUnaffected: boolean;
  /** False when no rate was on file, so the UI can say "not priced" rather
   *  than assert a confident zero. */
  priced: boolean;

  /** True when there is nothing at all to report — a clean week. */
  clean: boolean;

  /** The week's graded days, for the dialog's day-by-day line. */
  days: WeekLossDay[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;
/** Days keep the half-day granularity the rest of the system uses. */
const roundHalf = (n: number) => Math.round(n * 2) / 2;

/**
 * Score one week.
 *
 * `days` must be exactly the graded days of [weekStart, weekEnd] for ONE
 * employee — the caller does the range filtering, so this function never has to
 * know what a week is.
 */
export function computeWeekLoss(
  weekStart: string,
  weekEnd: string,
  days: WeekLossDay[],
  pay: WeekLossPay,
): WeekLoss {
  let expectedDays = 0;
  let ordinaryMinutes = 0;
  let unpaidLeaveDays = 0;
  let lateCount = 0;
  let leftEarlyCount = 0;
  let absentDays = 0;
  let workedMinutes = 0;

  for (const d of days) {
    workedMinutes += Math.max(0, d.workedMinutes);
    if (d.late) lateCount += 1;
    if (d.leftEarly) leftEarlyCount += 1;
    if (d.code === "A") absentDays += 1;

    if (isOrdinaryAttendanceDay(d.code)) {
      expectedDays += 1;
      ordinaryMinutes += Math.max(0, d.workedMinutes);
    } else {
      // A credited day is worth what it is worth. Only a SHORTFALL against a
      // full day is a loss — LWP (0) costs a day, a holiday-working premium
      // (HP = 2) is a bonus and is floored at 0, never a negative "loss".
      unpaidLeaveDays += Math.max(0, 1 - d.dayValue);
    }
  }

  // `dayMinutes` is THIS employee's day, not a fixed 9h — see daysFromMinutes.
  const dayMinutes = pay.dailyTargetMinutes && pay.dailyTargetMinutes > 0
    ? pay.dailyTargetMinutes
    : FULL_DAY_MINUTES;
  const earnedDays = daysFromMinutes(ordinaryMinutes, expectedDays, dayMinutes);
  const hoursShortfallDays = roundHalf(Math.max(0, expectedDays - earnedDays));
  unpaidLeaveDays = roundHalf(unpaidLeaveDays);
  const daysLost = roundHalf(hoursShortfallDays + unpaidLeaveDays);

  const targetMinutes = expectedDays * dayMinutes;
  const shortMinutes = Math.max(0, targetMinutes - ordinaryMinutes);

  const { moneyLost, priced, payUnaffected } = priceLoss(
    pay,
    daysLost,
    shortMinutes,
    expectedDays,
  );

  return {
    weekStart,
    weekEnd,
    expectedDays,
    earnedDays,
    hoursShortfallDays,
    unpaidLeaveDays,
    daysLost,
    workedMinutes,
    targetMinutes,
    shortMinutes,
    lateCount,
    leftEarlyCount,
    absentDays,
    moneyLost,
    basis: pay.basis,
    payUnaffected,
    priced,
    // "Clean" is about what was LOST, not about lateness alone: someone who was
    // late twice but still worked their full 54 hours lost nothing, and telling
    // them otherwise would make the report untrustworthy. The late count is
    // still shown — it is just not, by itself, a loss.
    clean: daysLost <= 0,
    days,
  };
}

/**
 * Turn a loss into rupees, per pay basis.
 *
 * The HOURLY case is priced on hours rather than days because that is literally
 * how a part-timer is paid, and it is capped at one full week's pay — a week
 * with no work at all loses that week's pay and not a rupee more.
 */
function priceLoss(
  pay: WeekLossPay,
  daysLost: number,
  shortMinutes: number,
  expectedDays: number,
): { moneyLost: number; priced: boolean; payUnaffected: boolean } {
  if (pay.basis === "fixed_fee") {
    return { moneyLost: 0, priced: true, payUnaffected: true };
  }

  if (pay.basis === "hourly") {
    if (pay.hourlyRate <= 0) return { moneyLost: 0, priced: false, payUnaffected: false };
    // A part-timer has a WEEKLY hours target, not a per-day expectation, so the
    // shortfall is measured against that target rather than against the graded
    // ordinary days.
    const target = Math.max(0, pay.weeklyTargetMinutes);
    const missed = expectedDays > 0 ? Math.min(shortMinutes, target) : 0;
    return {
      moneyLost: round2((missed / 60) * pay.hourlyRate),
      priced: true,
      payUnaffected: false,
    };
  }

  if (pay.perDay <= 0) return { moneyLost: 0, priced: false, payUnaffected: false };
  return { moneyLost: round2(daysLost * pay.perDay), priced: true, payUnaffected: false };
}

/* ----------------------------------------------------------------------- */
/* Week arithmetic                                                          */
/* ----------------------------------------------------------------------- */

function ymdToUtc(ymd: string): Date {
  return new Date(`${ymd}T00:00:00Z`);
}

function utcToYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDaysYmd(ymd: string, n: number): string {
  const d = ymdToUtc(ymd);
  d.setUTCDate(d.getUTCDate() + n);
  return utcToYmd(d);
}

/** Monday of the week containing `ymd`. Mirrors `weekKeyOf` in hours-rule.ts —
 *  same Monday anchor, so a week means the same thing on both sides. */
export function mondayOfYmd(ymd: string): string {
  const dow = ymdToUtc(ymd).getUTCDay(); // 0 Sun … 6 Sat
  return addDaysYmd(ymd, dow === 0 ? -6 : 1 - dow);
}

/**
 * The week the Monday report is ABOUT: the Mon-Sun that ended yesterday,
 * relative to `today`.
 *
 * Keyed off the CURRENT week's Monday rather than off "today minus 7", so every
 * day of the current week resolves to the same reported week. That is what lets
 * someone who was on leave on Monday still get the report on the first day they
 * actually punch (Tuesday, Wednesday, …) instead of a different week each day.
 */
export function reportedWeekFor(today: string): { weekStart: string; weekEnd: string } {
  const thisMonday = mondayOfYmd(today);
  const weekStart = addDaysYmd(thisMonday, -7);
  return { weekStart, weekEnd: addDaysYmd(weekStart, 6) };
}

/* ----------------------------------------------------------------------- */
/* Formatting                                                               */
/* ----------------------------------------------------------------------- */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "11 Aug" */
export function shortDate(ymd: string): string {
  const [, m, d] = ymd.split("-");
  return `${d} ${MONTHS[Number(m) - 1] ?? m}`;
}

/** "11 Aug – 17 Aug 2026" */
export function weekLabel(weekStart: string, weekEnd: string): string {
  return `${shortDate(weekStart)} – ${shortDate(weekEnd)} ${weekEnd.slice(0, 4)}`;
}

/** "₹3,240" — whole rupees, Indian digit grouping. Paise are noise on a figure
 *  whose job is to land. */
export function rupees(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

/** "1.5 days" / "1 day" / "half a day" */
export function daysLabel(n: number): string {
  if (n === 0.5) return "half a day";
  return `${n % 1 === 0 ? n : n.toFixed(1)} ${n === 1 ? "day" : "days"}`;
}

/** "4h 20m" — the shortfall in the units people actually think in. */
export function hoursLabel(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h === 0) return `${rem}m`;
  if (rem === 0) return `${h}h`;
  return `${h}h ${rem}m`;
}

/** How long the Cancel button stays disabled — the "skippable ad" beat, so the
 *  numbers get read instead of reflex-dismissed. A CLEAN week skips the wait
 *  entirely (see `clean`): friction should be proportional to the problem. */
export const ACK_COUNTDOWN_SECONDS = 5;
