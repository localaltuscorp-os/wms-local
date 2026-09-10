"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Route } from "next";
import {
  HOLIDAY_YEARS,
  HOLIDAY_MONTHS,
  HOLIDAY_MONTH_ALL,
  isPublishedHolidayYear,
} from "@/lib/hr/holidays-2026";

/**
 * Year + month pickers for the Holiday List.
 *
 * A CLIENT ISLAND, and only this. The page itself stays a server component and
 * reads the choice from the URL (`?year=&month=`), which is what keeps the list
 * server-rendered, shareable as a link, and - the reason that matters most here
 * - printable: Print Calendar outputs exactly the selection on screen, because
 * the selection IS the page rather than client state layered over it.
 *
 * The selects navigate rather than filter in place. Two consequences worth
 * knowing: the back button steps through selections, and a bookmarked month
 * still opens on that month next year.
 */
export function HolidayFilters({ year, month }: { year: number; month: number }) {
  const router = useRouter();
  const params = useSearchParams();

  const go = React.useCallback(
    (next: { year?: number; month?: number }) => {
      const q = new URLSearchParams(params?.toString() ?? "");
      q.set("year", String(next.year ?? year));
      q.set("month", String(next.month ?? month));
      router.replace(`/hr/holidays?${q.toString()}` as Route, { scroll: false });
    },
    [params, router, year, month],
  );

  return (
    <div className="hol-filters no-print">
      <label className="hol-filter">
        <span className="hol-filter-label">Year</span>
        <select
          className="hol-select"
          value={year}
          onChange={(e) => go({ year: Number(e.target.value) })}
          aria-label="Filter holidays by year"
        >
          {HOLIDAY_YEARS.map((y) => (
            <option key={y} value={y}>
              {/* A year with no notified list says so IN the option, so the
                  empty result is explained before it is chosen rather than
                  looking like a page that failed to load. */}
              {y}
              {isPublishedHolidayYear(y) ? "" : " - not published"}
            </option>
          ))}
        </select>
      </label>

      <label className="hol-filter">
        <span className="hol-filter-label">Month</span>
        <select
          className="hol-select"
          value={month}
          onChange={(e) => go({ month: Number(e.target.value) })}
          aria-label="Filter holidays by month"
        >
          <option value={HOLIDAY_MONTH_ALL}>All months</option>
          {HOLIDAY_MONTHS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
