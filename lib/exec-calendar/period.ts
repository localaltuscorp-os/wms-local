/**
 * MONTHLY EVENTS MASTER — what you are looking at, and what to call it.
 *
 * Each calendar view defines its data range, navigation step, and compact label.
 *
 *     day    Yesterday · Today · Tomorrow, then "24 Sep"
 *     week   Last week · This week · Next week, then "27 Sep – 3 Oct"
 *     month  September · October 2027   (the year only when it is not this one)
 *     quarter Q3 2026
 *
 * Relative names only stretch one step either side of now, deliberately. "Two
 * weeks ago" is not how anybody reads a calendar toolbar, and a label that
 * silently becomes vaguer the further you scroll is worse than a date.
 *
 * PURE: every function takes `today`, so nothing here reads a clock and the
 * labels are testable at a fixed date.
 */

import { addDays, addMonths, monthStart, parseDay, weekStart } from "./grid";

export type CalendarView = "day" | "week" | "grid" | "month" | "monthgrid" | "quarter";

/** Weeks the Weekly Grid shows: the chosen one and the five after it (2026-09-26: was 4). */
export const GRID_WEEKS = 6;

export const CALENDAR_VIEWS: { key: CalendarView; label: string }[] = [
  { key: "day", label: "Day" },
  { key: "week", label: "Week" },
  { key: "grid", label: "Weekly Grid" },
  { key: "month", label: "Month" },
  { key: "monthgrid", label: "Month at a Glance" },
  { key: "quarter", label: "Quarter" },
];

export function isCalendarView(v: string | null | undefined): v is CalendarView {
  return v === "day" || v === "week" || v === "grid" || v === "month" || v === "monthgrid" || v === "quarter";
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
    case "monthgrid": {
      const from = weekStart(monthStart(day));
      const last = addDays(addMonths(monthStart(day), 1), -1);
      return { from, to: addDays(weekStart(last), 6) };
    }
    case "month": {
      const first = monthStart(day);
      return { from: first, to: addDays(addMonths(first, 1), -1) };
    }
    case "quarter": {
      const d = parseDay(day);
      const year = d.getUTCFullYear();
      const m = d.getUTCMonth(); // 0-based: 0=Jan..11=Dec
      // Financial Year: Q1 (Apr–Jun), Q2 (Jul–Sep), Q3 (Oct–Dec), Q4 (Jan–Mar).
      // Jan–Mar belong to the FY that started the previous April.
      const fyStart = m >= 3 ? year : year - 1;
      const qIndex = Math.floor(((m - 3 + 12) % 12) / 3); // 0=Q1, 1=Q2, 2=Q3, 3=Q4
      const calYear = qIndex === 3 ? fyStart + 1 : fyStart;
      const startMonth = qIndex === 0 ? "04" : qIndex === 1 ? "07" : qIndex === 2 ? "10" : "01";
      const first = `${calYear}-${startMonth}-01`;
      return { from: first, to: addDays(addMonths(first, 3), -1) };
    }
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
    case "monthgrid":
    case "month":
      return addMonths(monthStart(day), dir);
    case "quarter":
      return addMonths(periodRange("quarter", day).from, 3 * dir);
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
    case "grid":
    {
      const monday = weekStart(day);
      const thisMonday = weekStart(today);
      if (monday === thisMonday) return "This week";
      if (monday === addDays(thisMonday, -7)) return "Last week";
      if (monday === addDays(thisMonday, 7)) return "Next week";
      const sunday = addDays(monday, 6);
      const sameYear = monday.slice(0, 4) === today.slice(0, 4);
      return `${DMY(monday)} – ${DMY(sunday, !sameYear)}`;
    }
    case "month": {
      const sameYear = day.slice(0, 4) === today.slice(0, 4);
      const d = parseDay(monthStart(day));
      const name = MONTHS_LONG[d.getUTCMonth()]!;
      return sameYear ? name : `${name} ${d.getUTCFullYear()}`;
    }
    case "monthgrid": {
      const label = periodLabel("month", day, today);
      return day.slice(0, 7) === today.slice(0, 7) ? "This month" : label;
    }
    case "quarter": {
      const d = parseDay(day);
      const year = d.getUTCFullYear();
      const m = d.getUTCMonth();
      const fyStart = m >= 3 ? year : year - 1;
      const q = Math.floor(((m - 3 + 12) % 12) / 3) + 1;

      const td = parseDay(today);
      const tYear = td.getUTCFullYear();
      const tm = td.getUTCMonth();
      const tFyStart = tm >= 3 ? tYear : tYear - 1;
      const tq = Math.floor(((tm - 3 + 12) % 12) / 3) + 1;

      if (fyStart === tFyStart && q === tq) return "This quarter";
      const nextYear = String((fyStart + 1) % 100).padStart(2, "0");
      return `Q${q} FY ${fyStart}–${nextYear}`;
    }
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
      return day.slice(0, 7) === today.slice(0, 7);
    case "monthgrid":
      return day.slice(0, 7) === today.slice(0, 7);
    case "quarter":
      return periodRange("quarter", day).from === periodRange("quarter", today).from;
  }
}

/** "September" / "September 2027" — shared with the month and year headings. */
export function monthName(ymd: string, withYear = false): string {
  const d = parseDay(monthStart(ymd));
  const name = MONTHS_LONG[d.getUTCMonth()]!;
  return withYear ? `${name} ${d.getUTCFullYear()}` : name;
}

/**
 * A week's 7 days, grouped into one segment per distinct month — one segment
 * covering all 7 for a normal week, two when the week straddles a boundary
 * (asked 2026-09-29, Weekly Grid and Monthly Grid both: a week half September
 * half October should not be labelled by only one of them). Shared by both
 * grids' sticky month band.
 */
export function monthSegments(days: readonly string[]): { month: string; span: number }[] {
  const segs: { month: string; span: number }[] = [];
  for (const d of days) {
    const m = monthStart(d);
    const last = segs[segs.length - 1];
    if (last && last.month === m) last.span += 1;
    else segs.push({ month: m, span: 1 });
  }
  return segs;
}
