// WS-5 Salary — PURE attendance-analytics maths (no DB, no I/O).
//
// The attendance grader (lib/queries/attendance-status.ts) already grades every
// day of a month and rolls a per-month summary (present/late/lateWaived/…). This
// module turns one or more of those monthly summaries into the DISCIPLINE ratios
// the salary sheet wants — always as "X / N" with a percentage — and aggregates
// them across a period (this-month · last-3-months · fiscal-YTD).
//
// "where discipline matters." — spec WS-5 Statements & analytics.
//
// Denominator convention (N): ATTENDED days — days on which a check-in exists,
// i.e. the days on which lateness / an early start is even measurable. A pure
// weekly-off / holiday / leave day can't be "late", so counting it in N would
// dilute the percentage. (Documented as an assumption in the INTEGRATION NOTE.)

/** The minimal slice of a graded month this module needs. Mirrors the fields on
 *  `MonthSummary` (attendance-status.ts) plus an attended-day count derived from
 *  the day rows — kept structural so this file never imports the DB layer. */
export interface MonthMetricsInput {
  /** "YYYY-MM". */
  month: string;
  /** Days with a check-in (present/half/holiday-present/incomplete) — the N. */
  attendedDays: number;
  /** ALL late arrivals, including those later waived by a full day (lateRaw). */
  lateRaw: number;
  /** Late arrivals forgiven because a full day was still worked (lateWaived). */
  lateWaived: number;
  /** Days the person left before the early-out threshold. */
  leftEarly: number;
}

/** One computed discipline row for a period (a month, or an aggregate window). */
export interface AttendanceMetrics {
  /** Denominator: attended days in the period. */
  attendedDays: number;
  /** All late arrivals (incl. waived). */
  lateDays: number;
  /** Late arrivals that were waived. */
  lateWaivedDays: number;
  /** Un-waived (actionable) late = lateDays − lateWaivedDays, floored at 0. */
  lateNetDays: number;
  /** Attended days that were NOT late — i.e. started on-time or early. */
  startedEarlyDays: number;
  /** Left-early days. */
  leftEarlyDays: number;
}

/** A single "X / N (P%)" ratio, ready for the UI. */
export interface Ratio {
  x: number;
  n: number;
  /** Rounded percentage 0..100 (0 when n is 0). */
  pct: number;
}

export function ratio(x: number, n: number): Ratio {
  const safeN = Math.max(0, n);
  const safeX = Math.max(0, x);
  return { x: safeX, n: safeN, pct: safeN === 0 ? 0 : Math.round((safeX / safeN) * 100) };
}

/**
 * The four discipline headline ratios, each as a share of days actually
 * attended.
 *
 * PURE, and it lives here rather than beside the loader on purpose: this is
 * arithmetic over an already-fetched `AttendanceMetrics`, and the salary screen
 * renders it from a CLIENT component. Keeping it in the server-only query module
 * dragged `server-only` (and with it drizzle and the db handle) into the client
 * bundle, which fails the build outright. Nothing here touches I/O.
 */
export function headlineRatios(m: AttendanceMetrics): {
  late: Ratio;
  lateWaived: Ratio;
  startedEarly: Ratio;
  leftEarly: Ratio;
} {
  return {
    late: ratio(m.lateDays, m.attendedDays),
    lateWaived: ratio(m.lateWaivedDays, m.attendedDays),
    startedEarly: ratio(m.startedEarlyDays, m.attendedDays),
    leftEarly: ratio(m.leftEarlyDays, m.attendedDays),
  };
}

/** "3/30" */
export function fmtRatio(r: Ratio): string {
  return `${trimNum(r.x)}/${trimNum(r.n)}`;
}

/** "10%" */
export function fmtPct(r: Ratio): string {
  return `${r.pct}%`;
}

/** Drop a trailing ".00"/".5" cleanly (half-days can be fractional). */
function trimNum(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

/** Build the discipline metrics for one month from its graded summary. */
export function monthMetrics(input: MonthMetricsInput): AttendanceMetrics {
  const attendedDays = Math.max(0, input.attendedDays);
  const lateDays = Math.max(0, input.lateRaw);
  const lateWaivedDays = Math.max(0, input.lateWaived);
  const lateNetDays = Math.max(0, lateDays - lateWaivedDays);
  // Started-early = attended and NOT late. Never negative.
  const startedEarlyDays = Math.max(0, attendedDays - lateDays);
  return {
    attendedDays,
    lateDays,
    lateWaivedDays,
    lateNetDays,
    startedEarlyDays,
    leftEarlyDays: Math.max(0, input.leftEarly),
  };
}

/** Sum a set of monthly metrics into one aggregate window. */
export function aggregateMetrics(list: AttendanceMetrics[]): AttendanceMetrics {
  return list.reduce<AttendanceMetrics>(
    (acc, m) => ({
      attendedDays: acc.attendedDays + m.attendedDays,
      lateDays: acc.lateDays + m.lateDays,
      lateWaivedDays: acc.lateWaivedDays + m.lateWaivedDays,
      lateNetDays: acc.lateNetDays + m.lateNetDays,
      startedEarlyDays: acc.startedEarlyDays + m.startedEarlyDays,
      leftEarlyDays: acc.leftEarlyDays + m.leftEarlyDays,
    }),
    {
      attendedDays: 0,
      lateDays: 0,
      lateWaivedDays: 0,
      lateNetDays: 0,
      startedEarlyDays: 0,
      leftEarlyDays: 0,
    },
  );
}

// ── month-range helpers (fiscal year = Apr–Mar) ──────────────────────────────

/** Add `delta` months to a "YYYY-MM" (delta may be negative). */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** The `n` months ENDING at `month` (inclusive), oldest→newest. */
export function lastNMonths(month: string, n: number): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(shiftMonth(month, -i));
  return out;
}

/** The fiscal-year start month ("YYYY-04") for a "YYYY-MM". Jan–Mar → prior yr. */
export function fyStartMonth(month: string): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const startYear = m >= 4 ? y : y - 1;
  return `${startYear}-04`;
}

/** Every "YYYY-MM" from the fiscal-year start up to and including `month`. */
export function ytdMonths(month: string): string[] {
  const start = fyStartMonth(month);
  const out: string[] = [];
  let cur = start;
  // Guard the loop at 12 (a fiscal year is 12 months).
  for (let i = 0; i < 12; i++) {
    out.push(cur);
    if (cur === month) break;
    cur = shiftMonth(cur, 1);
  }
  return out;
}
