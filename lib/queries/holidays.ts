import "server-only";
import { and, asc, gte, inArray, lte, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { eventHolidays, holidays } from "@/db/schema";
import { publishedHolidayDates } from "@/lib/hr/holidays-2026";

export interface HolidayRow {
  id: string;
  holidayDate: string;
  label: string;
  isActive: boolean;
  createdAt: Date;
}

/**
 * Holidays, oldest-first. When `year` is given, scope to that calendar year;
 * otherwise return every holiday on record. Inactive rows are included (the
 * admin list shows them with an Inactive pill); the query layer (B7) reads
 * `listHolidayDateSet` for the active-only set it actually applies.
 */
export async function listHolidays(year?: number): Promise<HolidayRow[]> {
  const where =
    year !== undefined
      ? and(
          gte(holidays.holidayDate, `${year}-01-01`),
          lte(holidays.holidayDate, `${year}-12-31`),
        )
      : undefined;

  const rows = await db
    .select({
      id: holidays.id,
      holidayDate: holidays.holidayDate,
      label: holidays.label,
      isActive: holidays.isActive,
      createdAt: holidays.createdAt,
    })
    .from(holidays)
    .where(where)
    .orderBy(asc(holidays.holidayDate));

  return rows;
}

/**
 * Set of company holiday dates (YYYY-MM-DD) for a calendar year — the days the
 * attendance grader marks off in the monthly grid instead of expecting a punch.
 *
 * ── READS ALL THREE CALENDARS ──────────────────────────────────────────────
 * The app keeps holidays in three places and HR may legitimately use any of them:
 *
 *   · the PUBLISHED calendar (lib/hr/holidays-2026.ts) — the firm's own 15-day
 *                        list per year, which is what the HR Holiday List at
 *                        /hr/holidays renders and therefore the calendar
 *                        employees are actually told to plan around.
 *   · `holidays`       — the Admin Panel list (/admin/holidays) and the HR
 *                        page's AD-HOC additions.
 *   · `event_holidays` — the Monthly Events Master, which is what the company
 *                        Holiday List at /holidays renders.
 *
 * Only `holidays` was read here originally, so a holiday entered in the Events
 * Master was invisible to grading. The PUBLISHED list was invisible too, and
 * that was the worse half: it is the main calendar, it lives in code rather than
 * in any table, and every one of its days — Republic Day, Independence Day,
 * Diwali — was graded as an ordinary working day. Nobody punched, the grader
 * wrote "A", and the day flowed through target hours, the hours balance and into
 * a salary deduction. Reading all three closes that.
 *
 * ── SUPPRESSION: how a published holiday gets CANCELLED ────────────────────
 * The published list is code, so it cannot be edited from the app. An INACTIVE
 * `holidays` row is therefore read as an explicit "this date is NOT a holiday",
 * whichever calendar proposed it — which is what `is_active` already meant on
 * that table, now applied to the merged answer rather than to one source. To
 * withdraw a published day: add it in the Admin Panel and toggle it Inactive.
 *
 * ── WHICH EVENT-MASTER ROWS COUNT, AND WHY THE BAR IS HIGH ─────────────────
 * This set is applied to EVERYONE, so only an unambiguous company-wide day off
 * qualifies. A row must be:
 *   · `is_office_closed`   — the office is actually shut.
 *   · not a festival/exam MARKER — those annotate the calendar, they are not
 *                            days off.
 *   · not `is_optional`    — an optional holiday is offered, not automatic;
 *                            crediting it to everyone would pay for a day most
 *                            people worked.
 *   · `applies_to` in (all, custom) — religion-targeted days are per-person, and
 *                            this function has no employee to target. Those stay
 *                            with the personalised reader
 *                            (lib/queries/upcoming-holidays.ts).
 * Anything short of that bar is deliberately NOT treated as a graded holiday.
 *
 * Fail-safe: if the Events Master read fails, the admin list still applies. A
 * holiday calendar that half-loads must never grade a real holiday as absent.
 */
export async function listHolidayDateSet(year: number): Promise<Set<string>> {
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;

  const [adminRows, masterRows] = await Promise.all([
    // ACTIVE and INACTIVE both, because an inactive row is not "nothing" — it is
    // the only way to say "not a holiday" about a date the published calendar or
    // the Events Master claims. Split below.
    db
      .select({ holidayDate: holidays.holidayDate, isActive: holidays.isActive })
      .from(holidays)
      .where(and(gte(holidays.holidayDate, from), lte(holidays.holidayDate, to))),
    db
      .select({ holidayDate: eventHolidays.holidayDate })
      .from(eventHolidays)
      .where(
        and(
          gte(eventHolidays.holidayDate, from),
          lte(eventHolidays.holidayDate, to),
          eq(eventHolidays.isOfficeClosed, true),
          eq(eventHolidays.isOptional, false),
          eq(eventHolidays.isFestivalMarker, false),
          eq(eventHolidays.isExamMarker, false),
          inArray(eventHolidays.appliesTo, ["all", "custom"]),
        ),
      )
      .catch(() => []),
  ]);

  const suppressed = new Set(
    adminRows.filter((r) => !r.isActive).map((r) => String(r.holidayDate)),
  );

  const dates = [
    // The published calendar first — it is the one employees are shown.
    ...publishedHolidayDates(year),
    ...adminRows.filter((r) => r.isActive).map((r) => String(r.holidayDate)),
    ...masterRows.map((r) => String(r.holidayDate)),
  ];

  return new Set(dates.filter((d) => !suppressed.has(d)));
}
