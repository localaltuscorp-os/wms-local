/**
 * WHEN A DCC ENTRY MAY STILL BE CHANGED (account holder, 2026-09-15).
 *
 *   · A person changes their own entry only until 11:59 pm IST on the day
 *     itself. At midnight the day closes.
 *   · Only the holder of `dcc.edit_past_entries` (Manan Sir) may change an
 *     entry for a day that has closed — for any employee.
 *   · Nobody fills a day that has not started.
 *
 * Client-safe and pure: the server write path (lib/dcc/write.ts) enforces it,
 * and the fill board reads the same function to show a day as locked, so the
 * screen and the server cannot disagree about which days are open. The server
 * is the authority — a page left open past midnight still gets refused.
 *
 * "Today" is the caller's IST calendar day, passed in: this module carries no
 * clock, which is what lets it be tested and shared.
 */

export type DccEntryWindow = { ok: true } | { ok: false; error: string };

export const DCC_PAST_ENTRY_LOCKED =
  "This day is closed. A DCC entry can be changed only until 11:59 pm on the same day.";

export const DCC_FUTURE_ENTRY_BLOCKED = "You can't fill DCC for a day that hasn't started yet.";

export function checkDccEntryWindow(args: {
  /** The entry's day, YYYY-MM-DD. */
  date: string;
  /** Today in IST, YYYY-MM-DD. */
  today: string;
  /** Holds `dcc.edit_past_entries`. */
  canEditPast: boolean;
}): DccEntryWindow {
  if (args.date > args.today) return { ok: false, error: DCC_FUTURE_ENTRY_BLOCKED };
  if (args.date < args.today && !args.canEditPast) return { ok: false, error: DCC_PAST_ENTRY_LOCKED };
  return { ok: true };
}

export function isDccDayOpen(date: string, today: string, canEditPast: boolean): boolean {
  return checkDccEntryWindow({ date, today, canEditPast }).ok;
}
