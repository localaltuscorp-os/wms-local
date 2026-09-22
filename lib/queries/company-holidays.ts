import "server-only";
import { and, gte, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { holidays } from "@/db/schema";
import { listHolidays as listEventHolidays } from "@/lib/queries/monthly-events";
import { publishedHolidaysForYear } from "@/lib/hr/holidays-2026";
import { mergeCompanyHolidays, type CompanyHoliday } from "@/lib/hr/company-holidays";

/**
 * The company holiday list for one financial year (April → March): the Events
 * Master, the published calendar and the ad-hoc / Admin Panel days, merged by
 * lib/hr/company-holidays. Shared by /holidays and GET /api/mobile/holidays so
 * the web list and the app list cannot disagree.
 *
 * Each half fails soft: a hiccup on one table must not blank the whole list.
 */
export async function listCompanyHolidaysForFy(fyStartYear: number): Promise<CompanyHoliday[]> {
  const from = `${fyStartYear}-04-01`;
  const to = `${fyStartYear + 1}-03-31`;

  const [master, tableRows] = await Promise.all([
    listEventHolidays(fyStartYear).catch(() => []),
    db
      .select({ holidayDate: holidays.holidayDate, label: holidays.label, isActive: holidays.isActive })
      .from(holidays)
      .where(and(gte(holidays.holidayDate, from), lte(holidays.holidayDate, to)))
      .catch(() => [] as { holidayDate: string; label: string; isActive: boolean }[]),
  ]);

  const published = [...publishedHolidaysForYear(fyStartYear), ...publishedHolidaysForYear(fyStartYear + 1)].filter(
    (h) => h.date >= from && h.date <= to,
  );

  return mergeCompanyHolidays({
    fyStartYear,
    master,
    published,
    adHoc: tableRows.filter((r) => r.isActive).map((r) => ({ holidayDate: String(r.holidayDate), label: r.label })),
    suppressed: tableRows.filter((r) => !r.isActive).map((r) => String(r.holidayDate)),
  });
}
