"use client";

import { categoryColors } from "@/lib/exec-calendar/taxonomy";
import { monthWeeks, parseDay } from "@/lib/exec-calendar/grid";
import { monthName } from "@/lib/exec-calendar/period";
import type { ExecEventRow } from "@/lib/queries/exec-calendar";
import { MARKER_BG, MARKER_FG, markersByDay, type DayMarker } from "@/lib/exec-calendar/day-markers";

/**
 * One month as whole Monday→Sunday rows, with the ISO week number in the
 * gutter — the shape the master sheet is drawn in.
 *
 * Used at two sizes by the same component: full width for the Month view, and
 * twelve-up for the Year view (`compact`), where the cells lose their event
 * text and keep only coloured dots. At year scale the question is "what kind of
 * month was that", which colour answers; titles at that size are unreadable
 * anyway and turn the page into noise.
 *
 * EVERYTHING IS A LINK DOWNWARDS. The month name opens the month, a day cell
 * opens that day. Clicking into detail is how you use a calendar, and the
 * previous version made you go back to the toolbar to change horizon.
 */

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];
const MAX_CHIPS = 3;

export function ExecMonthGrid({
  anchor,
  events,
  today,
  compact = false,
  onPickDay,
  onPickMonth,
  onPickEvent,
  onPickWeek,
  markers = [],
  onPickMarker,
}: {
  anchor: string;
  events: ExecEventRow[];
  today?: string;
  compact?: boolean;
  onPickDay?: (day: string) => void;
  onPickMonth?: (day: string) => void;
  onPickEvent?: (event: ExecEventRow) => void;
  /** The week-number gutter opens that week (2026-09-18). */
  onPickWeek?: (monday: string) => void;
  markers?: DayMarker[];
  onPickMarker?: (marker: DayMarker) => void;
}) {
  const markerDays = markersByDay(markers);
  // Every month keeps its natural 4-6 rows, in the year view too - the look
  // asked back on 2026-09-18 (padding all twelve to six rows was reverted).
  const weeks = monthWeeks(anchor);
  const byDay = new Map<string, ExecEventRow[]>();
  for (const e of events) {
    const list = byDay.get(e.day) ?? [];
    list.push(e);
    byDay.set(e.day, list);
  }

  return (
    <div className="min-w-0">
      <button
        type="button"
        onClick={() => onPickMonth?.(anchor)}
        className={`mb-2 block w-full text-center font-bold text-ink-strong transition hover:text-[var(--color-altus-red)] ${
          compact ? "text-[13px]" : "text-[16px]"
        }`}
        title="Open this month"
      >
        {monthName(anchor, true)}
      </button>

      <div className="overflow-hidden border border-hairline">
        <div className="grid bg-surface-soft" style={{ gridTemplateColumns: "30px repeat(7, 1fr)" }}>
          <div className="px-1 py-1 text-center text-[9.5px] font-bold uppercase text-ink-subtle">Wk</div>
          {WEEKDAYS.map((d, i) => (
            <div key={i} className="border-l border-hairline px-1 py-1 text-center text-[9.5px] font-bold uppercase text-ink-subtle">
              {d}
            </div>
          ))}
        </div>

        {weeks.map((w) => (
          <div key={w.week} className="grid border-t border-hairline" style={{ gridTemplateColumns: "30px repeat(7, 1fr)" }}>
            <button
              type="button"
              onClick={() => onPickWeek?.(w.days[0]!.ymd)}
              className="flex items-center justify-center bg-surface-soft px-1 py-1 text-[10px] font-bold text-ink-subtle transition hover:bg-[var(--color-altus-red-wash)] hover:text-[var(--color-altus-red-deep)]"
              title={`Open week ${w.week}`}
            >
              {w.week}
            </button>
            {w.days.map((d) => {
              const list = byDay.get(d.ymd) ?? [];
              const dayMarkers = markerDays.get(d.ymd) ?? [];
              const isToday = d.ymd === today;
              return (
                <div
                  key={d.ymd}
                  onClick={(ev) => {
                    if (ev.target !== ev.currentTarget) return;
                    onPickDay?.(d.ymd);
                  }}
                  className={`border-l border-hairline p-[3px] align-top ${compact ? "min-h-[34px]" : "min-h-[76px]"}`}
                  style={{
                    cursor: onPickDay ? "pointer" : undefined,
                    background: !d.inMonth
                      ? "var(--color-surface-track)"
                      : isToday
                        ? "var(--color-altus-red-wash)"
                        : undefined,
                    opacity: d.inMonth ? 1 : 0.5,
                  }}
                >
                  {/* Day markers sit FLUSH AT THE TOP of the cell, above the date
                      number — a dark underline at year size, a labelled chip in the
                      month. The negative margins cancel the cell's p-[3px] so the
                      marker touches the cell's own borders instead of floating in a
                      3px gutter; that edge-to-edge band is what makes a marked day
                      readable at a glance across a whole year. Year view is this same
                      component with `compact`, so both sizes move together. */}
                  {dayMarkers.length > 0 && (
                    <div className="-mx-[3px] -mt-[3px] mb-[2px]">
                      {compact ? (
                        <span
                          className="block h-[3px]"
                          style={{ background: MARKER_BG }}
                          title={dayMarkers.map((m) => m.label).join(" · ")}
                        />
                      ) : (
                        dayMarkers.map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => onPickMarker?.(m)}
                            className="block w-full truncate px-[3px] text-left text-[10px] font-bold leading-[1.4]"
                            style={{ background: MARKER_BG, color: MARKER_FG }}
                            title={m.label}
                          >
                            {m.label}
                          </button>
                        ))
                      )}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => onPickDay?.(d.ymd)}
                    className={`text-[9.5px] font-bold leading-none transition hover:underline ${
                      isToday ? "text-[var(--color-altus-red)]" : "text-ink-subtle"
                    }`}
                  >
                    {parseDay(d.ymd).getUTCDate()}
                  </button>

                  {compact ? (
                    <div className="mt-[3px] flex flex-wrap gap-[2px]">
                      {list.slice(0, 6).map((e) => (
                        <span
                          key={e.id}
                          className="h-[5px] w-[5px] rounded-full"
                          style={{ background: categoryColors(e.categoryKey).base }}
                          title={e.title}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="mt-[2px] space-y-[2px]">
                      {list.slice(0, MAX_CHIPS).map((e) => {
                        const col = categoryColors(e.categoryKey);
                        return (
                          <button
                            key={e.id}
                            type="button"
                            onClick={() => onPickEvent?.(e)}
                            className="block w-full truncate rounded-[3px] px-[3px] text-left text-[10px] font-semibold leading-[1.4]"
                            style={{ background: col.bg, color: col.deep }}
                            title={e.title}
                          >
                            {e.title}
                          </button>
                        );
                      })}
                      {list.length > MAX_CHIPS && (
                        <button
                          type="button"
                          onClick={() => onPickDay?.(d.ymd)}
                          className="px-[3px] text-[9.5px] font-bold text-ink-subtle hover:underline"
                        >
                          +{list.length - MAX_CHIPS} more
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
