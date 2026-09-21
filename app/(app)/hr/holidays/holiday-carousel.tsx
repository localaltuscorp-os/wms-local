import Link from "next/link";
import type { Route } from "next";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { holidayMonthName } from "@/lib/hr/holidays-2026";
import type { MonthKey } from "@/lib/hr/holiday-calendar";

/**
 * THE HOLIDAY CAROUSEL — replaces the old Year + Month dropdowns.
 *
 * Prev / next step to the previous / next month that actually has an upcoming
 * holiday, so the empty months in between are never shown. The page resolves
 * `prev` and `next` (lib/hr/holiday-calendar) and hands them in; this only
 * renders links.
 *
 * A SERVER COMPONENT made of plain links: the selection still lives in the URL
 * (`?year=&month=`, `month=0` = All upcoming), so it stays shareable and the
 * back button still steps through it. no-print — Print Calendar prints the
 * whole year, not these controls.
 */

function hrefFor(k: MonthKey): Route {
  return `/hr/holidays?year=${k.year}&month=${k.month}` as Route;
}

export function HolidayCarousel({
  current,
  prev,
  next,
  showingAll,
  firstMonth,
  count,
}: {
  /** The month on screen; null in the All upcoming view. */
  current: MonthKey | null;
  prev: MonthKey | null;
  next: MonthKey | null;
  showingAll: boolean;
  /** Where the Month pill lands from the All view: the first upcoming month. */
  firstMonth: MonthKey | null;
  /** How many holidays this month has — the list below no longer repeats the month. */
  count?: number;
}) {
  const allHref = `/hr/holidays?year=${(current ?? firstMonth)?.year ?? ""}&month=0` as Route;

  return (
    <nav className="hol-carousel no-print" aria-label="Browse upcoming holidays by month">
      <div className="hol-car-toggle" role="group" aria-label="View">
        {firstMonth ? (
          <Link
            href={hrefFor(current ?? firstMonth)}
            replace
            scroll={false}
            className={`hol-car-pill${showingAll ? "" : " is-on"}`}
            aria-current={showingAll ? undefined : "true"}
          >
            Month
          </Link>
        ) : (
          <span className="hol-car-pill is-on">Month</span>
        )}
        <Link
          href={allHref}
          replace
          scroll={false}
          className={`hol-car-pill${showingAll ? " is-on" : ""}`}
          aria-current={showingAll ? "true" : undefined}
        >
          All upcoming
        </Link>
      </div>

      {!showingAll && current && (
        <div className="hol-car-stepper">
          {prev ? (
            <Link
              href={hrefFor(prev)}
              replace
              scroll={false}
              className="hol-car-btn"
              aria-label={`Previous: ${holidayMonthName(prev.month)} ${prev.year}`}
              title={`${holidayMonthName(prev.month)} ${prev.year}`}
            >
              <ChevronLeft size={18} strokeWidth={2.6} />
            </Link>
          ) : (
            <span className="hol-car-btn is-disabled" aria-disabled="true">
              <ChevronLeft size={18} strokeWidth={2.6} />
            </span>
          )}

          <div className="hol-car-label" aria-live="polite">
            <span className="hol-car-month">{holidayMonthName(current.month)}</span>
            <span className="hol-car-year">{current.year}</span>
            {count !== undefined && (
              <span className="hol-car-count" aria-label={`${count} holiday${count === 1 ? "" : "s"}`}>
                {count}
              </span>
            )}
          </div>

          {next ? (
            <Link
              href={hrefFor(next)}
              replace
              scroll={false}
              className="hol-car-btn"
              aria-label={`Next: ${holidayMonthName(next.month)} ${next.year}`}
              title={`${holidayMonthName(next.month)} ${next.year}`}
            >
              <ChevronRight size={18} strokeWidth={2.6} />
            </Link>
          ) : (
            <span className="hol-car-btn is-disabled" aria-disabled="true">
              <ChevronRight size={18} strokeWidth={2.6} />
            </span>
          )}
        </div>
      )}
    </nav>
  );
}
