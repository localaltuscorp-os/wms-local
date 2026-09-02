// Pure leave-cycle calculator (Phase B). The leave allowance is anchored at an
// employee's probation-end date: each 12-month span from probation-end's
// anniversary splits into two halves — the first 6 months grant 3 leaves, the
// next 6 months grant 4. Before probation-end no leave accrues. All date math
// is in UTC (mirrors lib/outstanding/schedule.ts) so it is timezone-stable.

export interface LeaveCycle {
  allowance: number;
  half: 1 | 2;
  cycleStart: string;
  cycleEnd: string;
  beforeProbation: boolean;
}

function parse(iso: string): [number, number, number] {
  return iso.split("-").map(Number) as [number, number, number];
}

/** Whole-month difference start→date (date - start), ignoring the day-of-month. */
function monthsBetween(start: string, date: string): number {
  const [ys, ms] = parse(start);
  const [yd, md] = parse(date);
  return (yd - ys) * 12 + (md - ms);
}

/** First day of the month that is `n` months after `iso`'s month. */
function firstOfMonthOffset(iso: string, n: number): string {
  const [y, m] = parse(iso);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 10);
}

/** Last day of the month that is `n` months after `iso`'s month. */
function lastOfMonthOffset(iso: string, n: number): string {
  const [y, m] = parse(iso);
  return new Date(Date.UTC(y, m - 1 + n + 1, 0)).toISOString().slice(0, 10);
}

export function leaveCycleFor(probationEnd: string, date: string): LeaveCycle {
  if (date < probationEnd) {
    return {
      allowance: 0,
      half: 1,
      cycleStart: probationEnd,
      cycleEnd: probationEnd,
      beforeProbation: true,
    };
  }

  const monthsSinceProbation = monthsBetween(probationEnd, date);
  const k = Math.floor(monthsSinceProbation / 12);
  // Start of the current 12-month span (probationEnd + k years).
  const spanStart = firstOfMonthOffset(probationEnd, k * 12);
  const monthsIn = monthsBetween(spanStart, date);
  const half: 1 | 2 = monthsIn < 6 ? 1 : 2;
  const allowance = half === 1 ? 3 : 4;

  const halfStartOffset = half === 1 ? 0 : 6;
  const cycleStart = firstOfMonthOffset(spanStart, halfStartOffset);
  const cycleEnd = lastOfMonthOffset(spanStart, halfStartOffset + 5);

  return { allowance, half, cycleStart, cycleEnd, beforeProbation: false };
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
  probationEnd: string,
  cycleStart: string,
  cycleEnd: string,
): { from: string; to: string } | null {
  const from = probationEnd > cycleStart ? probationEnd : cycleStart;
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
