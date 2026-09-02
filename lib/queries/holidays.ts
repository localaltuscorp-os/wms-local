import "server-only";
import { and, asc, gte, inArray, lte, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { eventHolidays, holidays } from "@/db/schema";

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
 * ── READS BOTH CALENDARS ───────────────────────────────────────────────────
 * The app keeps holidays in two places and an admin may legitimately use either:
 *
 *   · `holidays`       — the Admin Panel list (/admin/holidays).
 *   · `event_holidays` — the Monthly Events Master, which is what the company
 *                        Holiday List at /holidays renders.
 *
 * Only the first was read here, so a holiday entered in the Events Master was
 * invisible to grading: the day was expected as a working day, graded ABSENT,
 * and the lost day flowed straight through payable days into salary. Reading
 * both closes that.
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
    db
      .select({ holidayDate: holidays.holidayDate })
      .from(holidays)
      .where(
        and(
          eq(holidays.isActive, true),
          gte(holidays.holidayDate, from),
          lte(holidays.holidayDate, to),
        ),
      ),
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

  return new Set([...adminRows, ...masterRows].map((r) => r.holidayDate));
}
