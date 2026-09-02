"use client";

/**
 * One ISO-week band of the time-grid (design §2). Rows = 30-min slots
 * 07:00→21:00; columns = Mon–Sun. Used stacked (one per week) for the HERO
 * month view and singly (larger slotH) for the week view. Renders: day headers
 * (date + weekday, tinted on holidays), an all-day banner row, the left time
 * axis, and seven `DayColumn`s.
 */
import * as React from "react";
import { addDays, format } from "date-fns";
import { cn } from "@/lib/utils";
import type { CalendarEvent } from "@/lib/monthly-events/types";
import { minToLabel } from "@/lib/monthly-events/types";
import {
  DAY_START_MIN,
  DAY_END_MIN,
  SLOT_MIN,
  gridHeight,
} from "./geometry";
import { DayColumn } from "./day-column";
import { AllDayBanner } from "./all-day-banner";
import type { CategoryMap } from "./model";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface TimeGridBandProps {
  weekStart: Date; // a Monday
  events: CalendarEvent[]; // already filtered to the legend selection
  catMap: CategoryMap;
  slotH: number;
  view: "month" | "week";
  todayIso: string;
  inMonth?: (iso: string) => boolean;
  selectedIds: Set<string>;
  onMeasureCol: (w: number) => void;
  onSelect: (id: string, additive: boolean) => void;
  onOpenEditor: (ev: CalendarEvent) => void;
  onContextMenu: (id: string, x: number, y: number) => void;
  onRename: (id: string, title: string) => void;
  onResize: (id: string, startMin: number, endMin: number) => void;
  onLockedInteract: (ev: CalendarEvent) => void;
  onCreateRange: (date: string, startMin: number, endMin: number) => void;
  onCreateAllDay: (date: string) => void;
}

export function TimeGridBand(props: TimeGridBandProps) {
  const { weekStart, events, slotH, view, todayIso, inMonth } = props;

  const days = React.useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = addDays(weekStart, i);
        return { date: d, iso: format(d, "yyyy-MM-dd") };
      }),
    [weekStart],
  );

  const byDate = React.useMemo(() => {
    const m = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      const arr = m.get(e.eventDate);
      if (arr) arr.push(e);
      else m.set(e.eventDate, [e]);
    }
    return m;
  }, [events]);

  const axisW = 56;
  const hourLabels: number[] = [];
  for (let m = DAY_START_MIN; m <= DAY_END_MIN; m += 60) hourLabels.push(m);

  return (
    <div className="overflow-hidden rounded-xl border-2 border-hairline-strong bg-surface-card">
      {/* Header row */}
      <div
        className="grid border-b border-hairline-strong bg-surface-soft/60"
        style={{ gridTemplateColumns: `${axisW}px repeat(7, minmax(0, 1fr))` }}
      >
        <div />
        {days.map(({ date, iso }) => {
          const dayEvents = byDate.get(iso) ?? [];
          const hasHoliday = dayEvents.some((e) => e.allDay && e.source === "holiday");
          const isToday = iso === todayIso;
          const outside = inMonth ? !inMonth(iso) : false;
          return (
            <div
              key={iso}
              className={cn(
                "flex items-baseline gap-1.5 border-l border-hairline-strong px-2 py-1.5",
                outside && "opacity-45",
              )}
              style={hasHoliday ? { background: "rgba(200,16,46,0.06)" } : undefined}
            >
              <span
                className={cn(
                  "inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[12.5px] font-bold",
                  isToday ? "text-white" : "text-ink-strong",
                )}
                style={isToday ? { background: "var(--color-altus-red, #c8102e)" } : undefined}
              >
                {format(date, "d")}
              </span>
              <span className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-soft">
                {WEEKDAYS[days.findIndex((x) => x.iso === iso)]}
              </span>
            </div>
          );
        })}
      </div>

      {/* All-day banner row */}
      <div
        className="grid border-b border-hairline-strong"
        style={{ gridTemplateColumns: `${axisW}px repeat(7, minmax(0, 1fr))` }}
      >
        <div className="px-1 py-1 text-right text-[9px] font-semibold uppercase tracking-wide text-ink-soft">
          All-day
        </div>
        {days.map(({ iso }) => {
          const allDay = (byDate.get(iso) ?? []).filter((e) => e.allDay);
          return (
            <div
              key={iso}
              className="min-h-[26px] space-y-0.5 border-l border-hairline-strong p-0.5"
              onDoubleClick={() => props.onCreateAllDay(iso)}
            >
              {allDay.map((e) => (
                <AllDayBanner
                  key={e.id}
                  ev={e}
                  catMap={props.catMap}
                  selected={props.selectedIds.has(e.id)}
                  onSelect={props.onSelect}
                  onContextMenu={props.onContextMenu}
                  onOpenEditor={props.onOpenEditor}
                  onLockedInteract={props.onLockedInteract}
                />
              ))}
            </div>
          );
        })}
      </div>

      {/* Time-grid body */}
      <div
        className="grid"
        style={{ gridTemplateColumns: `${axisW}px repeat(7, minmax(0, 1fr))` }}
      >
        {/* Time axis */}
        <div className="relative" style={{ height: gridHeight(slotH) }}>
          {hourLabels.map((m) => (
            <div
              key={m}
              className="absolute right-1.5 -translate-y-1/2 text-[10px] font-medium text-ink-soft"
              style={{ top: ((m - DAY_START_MIN) / SLOT_MIN) * slotH }}
            >
              {minToLabel(m)}
            </div>
          ))}
        </div>

        {days.map(({ iso }) => (
          <DayColumn
            key={iso}
            date={iso}
            events={(byDate.get(iso) ?? []).filter((e) => !e.allDay)}
            catMap={props.catMap}
            slotH={slotH}
            compact={view === "month"}
            selectedIds={props.selectedIds}
            onMeasure={props.onMeasureCol}
            onSelect={props.onSelect}
            onContextMenu={props.onContextMenu}
            onRename={props.onRename}
            onResize={props.onResize}
            onLockedInteract={props.onLockedInteract}
            onCreateRange={props.onCreateRange}
          />
        ))}
      </div>
    </div>
  );
}
