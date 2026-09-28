/**
 * MONTHLY EVENTS MASTER — what you are looking at, and what to call it.
 *
 * The four horizons (day / week / month / year) each need three things: the
 * date range to load, where the arrows go, and — the fiddly part — a LABEL that
 * reads the way a person would say it.
 *
 *     day    Yesterday · Today · Tomorrow, then "24 Sep"
 *     week   Last week · This week · Next week, then "27 Sep – 3 Oct"
 *     month  September · October 2027   (the year only when it is not this one)
 *     year   2026
 *
 * Relative names only stretch one step either side of now, deliberately. "Two
 * weeks ago" is not how anybody reads a calendar toolbar, and a label that
 * silently becomes vaguer the further you scroll is worse than a date.
 *
 * PURE: every function takes `today`, so nothing here reads a clock and the
 * labels are testable at a fixed date.
 */

import { addDays, addMonths, monthStart, parseDay, weekStart } from "./grid";

export type CalendarView = "day" | "grid" | "week" | "month" | "monthgrid" | "year";

/** Weeks the Weekly Grid shows: the chosen one and the three after it. */
export const GRID_WEEKS = 4;

export const CALENDAR_VIEWS: { key: CalendarView; label: string }[] = [
  { key: "day", label: "Day" },
  // Left of Week (asked 2026-09-18): a spreadsheet of stacked weeks.
  { key: "grid", label: "Weekly Grid" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  // The Excel-sheet-shaped month view (2026-09-24): day boxes with compact
  // event pills, no fixed time-slot Y-axis — distinct from "Month" above,
  // which caps at 3 chips per day and is tuned for the Year view's 12-up size.
  { key: "monthgrid", label: "Monthly Grid" },
  { key: "year", label: "Year" },
];

export function isCalendarView(v: string | null | undefined): v is CalendarView {
  return v === "day" || v === "grid" || v === "week" || v === "month" || v === "monthgrid" || v === "year";
}

/** The inclusive range a view loads — one query serves the grid and the stats. */
export function periodRange(view: CalendarView, day: string): { from: string; to: string } {
  switch (view) {
    case "day":
      return { from: day, to: day };
    case "week": {
      const monday = weekStart(day);
      return { from: monday, to: addDays(monday, 6) };
    }
    case "grid": {
      const monday = weekStart(day);
      return { from: monday, to: addDays(monday, 7 * GRID_WEEKS - 1) };
    }
    case "month":
    case "monthgrid": {
      const first = monthStart(day);
      return { from: first, to: addDays(addMonths(first, 1), -1) };
    }
    case "year":
      return { from: `${day.slice(0, 4)}-01-01`, to: `${day.slice(0, 4)}-12-31` };
  }
}

/** Where the ← and → arrows land. */
export function stepPeriod(view: CalendarView, day: string, dir: -1 | 1): string {
  switch (view) {
    case "day":
      return addDays(day, dir);
    case "week":
    case "grid": // same week-by-week navigation as Week
      return addDays(day, 7 * dir);
    case "month":
    case "monthgrid":
      return addMonths(day, dir);
    case "year":
      return `${Number(day.slice(0, 4)) + dir}${day.slice(4)}`;
  }
}

/**
 * Month names are a FIXED TABLE, not `toLocaleDateString`. Node's en-GB renders
 * September as "Sept" (four letters) while every other month is three, so a
 * toolbar built on the locale jiggles as you arrow through the year. The brief
 * writes "27th Sep to 3rd Oct"; this gives exactly that, on every machine.
 */
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DMY = (ymd: string, withYear = false) => {
  const d = parseDay(ymd);
  const base = `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]}`;
  return withYear ? `${base} ${d.getUTCFullYear()}` : base;
};

/**
 * What to call the period on screen — the label the toolbar button carries.
 * Clicking that button always returns to now, whatever it currently says.
 */
export function periodLabel(view: CalendarView, day: string, today: string): string {
  switch (view) {
    case "day": {
      if (day === today) return "Today";
      if (day === addDays(today, -1)) return "Yesterday";
      if (day === addDays(today, 1)) return "Tomorrow";
      return DMY(day, day.slice(0, 4) !== today.slice(0, 4));
    }
    case "week":
    case "grid": {
      const monday = weekStart(day);
      const thisMonday = weekStart(today);
      if (monday === thisMonday) return "This week";
      if (monday === addDays(thisMonday, -7)) return "Last week";
      if (monday === addDays(thisMonday, 7)) return "Next week";
      const sunday = addDays(monday, 6);
      const sameYear = monday.slice(0, 4) === today.slice(0, 4);
      return `${DMY(monday)} – ${DMY(sunday, !sameYear)}`;
    }
    case "month":
    case "monthgrid": {
      const sameYear = day.slice(0, 4) === today.slice(0, 4);
      const d = parseDay(monthStart(day));
      const name = MONTHS_LONG[d.getUTCMonth()]!;
      return sameYear ? name : `${name} ${d.getUTCFullYear()}`;
    }
    case "year":
      return day.slice(0, 4);
  }
}

/** True when the view is already showing the period containing `today`. */
export function isNow(view: CalendarView, day: string, today: string): boolean {
  switch (view) {
    case "day":
      return day === today;
    case "week":
    case "grid":
      return weekStart(day) === weekStart(today);
    case "month":
    case "monthgrid":
      return day.slice(0, 7) === today.slice(0, 7);
    case "year":
      return day.slice(0, 4) === today.slice(0, 4);
  }
}

/**
 * The years offered in the jump strip: this year and the next few.
 *
 * Forward-only, because the sheet this replaces is a PLANNING document — the
 * back-catalogue is reachable by arrowing, and a strip of past years was mostly
 * making the row too wide to fit beside the stats panel.
 */
export function yearChoices(today: string, count = 4): number[] {
  const y = Number(today.slice(0, 4));
  return Array.from({ length: count }, (_, i) => y + i);
}

/** "September" / "September 2027" — shared with the month and year headings. */
export function monthName(ymd: string, withYear = false): string {
  const d = parseDay(monthStart(ymd));
  const name = MONTHS_LONG[d.getUTCMonth()]!;
  return withYear ? `${name} ${d.getUTCFullYear()}` : name;
}
