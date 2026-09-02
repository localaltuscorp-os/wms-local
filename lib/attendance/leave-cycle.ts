// Pure leave-cycle calculator. Paid leave runs in two six-month periods and
// nothing crosses between them: the allowance is granted per period and whatever
// is left at the boundary simply lapses.
//
// ── TWO RULE ERAS, ON PURPOSE ──────────────────────────────────────────────
// The periods used to be CALENDAR halves (Jan–Jun, Jul–Dec). From
// {@link FY_RULE_FROM} they are FINANCIAL halves (Apr–Sep, Oct–Mar), which is
// what payroll and the leave policy actually run on.
//
// The old rule is KEPT rather than replaced because a period is live right now.
// Re-cutting the boundary mid-period would silently re-date every current
// balance — someone who has taken two of their four leaves would find themselves
// measured against a window that started on a different day. So dates before the
// switch keep answering with the calendar halves they were granted under, and
// the financial halves begin cleanly at the next boundary. Both eras grant the
// same amounts (first half 3, second half 4); only the boundaries move.
//
// Probation-end doubles as the CONFIRMATION date: it gates accrual (leave taken
// before it never counts, via `balanceWindow`) and it drives the pro-rata
// entitlement below.
//
// All date math is in UTC (mirrors lib/outstanding/schedule.ts) so it is
// timezone-stable.

export interface LeaveCycle {
  /** Entitlement for this period, already pro-rated. May be a half, e.g. 3.5. */
  allowance: number;
  /** The period's full entitlement before pro-rata — for "3.5 of 4" copy. */
  fullAllowance: number;
  /** 1 = first half (3 leaves), 2 = second half (4 leaves). */
  half: 1 | 2;
  cycleStart: string;
  cycleEnd: string;
  beforeProbation: boolean;
  /** True when `allowance` was reduced because confirmation fell mid-period. */
  proRated: boolean;
}

/** Paid leaves granted in the FIRST half (Jan–Jun, or Apr–Sep from the switch). */
export const H1_ALLOWANCE = 3;
/** Paid leaves granted in the SECOND half (Jul–Dec, or Oct–Mar from the switch). */
export const H2_ALLOWANCE = 4;

/**
 * The day the financial-half rule takes over.
 *
 * Chosen to BE a boundary under the new rule, so the changeover never lands
 * mid-period: Jul–Dec 2026 runs to completion under the old rule, and
 * Oct 2026–Mar 2027 is the first financial half.
 */
export const FY_RULE_FROM = "2026-10-01";

/** Months in a leave period. Both eras are six-month halves. */
const PERIOD_MONTHS = 6;

function parse(iso: string): [number, number, number] {
  return iso.split("-").map(Number) as [number, number, number];
}

const pad = (n: number) => String(n).padStart(2, "0");
const at = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** The period bounds for a date, under whichever rule era that date falls in. */
function periodFor(date: string): { half: 1 | 2; cycleStart: string; cycleEnd: string } {
  const [year, month] = parse(date);

  if (date < FY_RULE_FROM) {
    // Legacy: calendar halves.
    return month <= 6
      ? { half: 1, cycleStart: at(year, 1, 1), cycleEnd: at(year, 6, 30) }
      : { half: 2, cycleStart: at(year, 7, 1), cycleEnd: at(year, 12, 31) };
  }

  // Financial halves. Oct–Mar SPANS a year boundary, so Jan–Mar belongs to the
  // period that opened the previous October — the case a naive month test gets
  // wrong, handing January a period that has not started yet.
  if (month >= 4 && month <= 9) {
    return { half: 1, cycleStart: at(year, 4, 1), cycleEnd: at(year, 9, 30) };
  }
  const startYear = month >= 10 ? year : year - 1;
  return { half: 2, cycleStart: at(startYear, 10, 1), cycleEnd: at(startYear + 1, 3, 31) };
}

/** Whole months from `from`'s month to `to`'s month, inclusive of both. */
function monthsInclusive(from: string, to: string): number {
  const [fy, fm] = parse(from);
  const [ty, tm] = parse(to);
  return (ty - fy) * 12 + (tm - fm) + 1;
}

/** Round UP to the nearest half-day: 3.1 → 3.5, 3.5 → 3.5, 3.6 → 4. */
export function roundUpToHalf(n: number): number {
  return Math.ceil(n * 2) / 2;
}

/**
 * Entitlement for someone CONFIRMED PART-WAY through a period.
 *
 * Counts whole months from the confirmation month to the period end, inclusive
 * of both — so "confirmed in November" earns November through March, five of the
 * six months, and 4 × 5/6 = 3.33 rounds up to 3.5. Rounding is UPWARD and to the
 * nearest HALF day: the policy grants half days, and rounding down would quietly
 * shave entitlement off every mid-period joiner.
 *
 * `confirmedOn` of null means "confirmed long ago" and yields the full
 * allowance. That is the honest reading of a missing date and the safe direction
 * to fail — on the production roster only 3 of 24 employees have one recorded,
 * so treating absence as "confirmed today" would pro-rate almost everybody down.
 */
export function proRataAllowance(
  fullAllowance: number,
  confirmedOn: string | null | undefined,
  cycleStart: string,
  cycleEnd: string,
): number {
  if (!confirmedOn) return fullAllowance;
  if (confirmedOn <= cycleStart) return fullAllowance;
  if (confirmedOn > cycleEnd) return 0;
  const months = Math.min(monthsInclusive(confirmedOn, cycleEnd), PERIOD_MONTHS);
  return Math.min(fullAllowance, roundUpToHalf((fullAllowance * months) / PERIOD_MONTHS));
}

/**
 * The paid-leave period `date` falls in, with this employee's entitlement in it.
 *
 * `probationEnd` is the confirmation date. Null means confirmed before living
 * memory — full allowance, no pro-rata. A date before it returns the real period
 * bounds with a 0 allowance and `beforeProbation: true`, so the UI can still
 * name the period it is refusing.
 */
export function leaveCycleFor(
  probationEnd: string | null | undefined,
  date: string,
): LeaveCycle {
  const { half, cycleStart, cycleEnd } = periodFor(date);
  const fullAllowance = half === 1 ? H1_ALLOWANCE : H2_ALLOWANCE;

  if (probationEnd && date < probationEnd) {
    return {
      allowance: 0,
      fullAllowance,
      half,
      cycleStart,
      cycleEnd,
      beforeProbation: true,
      proRated: false,
    };
  }

  const allowance = proRataAllowance(fullAllowance, probationEnd, cycleStart, cycleEnd);
  return {
    allowance,
    fullAllowance,
    half,
    cycleStart,
    cycleEnd,
    beforeProbation: false,
    proRated: allowance !== fullAllowance,
  };
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Human label for a period, e.g. "Jan–Jun 2026" or "Oct 2026–Mar 2027".
 *
 * Derived from the stored bounds rather than from `half`, because the two rule
 * eras give `half` different months — a label that guessed from `half` would be
 * wrong for exactly the periods people look at hardest during the changeover. A
 * period spanning a year boundary names both years.
 */
export function leaveCycleLabel(cycle: Pick<LeaveCycle, "cycleStart" | "cycleEnd">): string {
  const [sy, sm] = parse(cycle.cycleStart);
  const [ey, em] = parse(cycle.cycleEnd);
  return sy === ey
    ? `${MON[sm - 1]}–${MON[em - 1]} ${sy}`
    : `${MON[sm - 1]} ${sy}–${MON[em - 1]} ${ey}`;
}

/** The period immediately before the one starting at `cycleStart` — used to
 *  surface (read-only) what lapsed. Returns its last day, YYYY-MM-DD. */
export function previousCycleEnd(cycleStart: string): string {
  const [year, month] = parse(cycleStart);
  switch (month) {
    // Financial halves.
    case 4:
      return at(year, 3, 31); // preceded by Oct–Mar
    case 10:
      return at(year, 9, 30); // preceded by Apr–Sep
    // Calendar halves (legacy).
    case 1:
      return at(year - 1, 12, 31);
    default:
      return at(year, 6, 30);
  }
}

/** Inclusive day count between two ISO dates (UTC), e.g. 03-01..03-03 → 3. */
export function daysInDateRange(start: string, end: string): number {
  const [ys, ms, ds] = parse(start);
  const [ye, me, de] = parse(end);
  const a = Date.UTC(ys, ms - 1, ds);
  const b = Date.UTC(ye, me - 1, de);
  return Math.floor((b - a) / 86_400_000) + 1;
}

/**
 * The window over which approved paid-leave days count against this cycle's
 * allowance: [max(cycleStart, probationEnd), cycleEnd]. Clamping the lower
 * bound to probation-end means a mid-period hire's pre-probation days never
 * eat into the allowance. Returns null when the window is empty (probationEnd
 * after cycleEnd, which shouldn't happen for the current cycle but is guarded).
 */
export function balanceWindow(
  probationEnd: string | null | undefined,
  cycleStart: string,
  cycleEnd: string,
): { from: string; to: string } | null {
  const from = probationEnd && probationEnd > cycleStart ? probationEnd : cycleStart;
  if (from > cycleEnd) return null;
  return { from, to: cycleEnd };
}

/**
 * Inclusive overlap (in calendar days) between a leave's [start,end] and the
 * balance window [from,to]. Pure; used to count approved paid-leave days that
 * actually fall inside the clamped cycle window. 0 when they don't overlap.
 */
export function overlapDays(
  leaveStart: string,
  leaveEnd: string,
  from: string,
  to: string,
): number {
  const lo = leaveStart > from ? leaveStart : from;
  const hi = leaveEnd < to ? leaveEnd : to;
  if (lo > hi) return 0;
  return daysInDateRange(lo, hi);
}

/**
 * Half-day boundaries on a leave request (0208).
 *
 * THE TWO FLAGS ARE NOT SYMMETRIC, and that asymmetry is the whole feature:
 *
 *   · `startHalfDay` — the leave BEGINS at midday on `startDate`. You work the
 *     morning and leave at lunch.
 *   · `endHalfDay`   — the leave ENDS at midday on `endDate`. You are back
 *     after lunch.
 *
 * So "from the second half of 24 Sep, back on the second half of 30 Sep" is
 * `{ 24 Sep, startHalfDay: true, 30 Sep, endHalfDay: true }` → **6 days**, not
 * the 7 an inclusive count gives. Each flag shaves exactly the half that is
 * actually worked.
 */
export interface LeaveSpan {
  startDate: string;
  endDate: string;
  startHalfDay?: boolean | null;
  endHalfDay?: boolean | null;
}

/**
 * The chargeable length of a leave request, in days, halves included.
 *
 * A SINGLE-DAY leave with either flag is 0.5 — both flags name the same day, so
 * only one half can come off it. Subtracting both would cancel the day to zero
 * and let someone book a leave that costs nothing. The DB CHECK
 * `leave_requests_half_day_chk` refuses that combination outright; this clamp
 * keeps the arithmetic right regardless of what is already stored.
 */
export function leaveDays(span: LeaveSpan): number {
  const total = daysInDateRange(span.startDate, span.endDate);
  if (total <= 0) return 0;
  if (total === 1) return span.startHalfDay || span.endHalfDay ? 0.5 : 1;
  return total - (span.startHalfDay ? 0.5 : 0) - (span.endHalfDay ? 0.5 : 0);
}

/**
 * `leaveDays`, clipped to a balance window — what a leave actually costs against
 * one cycle's allowance.
 *
 * A half comes off only when the day carrying it FALLS INSIDE the window. A
 * leave that starts in September and runs into October charges its half-day
 * start to Apr–Sep and nothing to Oct–Mar, because the morning that was worked
 * happened in September. A clipped edge is a full day of leave that simply
 * continues past the boundary, so it is never treated as a half.
 */
export function leaveDaysInWindow(span: LeaveSpan, from: string, to: string): number {
  const lo = span.startDate > from ? span.startDate : from;
  const hi = span.endDate < to ? span.endDate : to;
  if (lo > hi) return 0;

  const total = daysInDateRange(lo, hi);
  const startsHere = lo === span.startDate && !!span.startHalfDay;
  const endsHere = hi === span.endDate && !!span.endHalfDay;

  if (total === 1) return startsHere || endsHere ? 0.5 : 1;
  return total - (startsHere ? 0.5 : 0) - (endsHere ? 0.5 : 0);
}

/**
 * Is `ymd` a HALF-day of this leave — the boundary day whose other half is
 * worked? Used by the grader, which must not hand out a full day's credit for
 * a half-day leave.
 */
export function isHalfLeaveDay(span: LeaveSpan, ymd: string): boolean {
  if (span.startDate === span.endDate) {
    return ymd === span.startDate && !!(span.startHalfDay || span.endHalfDay);
  }
  if (ymd === span.startDate) return !!span.startHalfDay;
  if (ymd === span.endDate) return !!span.endHalfDay;
  return false;
}
