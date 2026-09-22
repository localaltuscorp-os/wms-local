/**
 * IST DATE HELPERS — pure, no `server-only`, so the client tracker, the server
 * sessions module and the unit tests share one definition of "the IST calendar
 * day".
 *
 * A day is the IST wall-clock day (Asia/Kolkata, UTC+05:30). Shifting an instant
 * by +05:30 and reading UTC date parts yields the IST date without depending on
 * the host's timezone.
 */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** The IST calendar date (YYYY-MM-DD) an instant falls on. */
export function istDateKey(now: Date): string {
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Today's IST calendar date. */
export function istTodayKey(now: Date = new Date()): string {
  return istDateKey(now);
}

/** Shift a Date so its UTC fields read as IST wall-clock — for display/formatting. */
export function toIst(date: Date): Date {
  return new Date(date.getTime() + IST_OFFSET_MS);
}
