"use client";

/**
 * Compact classic month grid (design §2, view 3): day cells with event chips +
 * holiday/marker tints — the big-picture / print-friendly view. Chips open the
 * editor; empty-cell click quick-creates. Holidays (all-day, source=holiday)
 * tint the cell.
 */
import * as React from "react";
import {
  addDays,
  endOfMonth,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { cn } from "@/lib/utils";
import type { CalendarEvent } from "@/lib/monthly-events/types";
import { minToLabel } from "@/lib/monthly-events/types";
import type { CategoryMap } from "./model";
import { eventColor, readableTextColor } from "./colors";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MAX_CHIPS = 4;

interface MonthOverviewProps {
  monthDate: Date;
  events: CalendarEvent[];
  catMap: CategoryMap;
  todayIso: string;
  onOpenEditor: (ev: CalendarEvent) => void;
  onContextMenu: (id: string, x: number, y: number) => void;
  onQuickCreate: (date: string) => void;
}

export function MonthOverview({
  monthDate,
  events,
  catMap,
  todayIso,
  onOpenEditor,
  onContextMenu,
  onQuickCreate,
}: MonthOverviewProps) {
  const cells = React.useMemo(() => {
    const first = startOfWeek(startOfMonth(monthDate), { weekStartsOn: 1 });
    const last = endOfMonth(monthDate);
    const out: { date: Date; iso: string }[] = [];
    let d = first;
    while (d <= last || out.length % 7 !== 0) {
      out.push({ date: d, iso: format(d, "yyyy-MM-dd") });
      d = addDays(d, 1);
    }
    return out;
  }, [monthDate]);

  const byDate = React.useMemo(() => {
    const m = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      const arr = m.get(e.eventDate);
      if (arr) arr.push(e);
      else m.set(e.eventDate, [e]);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => {
        if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
        return (a.startMin ?? 0) - (b.startMin ?? 0);
      });
    }
    return m;
  }, [events]);

  return (
    <div className="overflow-hidden rounded-2xl border border-hairline bg-surface-card">
      <div className="grid grid-cols-7 border-b border-hairline bg-surface-soft/60">
        {WEEKDAYS.map((w) => (
          <div key={w} className="px-2 py-2 text-center text-[11px] font-bold uppercase tracking-wide text-ink-soft">
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map(({ date, iso }) => {
          const dayEvents = byDate.get(iso) ?? [];
          const holiday = dayEvents.some((e) => e.allDay && e.source === "holiday");
          const outside = !isSameMonth(date, monthDate);
          const isToday = iso === todayIso;
          return (
            <div
              key={iso}
              className={cn(
                "min-h-[104px] border-b border-l border-hairline p-1.5",
                outside && "bg-surface-soft/40",
              )}
              style={holiday ? { background: "rgba(200,16,46,0.05)" } : undefined}
              onClick={() => onQuickCreate(iso)}
            >
              <div className="mb-1 flex items-center justify-between">
                <span
                  className={cn(
                    "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11.5px] font-bold",
                    isToday ? "text-white" : outside ? "text-ink-soft" : "text-ink-strong",
                  )}
                  style={isToday ? { background: "var(--color-altus-red, #c8102e)" } : undefined}
                >
                  {format(date, "d")}
                </span>
              </div>
              <div className="space-y-0.5">
                {dayEvents.slice(0, MAX_CHIPS).map((e) => {
                  const cat = e.categoryId ? catMap.get(e.categoryId) : undefined;
                  const color = eventColor(e.colorOverride, cat?.color);
                  return (
                    <button
                      key={e.id}
                      type="button"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        onOpenEditor(e);
                      }}
                      onContextMenu={(ev) => {
                        ev.preventDefault();
                        ev.stopPropagation();
                        onContextMenu(e.id, ev.clientX, ev.clientY);
                      }}
                      className="flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[10.5px] font-semibold"
                      style={{
                        background: color,
                        color: readableTextColor(color),
                        border: e.status === "tentative" ? "1px dashed rgba(0,0,0,0.35)" : "none",
                      }}
                      title={`${e.title}${e.startMin != null ? ` · ${minToLabel(e.startMin)}` : ""}`}
                    >
                      {e.startMin != null && !e.allDay && (
                        <span className="shrink-0 tabular-nums opacity-80">{minToLabel(e.startMin).replace(":00", "")}</span>
                      )}
                      <span className="truncate">{e.title}</span>
                    </button>
                  );
                })}
                {dayEvents.length > MAX_CHIPS && (
                  <div className="px-1 text-[10px] font-semibold text-ink-soft">
                    +{dayEvents.length - MAX_CHIPS} more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
