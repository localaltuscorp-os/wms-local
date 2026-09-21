/**
 * THE COMPANY HOLIDAY LIST, MERGED — what /holidays and the mobile app show.
 *
 * Those two used to read only the Monthly Events Master (`event_holidays`), so
 * an ad-hoc holiday HR declared — which attendance and payroll already honour —
 * never appeared on the list employees actually look at, and neither did the
 * firm's published calendar unless someone re-typed it into the Events Master.
 *
 * Three sources, one row per date:
 *   1. Events Master rows    — kept as they are (religion targeting and all).
 *   2. Published calendar    — lib/hr/holidays-2026, unless withdrawn.
 *   3. `holidays` table rows — ad-hoc / Admin Panel days.
 * A date already carried by a company-wide Events Master row (applies to all or
 * custom) is not repeated. A religion-only master row does NOT block the date:
 * the company-wide holiday still has to reach everyone else.
 *
 * "Withdrawn" is an inactive `holidays` row, the same suppression the attendance
 * grader applies (lib/queries/holidays.listHolidayDateSet).
 *
 * PURE: type-only imports, no I/O.
 */

import type { Holiday } from "@/lib/monthly-events/types";

export type CompanyHolidaySource = "events" | "published" | "adhoc";
export type CompanyHoliday = Holiday & { source: CompanyHolidaySource };

/** Indian financial year start for a yyyy-mm-dd date: April onwards is that year. */
export function fyStartYearForYmd(ymd: string): number {
  const y = Number(ymd.slice(0, 4));
  const m = Number(ymd.slice(5, 7));
  return m >= 4 ? y : y - 1;
}

function synthetic(
  holidayDate: string,
  name: string,
  fyStartYear: number,
  source: Exclude<CompanyHolidaySource, "events">,
): CompanyHoliday {
  const at = new Date(`${holidayDate}T00:00:00Z`);
  return {
    id: `${source}:${holidayDate}`,
    name,
    fyStartYear,
    holidayDate,
    appliesTo: "all",
    isOptional: false,
    isOfficeClosed: true,
    isFestivalMarker: false,
    isExamMarker: false,
    notes: null,
    createdById: null,
    updatedById: null,
    createdAt: at,
    updatedAt: at,
    source,
  };
}

export function mergeCompanyHolidays(input: {
  fyStartYear: number;
  master: readonly Holiday[];
  published: readonly { date: string; label: string }[];
  adHoc: readonly { holidayDate: string; label: string }[];
  /** Dates an inactive `holidays` row withdraws. */
  suppressed: Iterable<string>;
}): CompanyHoliday[] {
  const withdrawn = new Set(input.suppressed);
  const out: CompanyHoliday[] = input.master.map((h) => ({
    ...h,
    holidayDate: String(h.holidayDate),
    source: "events" as const,
  }));
  const taken = new Set(
    out.filter((h) => h.appliesTo === "all" || h.appliesTo === "custom").map((h) => h.holidayDate),
  );

  for (const p of input.published) {
    if (taken.has(p.date) || withdrawn.has(p.date)) continue;
    out.push(synthetic(p.date, p.label, input.fyStartYear, "published"));
    taken.add(p.date);
  }
  for (const a of input.adHoc) {
    const d = String(a.holidayDate).slice(0, 10);
    if (taken.has(d)) continue;
    out.push(synthetic(d, a.label, input.fyStartYear, "adhoc"));
    taken.add(d);
  }

  return out.sort((a, b) => a.holidayDate.localeCompare(b.holidayDate) || a.name.localeCompare(b.name));
}
