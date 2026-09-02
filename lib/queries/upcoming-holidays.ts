import "server-only";
import { and, asc, eq, gte } from "drizzle-orm";
import { db } from "@/lib/db";
import { eventHolidays, holidays } from "@/db/schema";
import { isHolidayForReligion } from "@/components/events/holidays/personalise";
import type { ReligionCode } from "@/lib/monthly-events/types";
import {
  mergeUpcomingHolidays,
  type MergeableHoliday,
  type UpcomingHoliday,
} from "@/lib/attendance/holiday-merge";

export type { UpcomingHoliday };

/**
 * "WHAT'S MY NEXT DAY OFF" — the one upcoming-holiday reader.
 *
 * ── WHY THIS EXISTS: TWO CALENDARS, ONE QUESTION ───────────────────────────
 * This app keeps holidays in two places, and they are both real:
 *
 *   · `holidays`        — the ADMIN PANEL's list (/admin/holidays). Full CRUD,
 *                         one row per calendar date, `is_active` to retire one.
 *   · `event_holidays`  — the MONTHLY EVENTS MASTER. Financial-year scoped, with
 *                         religion targeting (`applies_to`), optional days, and
 *                         festival/exam markers that are NOT days off. This is
 *                         what the "Holiday List" at /holidays renders.
 *
 * The Attendance page used to read only the first one, while the "View All"
 * link in its own Upcoming Holidays panel went to the second. So the panel could
 * say "No holidays coming up" and the page one click away could list a full
 * year of them — the admin's schedule and the employee's attendance screen
 * disagreeing about the same calendar.
 *
 * This module reads BOTH and merges them, so a holiday added in either place
 * shows up on the Attendance page. Same personalisation the Holiday List uses,
 * so what an employee sees here matches what they see when they click through.
 *
 * ── NO HORIZON ─────────────────────────────────────────────────────────────
 * Neither query is bounded by year or financial year (Sir): if the next holiday
 * is fourteen months out, that is the one worth telling someone about. The old
 * reader capped itself at `currentYear` and `currentYear + 1`, which is a second
 * reason the panel could come up empty.
 */

/**
 * Over-fetch factor. Rows are dropped AFTER the database returns them (Sundays,
 * markers, religion, duplicate dates), so asking for exactly `limit` rows could
 * come back short. Four times the ask comfortably covers a run of Sundays and
 * duplicated dates without pulling a whole calendar.
 */
const OVERFETCH = 4;

/** Hard ceiling on what either query may return, so a hand-passed `limit` can
 *  never turn this into a full-table scan of a decade of holidays. */
const MAX_ROWS = 200;

export async function listUpcomingHolidays(opts: {
  /** The employee's today, yyyy-mm-dd, in their timezone. */
  today: string;
  /** Their religion, for the Monthly Events Master's `applies_to` targeting. */
  religion?: ReligionCode | null;
  /** How many to return. */
  limit?: number;
}): Promise<UpcomingHoliday[]> {
  const { today, religion = null } = opts;
  const limit = Math.max(1, Math.min(opts.limit ?? 5, 50));
  const take = Math.min(limit * OVERFETCH, MAX_ROWS);

  // Both reads are independently caught: if one calendar is unavailable the
  // panel still shows the other, rather than the page failing over a sidebar.
  const [adminRows, masterRows] = await Promise.all([
    db
      .select({ date: holidays.holidayDate, label: holidays.label })
      .from(holidays)
      .where(and(eq(holidays.isActive, true), gte(holidays.holidayDate, today)))
      .orderBy(asc(holidays.holidayDate))
      .limit(take)
      .catch(() => []),
    db
      .select({
        date: eventHolidays.holidayDate,
        label: eventHolidays.name,
        appliesTo: eventHolidays.appliesTo,
        isOptional: eventHolidays.isOptional,
        isOfficeClosed: eventHolidays.isOfficeClosed,
        isFestivalMarker: eventHolidays.isFestivalMarker,
        isExamMarker: eventHolidays.isExamMarker,
      })
      .from(eventHolidays)
      .where(gte(eventHolidays.holidayDate, today))
      .orderBy(asc(eventHolidays.holidayDate))
      .limit(take)
      .catch(() => []),
  ]);

  // The Monthly Events Master is the PREFERRED calendar: when both claim the
  // same date its name wins, because that is the name the Holiday List at
  // /holidays shows and the two must not disagree one click apart.
  const master: MergeableHoliday[] = masterRows
    .filter(
      (r) =>
        // A festival or exam MARKER is a note on the calendar, not a day off,
        // and neither is a day the office stays open. None of them belong in a
        // list headed "what's my next day off".
        r.isOfficeClosed &&
        !r.isFestivalMarker &&
        !r.isExamMarker &&
        // Religion targeting, via the same predicate the Holiday List uses.
        isHolidayForReligion({ appliesTo: r.appliesTo }, religion),
    )
    .map((r) => ({ date: r.date, label: r.label, optional: r.isOptional }));

  const admin: MergeableHoliday[] = adminRows.map((r) => ({ date: r.date, label: r.label }));

  // Sunday-dropping, de-duplication, sorting and the cut all live in the pure
  // core so they are unit-tested — see lib/attendance/holiday-merge.ts.
  return mergeUpcomingHolidays(master, admin, today, limit);
}
