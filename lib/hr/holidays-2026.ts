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

/** Intro paragraph, verbatim. */
export const HOLIDAYS_2026_INTRO =
  "Altus Corp shall observe the following Public and National Holidays for the calendar year 2026, based on the holiday notification issued by the Government of Maharashtra. Employees shall be entitled to paid holidays on these days, subject to business requirements, operational exigencies, this Policy, and applicable law.";

export const HOLIDAYS_2026_TITLE = "Public Holidays – Maharashtra (2026)";

/** The 21 notified holidays, in date order, verbatim. */
export const HOLIDAYS_2026: Holiday2026[] = [
  { date: "26 January 2026", day: "Monday", name: "Republic Day (National Holiday)", national: true, month: 1, dayNum: 26 },
  { date: "15 February 2026", day: "Sunday", name: "Mahashivratri", national: false, month: 2, dayNum: 15 },
  { date: "19 February 2026", day: "Thursday", name: "Chhatrapati Shivaji Maharaj Jayanti", national: false, month: 2, dayNum: 19 },
  { date: "3 March 2026", day: "Tuesday", name: "Holi (Second Day)", national: false, month: 3, dayNum: 3 },
  { date: "19 March 2026", day: "Thursday", name: "Gudhi Padwa", national: false, month: 3, dayNum: 19 },
  { date: "21 March 2026", day: "Saturday", name: "Ramzan Id (Eid-ul-Fitr)", national: false, month: 3, dayNum: 21 },
  { date: "31 March 2026", day: "Tuesday", name: "Mahavir Janma Kalyanak", national: false, month: 3, dayNum: 31 },
  { date: "3 April 2026", day: "Friday", name: "Good Friday", national: false, month: 4, dayNum: 3 },
  { date: "14 April 2026", day: "Tuesday", name: "Dr. Babasaheb Ambedkar Jayanti", national: false, month: 4, dayNum: 14 },
  { date: "1 May 2026", day: "Friday", name: "Maharashtra Day / Buddha Pournima", national: false, month: 5, dayNum: 1 },
  { date: "28 May 2026", day: "Thursday", name: "Bakri Id (Eid-ul-Zuha)", national: false, month: 5, dayNum: 28 },
  { date: "26 June 2026", day: "Friday", name: "Moharram", national: false, month: 6, dayNum: 26 },
  { date: "15 August 2026", day: "Saturday", name: "Independence Day (National Holiday) / Parsi New Year (Shahenshahi)", national: true, month: 8, dayNum: 15 },
  { date: "26 August 2026", day: "Wednesday", name: "Id-e-Milad", national: false, month: 8, dayNum: 26 },
  { date: "14 September 2026", day: "Monday", name: "Ganesh Chaturthi", national: false, month: 9, dayNum: 14 },
  { date: "2 October 2026", day: "Friday", name: "Mahatma Gandhi Jayanti (National Holiday)", national: true, month: 10, dayNum: 2 },
  { date: "20 October 2026", day: "Tuesday", name: "Dasara (Vijayadashami)", national: false, month: 10, dayNum: 20 },
  { date: "8 November 2026", day: "Sunday", name: "Diwali Amavasya (Lakshmi Pujan)", national: false, month: 11, dayNum: 8 },
  { date: "10 November 2026", day: "Tuesday", name: "Diwali (Bali Pratipada)", national: false, month: 11, dayNum: 10 },
  { date: "24 November 2026", day: "Tuesday", name: "Guru Nanak Jayanti", national: false, month: 11, dayNum: 24 },
  { date: "25 December 2026", day: "Friday", name: "Christmas", national: false, month: 12, dayNum: 25 },
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
 *  Title-case to match the canonical `formatDate` in lib/format.ts. */
export function holidayMonthAbbr(month: number): string {
  return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][month - 1] ?? "";
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
