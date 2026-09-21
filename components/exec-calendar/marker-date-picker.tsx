"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Chevroned } from "@/components/ui/chevroned-select";
import { addMonths, monthStart, monthWeeks, parseDay } from "@/lib/exec-calendar/grid";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * The Day Marker date picker: one month at a time, with [Year] [Month]
 * dropdowns in the header (asked 2026-09-18, in that order) beside the usual
 * ← → arrows. Picking a year or month jumps the grid there at once.
 *
 * It only REPORTS clicks; the marker form decides what a click means in each
 * mode (one day / a period / individual days) and passes back what to paint:
 * `selected` days are filled, `pending` is outlined (the day chosen but not yet
 * added, in Individual Days mode).
 */
export function MarkerDatePicker({
  anchor,
  onAnchor,
  selected,
  pending,
  today,
  onPick,
}: {
  /** Any day in the month on show. */
  anchor: string;
  onAnchor: (day: string) => void;
  selected: ReadonlySet<string>;
  pending?: string | null;
  today?: string;
  onPick: (day: string) => void;
}) {
  const first = monthStart(anchor);
  const year = Number(first.slice(0, 4));
  const month = Number(first.slice(5, 7)) - 1;
  const thisYear = Number((today ?? first).slice(0, 4));
  // Two years back to six ahead, plus whichever year is on show if it's outside that.
  const years = [...new Set([...Array.from({ length: 9 }, (_, i) => thisYear - 2 + i), year])].sort((a, b) => a - b);
  const weeks = monthWeeks(first);
  const SELECT =
    "h-8 appearance-none rounded-lg border border-hairline bg-surface-card pl-2.5 !pr-8 text-[12.5px] font-bold text-ink-strong outline-none focus:border-[var(--color-altus-red)]";

  return (
    <div className="rounded-xl border border-hairline bg-surface-card p-2.5">
      <div className="mb-2 flex items-center gap-1.5">
        <button
          type="button"
          aria-label="Previous month"
          onClick={() => onAnchor(addMonths(first, -1))}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-hairline text-ink-muted transition hover:border-hairline-strong"
        >
          <ChevronLeft size={15} />
        </button>
        <div className="flex min-w-0 flex-1 justify-center gap-1.5">
          <Chevroned className="shrink-0">
            <select
              aria-label="Year"
              className={SELECT}
              value={year}
              onChange={(e) => onAnchor(`${e.target.value}-${String(month + 1).padStart(2, "0")}-01`)}
            >
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </Chevroned>
          <Chevroned className="min-w-0">
            <select
              aria-label="Month"
              className={SELECT}
              value={month}
              onChange={(e) => onAnchor(`${year}-${String(Number(e.target.value) + 1).padStart(2, "0")}-01`)}
            >
              {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
            </select>
          </Chevroned>
        </div>
        <button
          type="button"
          aria-label="Next month"
          onClick={() => onAnchor(addMonths(first, 1))}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-hairline text-ink-muted transition hover:border-hairline-strong"
        >
          <ChevronRight size={15} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-1 text-center text-[10px] font-bold uppercase text-ink-subtle">{w}</div>
        ))}
        {weeks.flatMap((w) =>
          w.days.map((d) => {
            const on = selected.has(d.ymd);
            const isPending = pending === d.ymd && !on;
            const isToday = d.ymd === today;
            return (
              <button
                key={d.ymd}
                type="button"
                onClick={() => onPick(d.ymd)}
                aria-pressed={on}
                className="h-8 rounded-md text-[12px] font-semibold tabular-nums transition"
                style={{
                  background: on ? "var(--color-altus-red)" : undefined,
                  color: on ? "#fff" : d.inMonth ? "var(--color-ink-strong)" : "var(--color-ink-subtle)",
                  opacity: d.inMonth || on ? 1 : 0.55,
                  boxShadow: isPending
                    ? "inset 0 0 0 2px var(--color-altus-red)"
                    : isToday && !on
                      ? "inset 0 0 0 1px var(--color-hairline-strong)"
                      : undefined,
                }}
              >
                {parseDay(d.ymd).getUTCDate()}
              </button>
            );
          }),
        )}
      </div>
    </div>
  );
}
