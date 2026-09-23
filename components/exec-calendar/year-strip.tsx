"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * The "Jump to year" strip: three years at a time, with arrows (2026-09-18).
 *
 * It opens with the CURRENT year leftmost, so the default is "now and the next
 * two". The arrows slide the window one year at a time, in either direction —
 * past years are reachable, they just are not what the strip leads with.
 *
 * If the calendar is showing a year outside the default window (you arrowed
 * the main view to 2031), the strip starts there instead, so the selected year
 * is never hidden off the edge of its own picker.
 *
 * The window is local state, not a URL parameter: sliding it is browsing the
 * picker, not navigating the calendar, and it should not add history entries.
 */
export function ExecYearStrip({
  thisYear,
  selectedYear,
  view,
  monthDay,
  ownerQuery,
}: {
  thisYear: number;
  selectedYear: number;
  /** The view to keep when jumping ("week", "month"…). */
  view: string;
  /** The "-MM-DD" tail of the day on screen, so a jump keeps the same date. */
  monthDay: string;
  /** "&owner=…" when reading someone else's calendar, else "". Plain strings,
   *  because a server page cannot hand a function to a client component. */
  ownerQuery: string;
}) {
  const hrefFor = (y: number) => `/events?view=${view}&day=${y}${monthDay}${ownerQuery}`;
  const initial =
    selectedYear >= thisYear && selectedYear <= thisYear + 2 ? thisYear : selectedYear;
  const [start, setStart] = React.useState(initial);
  const years = [start, start + 1, start + 2];

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => setStart((s) => s - 1)}
        aria-label="Earlier years"
        className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-hairline bg-surface-card text-ink-muted transition hover:border-hairline-strong"
      >
        <ChevronLeft size={14} />
      </button>
      <div className="grid min-w-0 flex-1 grid-cols-3 gap-1">
        {years.map((y) => {
          const active = y === selectedYear;
          return (
            <Link
              key={y}
              href={hrefFor(y) as Route}
              className={`rounded-pill py-1 text-center text-[12px] font-bold transition ${
                active ? "text-white" : "border border-hairline bg-surface-card text-ink-muted hover:text-ink-strong"
              }`}
              style={active ? { background: "var(--color-altus-red)" } : undefined}
            >
              {y}
            </Link>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => setStart((s) => s + 1)}
        aria-label="Later years"
        className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-hairline bg-surface-card text-ink-muted transition hover:border-hairline-strong"
      >
        <ChevronRight size={14} />
      </button>
    </div>
  );
}
