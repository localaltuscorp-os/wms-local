"use client";

import { useRouter } from "next/navigation";
import type { Route } from "next";
import { ChevronLeft, ChevronRight } from "lucide-react";

/** Shared visible focus ring for keyboard users (brand-red on neutral surfaces). */
const FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/60 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-surface-card)]";

const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** A native month input would be ideal, but support is patchy — so we drive
 *  the `?y=&m=` query with a labelled month/year pair plus prev/next chevrons,
 *  presented as one frosted segmented pill. Server re-renders the dashboard
 *  for the chosen month. */
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

  const chevronCls = `wg-btn inline-flex items-center justify-center size-8 rounded-full text-ink-soft hover:text-[var(--color-altus-red)] hover:bg-[color-mix(in_srgb,var(--color-altus-red)_8%,transparent)] transition-colors ${FOCUS_RING}`;
  const selectCls = `h-8 rounded-full bg-transparent px-2 text-[14px] font-bold text-ink-strong cursor-pointer hover:text-[var(--color-altus-red-deep)] transition-colors ${FOCUS_RING}`;

  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-full border border-hairline px-1.5 py-1"
      style={{
        background: "rgba(255,255,255,0.72)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.85), 0 1px 2px rgba(15,23,42,0.05), 0 8px 20px -14px rgba(15,23,42,0.25)",
      }}
    >
      <button
        type="button"
        aria-label="Previous month"
        onClick={() => go(year, month - 1)}
        className={chevronCls}
      >
        <ChevronLeft size={16} strokeWidth={2.4} />
      </button>

      <select
        value={month}
        aria-label="Month"
        onChange={(e) => go(year, Number(e.target.value))}
        className={selectCls}
      >
        {MONTH_LABELS.map((label, i) => (
          <option key={label} value={i + 1}>
            {label}
          </option>
        ))}
      </select>

      <span aria-hidden className="h-4 w-px bg-[var(--color-hairline-strong)]" />

      <select
        value={year}
        aria-label="Year"
        onChange={(e) => go(Number(e.target.value), month)}
        className={`${selectCls} tabular-nums`}
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
        className={chevronCls}
      >
        <ChevronRight size={16} strokeWidth={2.4} />
      </button>
    </div>
  );
}
