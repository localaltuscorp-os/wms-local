/**
 * Pure week-math helpers for the Weekly Goals planner.
 *
 * A "week" runs Monday→Sunday and is identified by its Monday as a plain
 * `yyyy-mm-dd` string (matching the `weekly_goals.week_start` DATE column).
 * All bucketing keys off IST (Asia/Kolkata) because that's the team's clock —
 * the Monday email, the Saturday reminder, and the dashboard ranking windows
 * all reason in IST. No DB, no I/O — safe to import anywhere.
 */

export const TZ = "Asia/Kolkata";

/** yyyy-mm-dd for a Date, in IST. */
export function istYmd(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: TZ });
}

/** Parse a yyyy-mm-dd as UTC midnight so date math never drifts across DST. */
function ymdToUtc(ymd: string): Date {
  return new Date(`${ymd}T00:00:00Z`);
}

function utcToYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Shift a yyyy-mm-dd by `n` whole days. */
export function addDays(ymd: string, n: number): string {
  const d = ymdToUtc(ymd);
  d.setUTCDate(d.getUTCDate() + n);
  return utcToYmd(d);
}

/** Monday (week start) of the week containing the given date/ymd, in IST. */
export function mondayOf(input: Date | string): string {
  const ymd = typeof input === "string" ? input : istYmd(input);
  const dow = ymdToUtc(ymd).getUTCDay(); // 0 Sun … 6 Sat
  const delta = dow === 0 ? -6 : 1 - dow; // walk back to Monday
  return addDays(ymd, delta);
}

/** Sunday (week end) for a Monday week-start. */
export function weekEnd(weekStart: string): string {
  return addDays(weekStart, 6);
}

export function currentWeekStart(now: Date = new Date()): string {
  return mondayOf(now);
}

export function nextWeekStart(weekStart: string): string {
  return addDays(weekStart, 7);
}

export function prevWeekStart(weekStart: string): string {
  return addDays(weekStart, -7);
}

/** "Jun 2 – Jun 8, 2026" */
export function formatWeekLabel(weekStart: string): string {
  const start = ymdToUtc(weekStart);
  const end = ymdToUtc(weekEnd(weekStart));
  const opts = { month: "short", day: "numeric", timeZone: "UTC" } as const;
  return `${start.toLocaleDateString("en-US", opts)} – ${end.toLocaleDateString(
    "en-US",
    opts,
  )}, ${end.getUTCFullYear()}`;
}

/** "Mon, Jun 2" — compact single-day label. */
export function formatWeekShort(weekStart: string): string {
  return ymdToUtc(weekStart).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** The N most-recent Monday week-starts, oldest → newest, ending at `now`. */
export function recentWeekStarts(n: number, now: Date = new Date()): string[] {
  const current = currentWeekStart(now);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(addDays(current, -7 * i));
  return out;
}

/** First IST day of the current month, yyyy-mm-dd. */
export function monthStart(now: Date = new Date()): string {
  return `${istYmd(now).slice(0, 7)}-01`;
}

/** First IST day of the current year, yyyy-mm-dd. */
export function yearStart(now: Date = new Date()): string {
  return `${istYmd(now).slice(0, 4)}-01-01`;
}

export type PerformerPeriod = "week" | "month" | "year";

/**
 * The [start, end] yyyy-mm-dd window (inclusive of weeks whose Monday falls
 * in range) used to aggregate a performer-of-the-X leaderboard. We key off
 * week_start, so each window is "every week whose Monday is ≥ start".
 */
export function periodStart(period: PerformerPeriod, now: Date = new Date()): string {
  if (period === "week") return currentWeekStart(now);
  if (period === "month") return monthStart(now);
  return yearStart(now);
}
