/**
 * Financial-year (Apr–Mar) calendar-week model for the Goals Cascade.
 *
 * The FY is divided into Monday–Sunday calendar weeks numbered **W1 … W52/53**.
 * Each **month owns the 4–5 weeks whose MONDAY falls in it** (§11b-A). The week
 * cascade divides a month's target by that month's ACTUAL week count (4 or 5),
 * not a flat 4. `weekly_goals.week_start` (the Monday date) stays the key; the
 * 1–52 number is derived here.
 *
 * PURE — reuses the string date-math in lib/weekly-goals/week.ts. Dates are
 * `yyyy-mm-dd` strings, which compare lexically == chronologically.
 */
import { addDays, mondayOf } from "@/lib/weekly-goals/week";

export interface FyWeek {
  /** 1-based week number within the FY (W1 = first week of the FY). */
  weekNo: number;
  /** The week's Monday, `yyyy-mm-dd`. */
  mondayISO: string;
  /** Calendar month index (0=Jan) of the Monday — the month that owns this week. */
  monthIndex: number;
}

/** The first Monday on/after Apr 1 of the given FY start year. */
export function firstMondayOfFy(fyStartYear: number): string {
  const aprFirst = `${fyStartYear}-04-01`;
  let monday = mondayOf(aprFirst);
  if (monday < aprFirst) monday = addDays(monday, 7);
  return monday;
}

/** Last calendar day of the FY (Mar 31 of the next year). */
function fyEnd(fyStartYear: number): string {
  return `${fyStartYear + 1}-03-31`;
}

/**
 * Every week of the FY, oldest→newest: `{ weekNo, mondayISO, monthIndex }`.
 * Enumerates each Monday in `[Apr 1 fyStartYear, Mar 31 fyStartYear+1]`.
 */
export function fyWeeks(fyStartYear: number): FyWeek[] {
  const end = fyEnd(fyStartYear);
  const out: FyWeek[] = [];
  let monday = firstMondayOfFy(fyStartYear);
  let weekNo = 1;
  while (monday <= end) {
    out.push({
      weekNo,
      mondayISO: monday,
      monthIndex: Number(monday.slice(5, 7)) - 1,
    });
    monday = addDays(monday, 7);
    weekNo++;
  }
  return out;
}

/** The FY start year that owns a Monday (Apr–Dec → that year; Jan–Mar → prev). */
function fyStartYearOfMonday(monday: string): number {
  const year = Number(monday.slice(0, 4));
  const monthIndex = Number(monday.slice(5, 7)) - 1;
  return monthIndex >= 3 ? year : year - 1;
}

/** The 1-based FY week number for a Monday date. */
export function weekNoOf(monday: string): number {
  const fyStartYear = fyStartYearOfMonday(monday);
  const first = firstMondayOfFy(fyStartYear);
  const diffDays = Math.round(
    (Date.parse(`${monday}T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`)) / 86_400_000,
  );
  return Math.floor(diffDays / 7) + 1;
}

/** How many weeks a month owns in the FY (4 or 5) — the week-cascade divisor. */
export function weeksInMonth(fyStartYear: number, monthIndex: number): number {
  return fyWeeks(fyStartYear).filter((w) => w.monthIndex === monthIndex).length;
}

/** The FY weeks owned by a given calendar month (0=Jan), in order. */
export function weeksOfMonth(fyStartYear: number, monthIndex: number): FyWeek[] {
  return fyWeeks(fyStartYear).filter((w) => w.monthIndex === monthIndex);
}
