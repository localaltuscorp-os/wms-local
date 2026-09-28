"use client";

import * as React from "react";
import { categoryColors } from "@/lib/exec-calendar/taxonomy";
import { monthWeeks, parseDay, minToLabel } from "@/lib/exec-calendar/grid";
import type { ExecEventRow } from "@/lib/queries/exec-calendar";

/**
 * MONTHLY GRID — the "Excel sheet" month view (asked 2026-09-24), a sibling of
 * "Month" (`month-grid.tsx`), not a replacement for it.
 *
 * The difference from `ExecMonthGrid`: dark weekday headers (matching the
 * Weekly Grid's banner, `HEADER_BG`), a taller day box, and pills that carry
 * their START TIME ("08:30 AM - Team Sync"), because this view's whole point
 * is reading the day's shape at a glance the way a spreadsheet would — a bare
 * title chip (what `ExecMonthGrid` shows) doesn't answer "when." Never shows a
 * fixed time-slot Y-axis — that's the Weekly Grid's job, not this one's.
 */

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MAX_PILLS = 4;
const HEADER_BG = "#1A1A1A";

export function ExecMonthlyGridView({
  anchor,
  events,
  today,
  onPickDay,
  onPickEvent,
}: {
  anchor: string;
  events: ExecEventRow[];
  today?: string;
  onPickDay?: (day: string) => void;
  onPickEvent?: (event: ExecEventRow) => void;
}) {
  const weeks = monthWeeks(anchor);
  const byDay = new Map<string, ExecEventRow[]>();
  for (const e of events) {
    const list = byDay.get(e.day) ?? [];
    list.push(e);
    byDay.set(e.day, list);
  }

  return (
    <div className="overflow-hidden rounded-lg border border-hairline bg-white">
      <div className="grid" style={{ gridTemplateColumns: "repeat(7, 1fr)" }}>
        {WEEKDAYS.map((d) => (
          <div
            key={d}
            className="border-l border-black/10 px-2 py-2 text-center text-[10.5px] font-bold uppercase tracking-wide text-white first:border-l-0"
            style={{ background: HEADER_BG }}
          >
            {d}
          </div>
        ))}
      </div>

      {weeks.map((w) => (
        <div key={w.week} className="grid border-t border-hairline" style={{ gridTemplateColumns: "repeat(7, 1fr)" }}>
          {w.days.map((d) => {
            const list = (byDay.get(d.ymd) ?? []).sort((a, b) => (a.startMin ?? -1) - (b.startMin ?? -1));
            const isToday = d.ymd === today;
            return (
              <div
                key={d.ymd}
                className="min-h-[104px] border-l border-hairline p-1.5 align-top first:border-l-0"
                style={{
                  cursor: onPickDay ? "pointer" : undefined,
                  background: !d.inMonth
                    ? "var(--color-surface-track)"
                    : isToday
                      ? "var(--color-altus-red-wash)"
                      : undefined,
                  opacity: d.inMonth ? 1 : 0.5,
                }}
                onClick={(ev) => {
                  if (ev.target !== ev.currentTarget) return;
                  onPickDay?.(d.ymd);
                }}
              >
                <button
                  type="button"
                  onClick={() => onPickDay?.(d.ymd)}
                  className={`text-[11px] font-bold leading-none transition hover:underline ${
                    isToday ? "text-[var(--color-altus-red)]" : "text-ink-subtle"
                  }`}
                >
                  {parseDay(d.ymd).getUTCDate()}
                </button>

                <div className="mt-[4px] space-y-[2px]">
                  {list.slice(0, MAX_PILLS).map((e) => {
                    const col = categoryColors(e.categoryKey);
                    const time = e.allDay ? "" : e.startMin != null ? `${minToLabel(e.startMin)} - ` : "";
                    return (
                      <button
                        key={e.id}
                        type="button"
                        onClick={() => onPickEvent?.(e)}
                        className="block w-full truncate rounded-[3px] border-l-[3px] px-[4px] py-[1px] text-left text-[9.5px] font-semibold leading-[1.5]"
                        style={{ background: col.bg, color: col.deep, borderColor: col.base }}
                        title={`${time}${e.title}`}
                      >
                        {time}
                        {e.title}
                      </button>
                    );
                  })}
                  {list.length > MAX_PILLS && (
                    <button
                      type="button"
                      onClick={() => onPickDay?.(d.ymd)}
                      className="px-[4px] text-[9.5px] font-bold text-ink-subtle hover:underline"
                    >
                      + {list.length - MAX_PILLS} more
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
