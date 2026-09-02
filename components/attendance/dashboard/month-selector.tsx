"use client";

import { useRouter } from "next/navigation";
import type { Route } from "next";
import { ChevronLeft, ChevronRight } from "lucide-react";

const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** A native month input would be ideal, but support is patchy — so we drive
 *  the `?y=&m=` query with a labelled month/year pair plus prev/next chevrons.
 *  Server re-renders the dashboard for the chosen month. */
export function AttendanceMonthSelector({
  year,
  month,
}: {
  year: number;
  month: number;
}) {
  const router = useRouter();

  function go(y: number, m: number) {
    // Normalise month overflow/underflow into year rollover.
    let yy = y;
    let mm = m;
    if (mm < 1) {
      mm = 12;
      yy -= 1;
    } else if (mm > 12) {
      mm = 1;
      yy += 1;
    }
    router.push(`/attendance/dashboard?y=${yy}&m=${mm}` as Route);
  }

  // Year window: current ± a few, so the picker stays sane.
  const years: number[] = [];
  for (let y = year - 3; y <= year + 1; y++) years.push(y);

  return (
    <div className="inline-flex items-center gap-1.5">
      <button
        type="button"
        aria-label="Previous month"
        onClick={() => go(year, month - 1)}
        className="inline-flex items-center justify-center size-9 rounded-md border border-hairline bg-surface-card text-ink-soft hover:text-ink-strong hover:border-hairline-strong transition-colors"
      >
        <ChevronLeft size={16} strokeWidth={2.4} />
      </button>

      <select
        value={month}
        aria-label="Month"
        onChange={(e) => go(year, Number(e.target.value))}
        className="rounded-md border border-hairline bg-surface-card px-3 py-2 text-[14px] font-semibold text-ink-strong"
      >
        {MONTH_LABELS.map((label, i) => (
          <option key={label} value={i + 1}>
            {label}
          </option>
        ))}
      </select>

      <select
        value={year}
        aria-label="Year"
        onChange={(e) => go(Number(e.target.value), month)}
        className="rounded-md border border-hairline bg-surface-card px-3 py-2 text-[14px] font-semibold text-ink-strong tabular-nums"
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>

      <button
        type="button"
        aria-label="Next month"
        onClick={() => go(year, month + 1)}
        className="inline-flex items-center justify-center size-9 rounded-md border border-hairline bg-surface-card text-ink-soft hover:text-ink-strong hover:border-hairline-strong transition-colors"
      >
        <ChevronRight size={16} strokeWidth={2.4} />
      </button>
    </div>
  );
}
