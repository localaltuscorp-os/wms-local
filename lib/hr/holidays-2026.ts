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
 * of the 21-day list this replaced; the supplied calendar is the FIRM'S OWN
 * observed list. Its data is authoritative here. HR should separately confirm
 * the explanatory policy sentence before it is shown to employees. Neither
 * string is rendered anywhere today, so nothing incorrect is on screen in the
 * meantime.
 */
export function holidayIntroFor(year: number): string {
  return `Altus Corp shall observe the following Public and National Holidays for the calendar year ${year}, based on the holiday notification issued by the Government of Maharashtra. Employees shall be entitled to paid holidays on these days, subject to business requirements, operational exigencies, this Policy, and applicable law.`;
}

export function holidayTitleFor(year: number): string {
  return `Public Holidays – Maharashtra (${year})`;
}

/**
 * THE ALTUS CORP HOLIDAY CALENDAR, 2026-2031.
 *
 * Supplied as the firm's authoritative observed list. It is not derived from a
 * government notification: lunar-calendar dates are transcribed per year.
 *
 * `day` is COMPUTED from the date, never transcribed - a wrong weekday on a
 * holiday card is the kind of thing nobody notices until someone has planned
 * leave around it.
 *
 * `national` marks Republic Day and Independence Day where they appear in the
 * supplied list.
 *
 * Labels, including supplied asterisks, are kept exactly as supplied.
 */
const MONTH_ABBRS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

function suppliedHoliday(iso: string, name: string, national = false): Holiday2026 {
  const [year, month, dayNum] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, dayNum!));
  return {
    date: `${String(dayNum).padStart(2, "0")}-${MONTH_ABBRS[month! - 1]}-${year}`,
    day: WEEKDAYS[date.getUTCDay()]!,
    name,
    national,
    month: month!,
    dayNum: dayNum!,
  };
}

export const HOLIDAYS_2026: Holiday2026[] = [
  suppliedHoliday("2026-09-14", "Ganpati - Day 1 / Ganesh Chaturthi"),
  suppliedHoliday("2026-09-25", "Ganpati - Final Day / Anant Chaturdashi"),
  suppliedHoliday("2026-10-20", "Dussehra"),
  suppliedHoliday("2026-11-08", "Diwali / Laxmi Pujan"),
  suppliedHoliday("2026-11-10", "Diwali Padwa / Bali Pratipada / New Year"),
  suppliedHoliday("2026-11-11", "Bhai Dooj / Bhaubeej"),
];

export const HOLIDAYS_2027: Holiday2026[] = [
  suppliedHoliday("2027-01-26", "Republic Day", true),
  suppliedHoliday("2027-03-06", "Maha Shivratri"),
  suppliedHoliday("2027-03-22", "Holi - Day 2"),
  suppliedHoliday("2027-04-07", "Gudhi Padwa"),
  suppliedHoliday("2027-05-01", "Maharashtra Day"),
  suppliedHoliday("2027-08-15", "Independence Day", true),
  suppliedHoliday("2027-08-17", "Raksha Bandhan"),
  suppliedHoliday("2027-08-25", "Janmashtami"),
  suppliedHoliday("2027-09-04", "Ganpati - Day 1 / Ganesh Chaturthi"),
  suppliedHoliday("2027-09-14", "Ganpati - Final Day / Anant Chaturdashi"),
  suppliedHoliday("2027-10-09", "Dussehra"),
  suppliedHoliday("2027-10-29", "Diwali / Laxmi Pujan"),
  suppliedHoliday("2027-10-30", "Diwali Padwa / New Year*"),
  suppliedHoliday("2027-10-31", "Bhai Dooj / Bhaubeej"),
];

export const HOLIDAYS_2028: Holiday2026[] = [
  suppliedHoliday("2028-01-01", "English New Year"),
  suppliedHoliday("2028-01-26", "Republic Day", true),
  suppliedHoliday("2028-02-23", "Maha Shivratri"),
  suppliedHoliday("2028-03-11", "Holi - Day 2"),
  suppliedHoliday("2028-03-27", "Gudhi Padwa"),
  suppliedHoliday("2028-05-01", "Maharashtra Day"),
  suppliedHoliday("2028-08-05", "Raksha Bandhan"),
  suppliedHoliday("2028-08-13", "Janmashtami"),
  suppliedHoliday("2028-08-15", "Independence Day", true),
  suppliedHoliday("2028-08-23", "Ganpati - Day 1 / Ganesh Chaturthi"),
  suppliedHoliday("2028-09-02", "Ganpati - Final Day / Anant Chaturdashi*"),
  suppliedHoliday("2028-09-27", "Dussehra"),
  suppliedHoliday("2028-10-17", "Diwali / Laxmi Pujan"),
  suppliedHoliday("2028-10-18", "Diwali Padwa / New Year*"),
  suppliedHoliday("2028-10-19", "Bhai Dooj / Bhaubeej"),
];

export const HOLIDAYS_2029: Holiday2026[] = [
  suppliedHoliday("2029-01-01", "English New Year"),
  suppliedHoliday("2029-01-26", "Republic Day", true),
  suppliedHoliday("2029-02-11", "Maha Shivratri"),
  suppliedHoliday("2029-03-01", "Holi - Day 2"),
  suppliedHoliday("2029-04-14", "Gudhi Padwa"),
  suppliedHoliday("2029-05-01", "Maharashtra Day"),
  suppliedHoliday("2029-08-15", "Independence Day", true),
  suppliedHoliday("2029-08-23", "Raksha Bandhan"),
  suppliedHoliday("2029-09-01", "Janmashtami"),
  suppliedHoliday("2029-09-11", "Ganpati - Day 1 / Ganesh Chaturthi"),
  suppliedHoliday("2029-09-21", "Ganpati - Final Day / Anant Chaturdashi*"),
  suppliedHoliday("2029-10-16", "Dussehra"),
  suppliedHoliday("2029-11-05", "Diwali / Laxmi Pujan"),
  suppliedHoliday("2029-11-06", "Diwali Padwa / New Year*"),
  suppliedHoliday("2029-11-07", "Bhai Dooj / Bhaubeej"),
];

export const HOLIDAYS_2030: Holiday2026[] = [
  suppliedHoliday("2030-01-01", "English New Year"),
  suppliedHoliday("2030-01-26", "Republic Day", true),
  suppliedHoliday("2030-03-02", "Maha Shivratri"),
  suppliedHoliday("2030-03-20", "Holi - Day 2"),
  suppliedHoliday("2030-04-03", "Gudhi Padwa"),
  suppliedHoliday("2030-05-01", "Maharashtra Day"),
  suppliedHoliday("2030-08-13", "Raksha Bandhan"),
  suppliedHoliday("2030-08-15", "Independence Day", true),
  suppliedHoliday("2030-08-21", "Janmashtami"),
  suppliedHoliday("2030-09-01", "Ganpati - Day 1 / Ganesh Chaturthi"),
  suppliedHoliday("2030-09-11", "Ganpati - Final Day / Anant Chaturdashi*"),
  suppliedHoliday("2030-10-06", "Dussehra"),
  suppliedHoliday("2030-10-26", "Diwali / Laxmi Pujan"),
  suppliedHoliday("2030-10-27", "Diwali Padwa / New Year*"),
  suppliedHoliday("2030-10-28", "Bhai Dooj / Bhaubeej"),
];

export const HOLIDAYS_2031: Holiday2026[] = [
  suppliedHoliday("2031-01-01", "English New Year"),
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
export const HOLIDAY_YEARS = [2026, 2027, 2028, 2029, 2030, 2031] as const;
export type HolidayYear = (typeof HOLIDAY_YEARS)[number];

/**
 * Holidays per year.
 *
 * All years are supplied lists, not derived ones. Most of these dates move
 * every year on a lunar calendar, so a year can only ever be added by pasting
 * the real list - never by shifting the previous year's.
 *
 * To add another year: define its HOLIDAYS_<year> data above, add it to
 * HOLIDAY_YEARS, and put it
 * here. It appears in the picker automatically.
 */
const HOLIDAYS_BY_YEAR: Record<HolidayYear, Holiday2026[]> = {
  2026: HOLIDAYS_2026,
  2027: HOLIDAYS_2027,
  2028: HOLIDAYS_2028,
  2029: HOLIDAYS_2029,
  2030: HOLIDAYS_2030,
  2031: HOLIDAYS_2031,
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
 * The year is clamped into HOLIDAY_YEARS so that once 2032 arrives the page
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
