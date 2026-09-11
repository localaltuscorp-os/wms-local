/**
 * Public Holidays — Maharashtra (2026)
 *
 * The Altus Corp holiday calendar for CY2026, transcribed VERBATIM from the HR
 * policy source (Date / Day / Holiday), plus the "Management Discretion
 * Regarding Holidays" note and its "Accordingly" clause list. Single source of
 * truth for the /hr/holidays page.
 *
 * `national` is derived from the source rows that carry "(National Holiday)".
 * `month` (1-12) and `dayNum` are parsed from the verbatim date for grouping /
 * badges only — the displayed date string is always `date` (unaltered).
 *
 * Pure data — no runtime deps, load-neutral, safe to import from server or
 * client components.
 */

export interface Holiday2026 {
  /** The date exactly as written in the policy, e.g. "26 January 2026". */
  date: string;
  /** The weekday exactly as written, e.g. "Monday". */
  day: string;
  /** The holiday name exactly as written (may carry "(National Holiday)"). */
  name: string;
  /** True when the source row is flagged a National Holiday. */
  national: boolean;
  /** Calendar month 1-12 (for grouping into quarters). */
  month: number;
  /** Day-of-month 1-31 (for the date badge). */
  dayNum: number;
}

/**
 * Intro paragraph, year-parameterised.
 *
 * ⚠ WORDING CHECK OUTSTANDING: this still says the list is "based on the
 * holiday notification issued by the Government of Maharashtra". That was true
 * of the 21-day list this replaced; the supplied 2026-2028 lists are the FIRM'S
 * OWN 15-day calendar and omit several notified days (Gandhi Jayanti, Christmas,
 * Good Friday, both Eids, Ambedkar Jayanti among them). HR should confirm the
 * sentence before this is shown to employees. Neither string is rendered
 * anywhere today, so nothing incorrect is on screen in the meantime.
 */
export function holidayIntroFor(year: number): string {
  return `Altus Corp shall observe the following Public and National Holidays for the calendar year ${year}, based on the holiday notification issued by the Government of Maharashtra. Employees shall be entitled to paid holidays on these days, subject to business requirements, operational exigencies, this Policy, and applicable law.`;
}

export function holidayTitleFor(year: number): string {
  return `Public Holidays – Maharashtra (${year})`;
}

/**
 * THE ALTUS CORP HOLIDAY CALENDAR, 2026-2028.
 *
 * Supplied by HR as the firm's own observed list. It is NOT the full Government
 * of Maharashtra notification and is deliberately shorter: 15 days a year
 * against the notification's 21 for 2026.
 *
 * `day` is COMPUTED from the date, never transcribed - a wrong weekday on a
 * holiday card is the kind of thing nobody notices until someone has planned
 * leave around it.
 *
 * `national` marks the two statutory National Holidays present in these lists,
 * Republic Day and Independence Day. Gandhi Jayanti - the third - is not in the
 * supplied list, so it is not here.
 *
 * "New Year" appears twice a year on purpose: the Diwali new year (Bali
 * Pratipada) and 31 December. Both are named exactly as supplied.
 */
export const HOLIDAYS_2026: Holiday2026[] = [
  { date: "26-Jan-2026", day: "Monday", name: "Republic Day", national: true, month: 1, dayNum: 26 },
  { date: "15-Feb-2026", day: "Sunday", name: "Shiv Ratri", national: false, month: 2, dayNum: 15 },
  { date: "04-Mar-2026", day: "Wednesday", name: "Holi Day 2", national: false, month: 3, dayNum: 4 },
  { date: "19-Mar-2026", day: "Thursday", name: "Gudhi Padwa", national: false, month: 3, dayNum: 19 },
  { date: "01-May-2026", day: "Friday", name: "Maharashtra Day", national: false, month: 5, dayNum: 1 },
  { date: "15-Aug-2026", day: "Saturday", name: "Independence Day", national: true, month: 8, dayNum: 15 },
  { date: "28-Aug-2026", day: "Friday", name: "Rakshabandhan", national: false, month: 8, dayNum: 28 },
  { date: "04-Sep-2026", day: "Friday", name: "Janmashtami", national: false, month: 9, dayNum: 4 },
  { date: "14-Sep-2026", day: "Monday", name: "Ganpati Day 1", national: false, month: 9, dayNum: 14 },
  { date: "23-Sep-2026", day: "Wednesday", name: "Ganpati Day 10", national: false, month: 9, dayNum: 23 },
  { date: "20-Oct-2026", day: "Tuesday", name: "Dashera", national: false, month: 10, dayNum: 20 },
  { date: "08-Nov-2026", day: "Sunday", name: "Diwali", national: false, month: 11, dayNum: 8 },
  { date: "09-Nov-2026", day: "Monday", name: "New Year", national: false, month: 11, dayNum: 9 },
  { date: "11-Nov-2026", day: "Wednesday", name: "Bhai Dooj", national: false, month: 11, dayNum: 11 },
  { date: "31-Dec-2026", day: "Thursday", name: "New Year", national: false, month: 12, dayNum: 31 },
];

export const HOLIDAYS_2027: Holiday2026[] = [
  { date: "26-Jan-2027", day: "Tuesday", name: "Republic Day", national: true, month: 1, dayNum: 26 },
  { date: "06-Mar-2027", day: "Saturday", name: "Shiv Ratri", national: false, month: 3, dayNum: 6 },
  { date: "23-Mar-2027", day: "Tuesday", name: "Holi Day 2", national: false, month: 3, dayNum: 23 },
  { date: "07-Apr-2027", day: "Wednesday", name: "Gudhi Padwa", national: false, month: 4, dayNum: 7 },
  { date: "01-May-2027", day: "Saturday", name: "Maharashtra Day", national: false, month: 5, dayNum: 1 },
  { date: "15-Aug-2027", day: "Sunday", name: "Independence Day", national: true, month: 8, dayNum: 15 },
  { date: "17-Aug-2027", day: "Tuesday", name: "Rakshabandhan", national: false, month: 8, dayNum: 17 },
  { date: "25-Aug-2027", day: "Wednesday", name: "Janmashtami", national: false, month: 8, dayNum: 25 },
  { date: "04-Sep-2027", day: "Saturday", name: "Ganpati Day 1", national: false, month: 9, dayNum: 4 },
  { date: "13-Sep-2027", day: "Monday", name: "Ganpati Day 10", national: false, month: 9, dayNum: 13 },
  { date: "09-Oct-2027", day: "Saturday", name: "Dashera", national: false, month: 10, dayNum: 9 },
  { date: "29-Oct-2027", day: "Friday", name: "Diwali", national: false, month: 10, dayNum: 29 },
  { date: "30-Oct-2027", day: "Saturday", name: "New Year", national: false, month: 10, dayNum: 30 },
  { date: "01-Nov-2027", day: "Monday", name: "Bhai Dooj", national: false, month: 11, dayNum: 1 },
  { date: "31-Dec-2027", day: "Friday", name: "New Year", national: false, month: 12, dayNum: 31 },
];

export const HOLIDAYS_2028: Holiday2026[] = [
  { date: "26-Jan-2028", day: "Wednesday", name: "Republic Day", national: true, month: 1, dayNum: 26 },
  { date: "24-Feb-2028", day: "Thursday", name: "Shiv Ratri", national: false, month: 2, dayNum: 24 },
  { date: "12-Mar-2028", day: "Sunday", name: "Holi Day 2", national: false, month: 3, dayNum: 12 },
  { date: "27-Mar-2028", day: "Monday", name: "Gudhi Padwa", national: false, month: 3, dayNum: 27 },
  { date: "01-May-2028", day: "Monday", name: "Maharashtra Day", national: false, month: 5, dayNum: 1 },
  { date: "05-Aug-2028", day: "Saturday", name: "Rakshabandhan", national: false, month: 8, dayNum: 5 },
  { date: "13-Aug-2028", day: "Sunday", name: "Janmashtami", national: false, month: 8, dayNum: 13 },
  { date: "15-Aug-2028", day: "Tuesday", name: "Independence Day", national: true, month: 8, dayNum: 15 },
  { date: "23-Aug-2028", day: "Wednesday", name: "Ganpati Day 1", national: false, month: 8, dayNum: 23 },
  { date: "01-Sep-2028", day: "Friday", name: "Ganpati Day 10", national: false, month: 9, dayNum: 1 },
  { date: "28-Sep-2028", day: "Thursday", name: "Dashera", national: false, month: 9, dayNum: 28 },
  { date: "17-Oct-2028", day: "Tuesday", name: "Diwali", national: false, month: 10, dayNum: 17 },
  { date: "18-Oct-2028", day: "Wednesday", name: "New Year", national: false, month: 10, dayNum: 18 },
  { date: "20-Oct-2028", day: "Friday", name: "Bhai Dooj", national: false, month: 10, dayNum: 20 },
  { date: "31-Dec-2028", day: "Sunday", name: "New Year", national: false, month: 12, dayNum: 31 },
];

export interface HolidayQuarter {
  key: string;
  label: string;
  /** Short month-range caption, e.g. "Jan – Mar". */
  span: string;
  holidays: Holiday2026[];
}

const QUARTER_DEFS: { key: string; label: string; span: string; months: number[] }[] = [
  { key: "q1", label: "First Quarter", span: "Jan – Mar", months: [1, 2, 3] },
  { key: "q2", label: "Second Quarter", span: "Apr – Jun", months: [4, 5, 6] },
  { key: "q3", label: "Third Quarter", span: "Jul – Sep", months: [7, 8, 9] },
  { key: "q4", label: "Fourth Quarter", span: "Oct – Dec", months: [10, 11, 12] },
];

/** The holidays grouped into calendar quarters (empty quarters dropped). */
export const HOLIDAYS_2026_BY_QUARTER: HolidayQuarter[] = QUARTER_DEFS.map((q) => ({
  key: q.key,
  label: q.label,
  span: q.span,
  holidays: HOLIDAYS_2026.filter((h) => q.months.includes(h.month)),
})).filter((q) => q.holidays.length > 0);

export const HOLIDAYS_2026_COUNT = HOLIDAYS_2026.length;
export const HOLIDAYS_2026_NATIONAL_COUNT = HOLIDAYS_2026.filter((h) => h.national).length;

/** Short month abbreviation for a date badge, e.g. month 1 → "Jan".
 *  Title-case to match `formatDateHr` (DD-MMM-YYYY) in lib/format.ts. */
export function holidayMonthAbbr(month: number): string {
  return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][month - 1] ?? "";
}

/**
 * The holiday name as it should READ on screen, with a trailing
 * "(National Holiday)" tag dropped.
 *
 * The tag is redundant in the UI — a national holiday already shows a red
 * outline, a red date badge and a "National" marker — and because it only
 * appears on some rows it made those cards wrap to a second line while their
 * neighbours stayed on one, which is what left the list looking ragged.
 *
 * Stripping happens HERE, at the display edge, and never touches `name`: that
 * field is transcribed verbatim from the government notification and is what
 * the print view and the mobile API serve. Handles the tag mid-string too
 * ("Independence Day (National Holiday) / Parsi New Year" keeps its second
 * half) and tidies the separator left behind.
 */
export function holidayDisplayName(name: string): string {
  return name
    .replace(/\s*\(National Holiday\)\s*/gi, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s/]+|[\s/]+$/g, "")
    .trim();
}

// ── Management Discretion Regarding Holidays ────────────────────────────────

export const MANAGEMENT_DISCRETION_TITLE = "Management Discretion Regarding Holidays";

/** The discretion note, verbatim. */
export const MANAGEMENT_DISCRETION_NOTE =
  "Considering the nature of Altus Corp's business, operational requirements, client commitments, employee roles, work locations, and the diverse religious beliefs and personal preferences of its employees, the Firm reserves the sole and absolute discretion to determine the holidays applicable to individual employees or groups of employees.";

/** The "Accordingly:" clause list, verbatim, in order. */
export const MANAGEMENT_DISCRETION_CLAUSES: string[] = [
  "The Firm may require certain employees to work on any notified public holiday based on business requirements, while granting them a compensatory holiday or any other benefit as determined by the Firm and applicable law.",
  "The Firm may grant different holidays, substitute holidays, restricted holidays, or other leave arrangements to different employees or groups of employees based on operational needs, client requirements, location, religion, or any other relevant business consideration.",
  "Any exception, relaxation, concession, substitute holiday, additional holiday, or special leave arrangement granted to an employee shall be purely discretionary and shall not constitute a precedent or create any contractual, statutory, legal, equitable, or vested right or entitlement for that employee or any other employee.",
  "Altus Corp reserves the right to modify, substitute, add, remove, or reschedule holidays, or revise the holiday calendar at any time to comply with applicable law or meet business requirements.",
  "Where a notified public holiday falls on a weekly off, no substitute holiday shall be provided unless expressly approved by the Firm or required under applicable law.",
  "All decisions of the Firm relating to the applicability of holidays, grant of exceptions, substitute holidays, or interpretation of this Policy shall be final and binding, subject to applicable law.",
];

/** The closing paragraph, verbatim. */
export const MANAGEMENT_DISCRETION_CLOSING =
  "Nothing contained in this Policy shall limit the Firm's right to manage its operations or workforce in accordance with applicable law and legitimate business requirements.";

/* ──────────────────────────────────────────────────────────────────────────
   YEAR + MONTH SELECTION
   ────────────────────────────────────────────────────────────────────────── */

/** The years the picker offers. */
export const HOLIDAY_YEARS = [2026, 2027, 2028] as const;
export type HolidayYear = (typeof HOLIDAY_YEARS)[number];

/**
 * Holidays per year.
 *
 * All three years are supplied lists, not derived ones. Most of these dates move
 * every year on a lunar calendar, so a year can only ever be added by pasting
 * the real list - never by shifting the previous year's.
 *
 * To add 2029: define HOLIDAYS_2029 above, add it to HOLIDAY_YEARS, and put it
 * here. It appears in the picker automatically.
 */
const HOLIDAYS_BY_YEAR: Record<HolidayYear, Holiday2026[]> = {
  2026: HOLIDAYS_2026,
  2027: HOLIDAYS_2027,
  2028: HOLIDAYS_2028,
};

export function isHolidayYear(v: number): v is HolidayYear {
  return (HOLIDAY_YEARS as readonly number[]).includes(v);
}

/** Every holiday for a year - empty for a year whose list is not published. */
export function holidaysForYear(year: number): Holiday2026[] {
  return isHolidayYear(year) ? HOLIDAYS_BY_YEAR[year] : [];
}

/** True when the year has a notified list behind it. */
export function isPublishedHolidayYear(year: number): boolean {
  return holidaysForYear(year).length > 0;
}

export const HOLIDAY_MONTHS: { value: number; label: string }[] = [
  { value: 1, label: "January" }, { value: 2, label: "February" },
  { value: 3, label: "March" }, { value: 4, label: "April" },
  { value: 5, label: "May" }, { value: 6, label: "June" },
  { value: 7, label: "July" }, { value: 8, label: "August" },
  { value: 9, label: "September" }, { value: 10, label: "October" },
  { value: 11, label: "November" }, { value: 12, label: "December" },
];

export function holidayMonthName(month: number): string {
  return HOLIDAY_MONTHS.find((m) => m.value === month)?.label ?? "";
}

/** `month = 0` is the "All months" selection - the whole year. */
export const HOLIDAY_MONTH_ALL = 0;

/**
 * What the page shows before anyone touches a filter: the CURRENT year and
 * month, per the request.
 *
 * `todayYmd` is the IST calendar day (lib/format's localDateString) rather than
 * server time - a server in another zone must not show a Mumbai employee the
 * wrong month for several hours a day.
 *
 * The year is clamped into HOLIDAY_YEARS so that once 2029 arrives the page
 * still opens on something real instead of an empty year that isn't offered.
 */
export function defaultHolidayFilter(todayYmd: string): { year: HolidayYear; month: number } {
  const [y, m] = todayYmd.split("-").map(Number);
  const first = HOLIDAY_YEARS[0];
  const last = HOLIDAY_YEARS[HOLIDAY_YEARS.length - 1]!;
  const year: HolidayYear = !y || y < first ? first : y > last ? last : (y as HolidayYear);
  const month = m && m >= 1 && m <= 12 ? m : HOLIDAY_MONTH_ALL;
  return { year, month };
}

/** The holidays for one year+month selection, in date order. */
export function holidaysFor(year: number, month: number): Holiday2026[] {
  const all = holidaysForYear(year);
  return month === HOLIDAY_MONTH_ALL ? all : all.filter((h) => h.month === month);
}

/** Year+month grouped into quarters - used for the "All months" view. */
export function holidayQuartersFor(year: number): HolidayQuarter[] {
  const all = holidaysForYear(year);
  return QUARTER_DEFS.map((q) => ({
    key: q.key,
    label: q.label,
    span: q.span,
    holidays: all.filter((h) => q.months.includes(h.month)),
  })).filter((q) => q.holidays.length > 0);
}

/* ──────────────────────────────────────────────────────────────────────────
   THE PUBLISHED CALENDAR AS ATTENDANCE SEES IT

   The lists above are the firm's OWN published holiday calendar and the only
   thing the HR Holiday List page renders. They were, until this helper existed,
   invisible to everything else: `lib/queries/holidays.listHolidayDateSet` read
   the `holidays` table and the Monthly Events Master, neither of which carries
   them, so Republic Day, Independence Day and Diwali were graded as ORDINARY
   WORKING DAYS. Nobody punched in, the grader wrote "A", and the day flowed
   through the target hours, the hours balance and into a salary deduction.

   These helpers are the bridge: pure, no I/O, and derived from `month`/`dayNum`
   rather than by parsing the display string, so a change to how a date is
   WRITTEN can never change which day it IS.
   ────────────────────────────────────────────────────────────────────────── */

/** One published holiday, normalised to the shape the calendars share. */
export interface PublishedHoliday {
  /** yyyy-mm-dd. */
  date: string;
  label: string;
}

/** `{ month: 1, dayNum: 26 }` + 2026 → "2026-01-26". */
function isoOf(year: number, month: number, dayNum: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
}

/**
 * The published calendar for a year as `{ date, label }`, date-sorted.
 *
 * Empty for a year with no published list — which is the honest answer, and the
 * reason the DB calendars are read alongside this rather than replaced by it.
 */
export function publishedHolidaysForYear(year: number): PublishedHoliday[] {
  return holidaysForYear(year)
    .map((h) => ({ date: isoOf(year, h.month, h.dayNum), label: holidayDisplayName(h.name) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Just the dates — what the attendance grader needs. */
export function publishedHolidayDates(year: number): string[] {
  return publishedHolidaysForYear(year).map((h) => h.date);
}

/**
 * Every published holiday on or after `fromYmd`, across every published year.
 *
 * Deliberately unbounded at the far end (the "no horizon" rule the upcoming
 * panel already follows): if the next day off is fourteen months out, that is
 * still the next day off.
 */
export function publishedHolidaysFrom(fromYmd: string): PublishedHoliday[] {
  return HOLIDAY_YEARS.flatMap((y) => publishedHolidaysForYear(y))
    .filter((h) => h.date >= fromYmd)
    .sort((a, b) => a.date.localeCompare(b.date));
}
