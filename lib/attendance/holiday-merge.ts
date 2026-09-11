/**
 * UPCOMING-HOLIDAY RULES — the pure core behind "what's my next day off".
 *
 * PURE + CLIENT-SAFE (no DB, no I/O, no `new Date()` of its own): the query
 * layer in lib/queries/upcoming-holidays.ts does the two reads and hands the
 * rows here, so the rules that decide what actually reaches the panel are
 * testable without a database. Same split as lib/attendance/hours-rule.ts.
 *
 * THREE RULES LIVE HERE:
 *   1. MERGE — the Admin Panel's holiday list and the Monthly Events Master are
 *      one calendar as far as an employee is concerned.
 *   2. NO SUNDAYS — Sunday is already a weekly off, so a holiday landing on one
 *      buys nobody time away from work.
 *   3. NO HORIZON — the next day off is the next day off, whether it is next
 *      Tuesday or fourteen months out.
 */

/** A holiday as either calendar can describe it, once normalised. */
export interface MergeableHoliday {
  /** yyyy-mm-dd. */
  date: string;
  label: string;
  /** OPTIONAL holiday — offered, not automatic. */
  optional?: boolean;
}

export interface UpcomingHoliday {
  date: string;
  label: string;
  /** Whole days from today (0 = today). */
  inDays: number;
  optional: boolean;
}

/** Whole days between two yyyy-mm-dd, via UTC so DST can never shift it. */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/** Sunday? Parsed at UTC noon so no timezone can nudge it onto the wrong day. */
export function isSunday(ymd: string): boolean {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12)).getUTCDay() === 0;
}

/**
 * Merge the two calendars into the list the panel renders.
 *
 * `preferred` is merged first and wins any date both calendars claim — pass the
 * Monthly Events Master there, because that is the calendar the "Holiday List"
 * page renders and the two must not disagree one click apart.
 *
 * Everything before `today` is dropped, Sundays are dropped, duplicate dates
 * collapse, and the result is date-sorted and cut to `limit`. There is
 * deliberately no upper bound on how far ahead a holiday may be.
 *
 * `suppressed` is the WITHDRAWAL list — dates an admin has explicitly marked
 * "not a holiday" (an inactive `holidays` row). It is the only way to cancel a
 * day the PUBLISHED calendar declares, since that calendar lives in code, and it
 * has to be applied here so this panel and the attendance grader
 * (lib/queries/holidays.listHolidayDateSet) can never show different calendars.
 */
export function mergeUpcomingHolidays(
  preferred: readonly MergeableHoliday[],
  fallback: readonly MergeableHoliday[],
  today: string,
  limit: number,
  suppressed: ReadonlySet<string> = new Set(),
): UpcomingHoliday[] {
  const byDate = new Map<string, UpcomingHoliday>();

  for (const source of [preferred, fallback]) {
    for (const h of source) {
      if (!h?.date || h.date < today) continue;
      if (suppressed.has(h.date)) continue;
      // Rule 2 — see the header. Applied to both calendars, before the
      // first-wins de-duplication, so a Sunday in one cannot mask a real
      // holiday in the other on the same date.
      if (isSunday(h.date)) continue;
      if (byDate.has(h.date)) continue;
      byDate.set(h.date, {
        date: h.date,
        label: h.label,
        inDays: daysBetween(today, h.date),
        optional: h.optional === true,
      });
    }
  }

  return [...byDate.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, Math.max(0, limit));
}
