/**
 * THE HOLIDAY LIST AS A CAROUSEL — pure helpers behind /hr/holidays.
 *
 * The page used to be two dropdowns (year, month) that happily opened on a
 * month with nothing in it, or on a month whose holidays were already over.
 * The brief: show only what is still ahead, and let "next" roll straight to the
 * next month that actually HAS a holiday — from Ganpati in September to
 * whatever comes next, skipping the empty months in between.
 *
 * Two sources are merged here, exactly as the page always merged them: the
 * firm's published calendar (lib/hr/holidays-2026) and the ad-hoc rows in the
 * `holidays` table. Dates are compared as yyyy-mm-dd strings, which sort the
 * same as the dates they name — no Date objects, so no timezone can move a day.
 *
 * PURE + CLIENT-SAFE: no I/O, no server-only imports.
 */

import { HOLIDAY_YEARS, holidaysForYear, type Holiday2026 } from "@/lib/hr/holidays-2026";

export interface CalendarHoliday extends Holiday2026 {
  year: number;
  /** yyyy-mm-dd — the key everything sorts and de-dupes on. */
  iso: string;
  adHoc: boolean;
}

/** The shape of an ad-hoc row as the page reads it. */
export interface AdHocInput {
  holidayDate: string;
  label: string;
}

export interface MonthKey {
  year: number;
  month: number;
}

export function isoOf(year: number, month: number, dayNum: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
}

function weekdayOf(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" });
}

/**
 * Published holidays for `years` plus the ad-hoc rows, one entry per date,
 * date-sorted. On a clash the published name wins: the ad-hoc form already
 * refuses a date the calendar owns, so a clash only means stale data, and
 * showing the day twice was the one wrong answer.
 */
export function mergeCalendar(years: readonly number[], adHoc: readonly AdHocInput[]): CalendarHoliday[] {
  const byIso = new Map<string, CalendarHoliday>();
  for (const year of years) {
    for (const h of holidaysForYear(year)) {
      const iso = isoOf(year, h.month, h.dayNum);
      byIso.set(iso, { ...h, year, iso, adHoc: false });
    }
  }
  for (const r of adHoc) {
    const iso = String(r.holidayDate).slice(0, 10);
    if (byIso.has(iso)) continue;
    const [y, m, d] = iso.split("-").map(Number);
    if (!y || !m || !d) continue;
    byIso.set(iso, {
      date: iso,
      day: weekdayOf(iso),
      name: r.label,
      national: false,
      month: m,
      dayNum: d,
      year: y,
      iso,
      adHoc: true,
    });
  }
  return [...byIso.values()].sort((a, b) => a.iso.localeCompare(b.iso));
}

/** Holidays on or after today. Today's own holiday stays — it is not past yet. */
export function upcomingFrom(list: readonly CalendarHoliday[], todayYmd: string): CalendarHoliday[] {
  return list.filter((h) => h.iso >= todayYmd);
}

function keyNum(k: MonthKey): number {
  return k.year * 12 + (k.month - 1);
}

/** Every month that has at least one holiday in `list`, in order. */
export function monthsWithHolidays(list: readonly CalendarHoliday[]): MonthKey[] {
  const seen = new Map<number, MonthKey>();
  for (const h of list) {
    const k = { year: h.year, month: h.month };
    seen.set(keyNum(k), k);
  }
  return [...seen.entries()].sort((a, b) => a[0] - b[0]).map(([, k]) => k);
}

/**
 * The month the carousel should show.
 *
 * The requested month if it has holidays; otherwise the next month that does
 * (a stale bookmark to August lands on September); otherwise — the request is
 * beyond the last holiday — the last month there is. Null only when there is
 * nothing to show at all.
 */
export function resolveCarouselMonth(requested: MonthKey | null, months: readonly MonthKey[]): MonthKey | null {
  if (months.length === 0) return null;
  if (!requested) return months[0]!;
  const want = keyNum(requested);
  return months.find((m) => keyNum(m) >= want) ?? months[months.length - 1]!;
}

/** The months either side of `current` that have holidays. */
export function carouselNeighbours(
  months: readonly MonthKey[],
  current: MonthKey,
): { prev: MonthKey | null; next: MonthKey | null } {
  const i = months.findIndex((m) => keyNum(m) === keyNum(current));
  if (i < 0) return { prev: null, next: null };
  return { prev: months[i - 1] ?? null, next: months[i + 1] ?? null };
}

export function holidaysInMonth(list: readonly CalendarHoliday[], key: MonthKey): CalendarHoliday[] {
  return list.filter((h) => h.year === key.year && h.month === key.month);
}

/** `list` grouped by month, in order — the "All upcoming" view. */
export function groupByMonth(list: readonly CalendarHoliday[]): { key: MonthKey; holidays: CalendarHoliday[] }[] {
  return monthsWithHolidays(list).map((key) => ({ key, holidays: holidaysInMonth(list, key) }));
}

const QUARTERS = [
  { key: "q1", label: "First Quarter", span: "Jan – Mar", months: [1, 2, 3] },
  { key: "q2", label: "Second Quarter", span: "Apr – Jun", months: [4, 5, 6] },
  { key: "q3", label: "Third Quarter", span: "Jul – Sep", months: [7, 8, 9] },
  { key: "q4", label: "Fourth Quarter", span: "Oct – Dec", months: [10, 11, 12] },
] as const;

/** One calendar year's holidays in Jan–Mar / Apr–Jun / … quarters, empty ones dropped. */
export function quartersOfYear(
  list: readonly CalendarHoliday[],
  year: number,
): { key: string; label: string; span: string; holidays: CalendarHoliday[] }[] {
  const inYear = list.filter((h) => h.year === year);
  return QUARTERS.map((q) => ({
    key: q.key,
    label: q.label,
    span: q.span,
    holidays: inYear.filter((h) => (q.months as readonly number[]).includes(h.month)),
  })).filter((q) => q.holidays.length > 0);
}

/** The calendar years a yyyy-mm-dd range touches, inclusive. */
export function yearsInRange(fromYmd: string, toYmd: string): number[] {
  const from = Number(fromYmd.slice(0, 4));
  const to = Number(toYmd.slice(0, 4));
  if (!from || !to || to < from) return [];
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

/**
 * The year Print Calendar prints: today's calendar year, clamped into the
 * published range so the printout is never an empty page.
 */
export function printYearFor(todayYmd: string): number {
  const y = Number(todayYmd.slice(0, 4));
  const first = HOLIDAY_YEARS[0];
  const last = HOLIDAY_YEARS[HOLIDAY_YEARS.length - 1]!;
  return !y || y < first ? first : y > last ? last : y;
}

/* ── Working years (April → March) ──────────────────────────────────────────
   The firm's year runs April to March, so "2026" means 1 Apr 2026 – 31 Mar
   2027. The All-upcoming list used to run December 2026 straight into January
   2027 with nothing to mark the change, and readers took January 2027 for this
   year's. Grouping by WORKING year puts each holiday in the year HR counts it. */

/** The working year a date belongs to: April onwards is that year, Jan–Mar the one before. */
export function workingYearOf(iso: string): number {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  return m >= 4 ? y : y - 1;
}

/** "Apr 2026 – Mar 2027" — the span a working-year tab stands for. */
export function workingYearSpan(fy: number): string {
  return `Apr ${fy} – Mar ${fy + 1}`;
}

/** Every working year that has at least one holiday in `list`, ascending. */
export function workingYearsWithHolidays(list: readonly CalendarHoliday[]): number[] {
  return [...new Set(list.map((h) => workingYearOf(h.iso)))].sort((a, b) => a - b);
}

/** The holidays of one working year, in date order. */
export function holidaysInWorkingYear(list: readonly CalendarHoliday[], fy: number): CalendarHoliday[] {
  return list.filter((h) => workingYearOf(h.iso) === fy);
}

/** A requested working year if it has holidays, else the first one that does. */
export function resolveWorkingYear(requested: number | null, available: readonly number[]): number | null {
  if (requested !== null && available.includes(requested)) return requested;
  return available[0] ?? null;
}
