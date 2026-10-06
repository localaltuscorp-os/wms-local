"use client";

import * as React from "react";
import { categoryColors, execCategory } from "@/lib/exec-calendar/taxonomy";
import { execClient } from "@/lib/exec-calendar/clients";
import {
  laneDay,
  minToLabel,
  monthWeeks,
  parseDay,
  rangeLabel,
  slotMinutes,
  type GridConfig,
} from "@/lib/exec-calendar/grid";
import type { ExecEventRow } from "@/lib/queries/exec-calendar";
import { MARKER_BG, MARKER_FG, markersByDay, type DayMarker } from "@/lib/exec-calendar/day-markers";
import { useEventContextMenu } from "./event-context-menu";

/** Month at a Glance reuses the hourly event grid over the selected month's
 * calendar weeks. Each week can collapse; adjacent-month days stay visible. */

const ROW_H = 22;
const TIME_COL = 64;
const HEAD_H = 30;
const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MON_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const HEADER_BG = "#6B7280";
const HEADER_BG_CURRENT = "var(--color-altus-red)";
const RULE = "#D3D3D3";

export function ExecMonthlyGridView({
  anchor,
  events,
  cfg,
  today,
  markers = [],
  onPickDay,
  onPickEvent,
  onPickSlot,
  onPickMarker,
}: {
  /** Any day in the month to display. */
  anchor: string;
  events: ExecEventRow[];
  cfg: GridConfig;
  today?: string;
  markers?: DayMarker[];
  onPickDay?: (day: string) => void;
  onPickEvent?: (event: ExecEventRow) => void;
  onPickSlot?: (day: string, startMin: number) => void;
  onPickMarker?: (marker: DayMarker) => void;
}) {
  const rows = slotMinutes(cfg);
  const height = rows.length * ROW_H;
  const cols = `${TIME_COL}px repeat(7, minmax(96px, 1fr))`;
  const weeks = monthWeeks(anchor);
  const { openMenu, node: contextMenuNode } = useEventContextMenu();
  const canEdit = !!onPickEvent;

  const byDay = React.useMemo(() => {
    const m = new Map<string, ExecEventRow[]>();
    for (const e of events) m.set(e.day, [...(m.get(e.day) ?? []), e]);
    return m;
  }, [events]);
  const markerDays = React.useMemo(() => markersByDay(markers), [markers]);
  const topMin = (m: number) => ((m - cfg.startMin) / cfg.slotMin) * ROW_H;

  const scrollBoxRef = React.useRef<HTMLDivElement>(null);

  return (
    <div ref={scrollBoxRef} className="max-h-[78vh] overflow-auto border border-hairline bg-white" style={{ overscrollBehaviorX: "contain" }}>
      <div style={{ minWidth: TIME_COL + 7 * 96 }}>
        <div
          className="sticky top-0 z-30 grid text-white"
          style={{ gridTemplateColumns: cols, background: HEADER_BG, height: HEAD_H }}
        >
          <div className="sticky left-0 z-10 flex items-center px-2 text-[10.5px] font-bold uppercase leading-tight" style={{ background: HEADER_BG }}>
            Time
          </div>
          {DAY_NAMES.map((d) => (
            <div key={d} className="flex items-center justify-center border-l border-white/15 px-2 text-[11.5px] font-bold">
              {d}
            </div>
          ))}
        </div>

        {weeks.map((wk, wi) => {
          const days = wk.days.map((d) => d.ymd);
          const isCurrentWeek = !!today && days.includes(today);
          const weekBg = isCurrentWeek ? HEADER_BG_CURRENT : HEADER_BG;
          return (
            <details key={`${days[0]}-${wi}`} open className="border-t border-hairline" aria-label={`Week ${wi + 1}`}>
              <summary className="cursor-pointer px-3 py-1.5 text-[11px] font-black uppercase tracking-wide text-white" style={{ background: weekBg }}>
                Week {wi + 1}
              </summary>
              <div
                className="sticky z-20 grid border-t border-white/10 text-white"
                style={{ top: HEAD_H, gridTemplateColumns: cols, background: weekBg }}
              >
                <div className="sticky left-0 z-10 flex items-center px-2 py-1.5 text-[11px] font-bold" style={{ background: weekBg }}>
                  Time
                </div>
                {days.map((d) => {
                  const date = parseDay(d);
                  const isToday = d === today;
                  return (
                    <div key={d} className="min-w-0 border-l border-white/15 px-1.5 py-1.5">
                      <button
                        type="button"
                        onClick={() => onPickDay?.(d)}
                        className="block w-full text-center text-[11px] font-bold tabular-nums transition hover:underline"
                        style={{
                          color: isToday ? (isCurrentWeek ? "#FFFFFF" : "#FF6B6B") : undefined,
                          textDecoration: isToday && isCurrentWeek ? "underline" : undefined,
                          cursor: onPickDay ? "pointer" : "default",
                        }}
                      >
                        {date.getUTCDate()} {MON_SHORT[date.getUTCMonth()]}
                      </button>
                      {(markerDays.get(d) ?? []).map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => onPickMarker?.(m)}
                          title={m.label}
                          className="mt-1 block w-full truncate rounded-[3px] px-1 py-[1px] text-center text-[10px] font-bold leading-snug"
                          style={{ background: MARKER_BG, color: MARKER_FG, cursor: onPickMarker ? "pointer" : "default" }}
                        >
                          {m.label}
                        </button>
                      ))}
                      {(byDay.get(d) ?? [])
                        .filter((e) => e.allDay)
                        .map((e) => {
                          const cat = execCategory(e.categoryKey);
                          return (
                            <button
                              key={e.id}
                              type="button"
                              onClick={() => onPickEvent?.(e)}
                              onContextMenu={canEdit ? (ev) => openMenu(ev, e) : undefined}
                              title={`${e.title} · ${cat.label} · All day`}
                              className="mt-1 block w-full rounded-[3px] px-1 py-[1px] text-center text-[10.5px] font-bold leading-snug text-[#111]"
                              style={{ background: `color-mix(in srgb, ${cat.hex} 55%, white)`, cursor: onPickEvent ? "pointer" : "default" }}
                            >
                              {e.title}
                            </button>
                          );
                        })}
                    </div>
                  );
                })}
              </div>

              <div className="grid" style={{ gridTemplateColumns: cols }}>
                <div className="sticky left-0 z-10 bg-white" style={{ height }}>
                  {rows.map((m) => (
                    <div
                      key={m}
                      className="flex items-center justify-end border-b pr-1.5 text-[10px] font-medium tabular-nums text-ink-muted"
                      style={{ height: ROW_H, borderColor: RULE }}
                    >
                      {minToLabel(m)}
                    </div>
                  ))}
                </div>

                {days.map((d) => {
                  const placed = laneDay(byDay.get(d) ?? [], cfg);
                  return (
                    <div key={d} className="relative border-l" style={{ height, borderColor: RULE }}>
                      {rows.map((m, i) => (
                        <div
                          key={m}
                          className="absolute inset-x-0 border-b"
                          style={{ top: i * ROW_H, height: ROW_H, borderColor: RULE, cursor: onPickSlot ? "copy" : undefined }}
                          onClick={() => onPickSlot?.(d, m)}
                        />
                      ))}
                      {placed.map(({ e, start, end, lane, lanes }) => {
                        const cat = execCategory(e.categoryKey);
                        const col = categoryColors(e.categoryKey);
                        const client = execClient(e.clientKey);
                        const top = topMin(start);
                        const h = Math.max(ROW_H, topMin(end) - top);
                        return (
                          <button
                            key={e.id}
                            type="button"
                            onClick={() => onPickEvent?.(e)}
                            onContextMenu={canEdit ? (ev) => openMenu(ev, e) : undefined}
                            className="absolute z-10 flex flex-col justify-start overflow-hidden border px-1 py-0.5 text-left text-[10.5px] leading-tight text-[#111]"
                            style={{
                              top,
                              height: h,
                              left: `calc(${(100 / lanes) * lane}% + 1px)`,
                              width: `calc(${100 / lanes}% - 2px)`,
                              background: `color-mix(in srgb, ${cat.hex} 55%, white)`,
                              borderColor: col.edge,
                              cursor: onPickEvent ? "pointer" : "default",
                            }}
                            title={`${e.title} · ${cat.label}${e.clientName ? ` · ${e.clientName}` : ""}\n${e.allDay ? "All day" : rangeLabel(e.startMin!, e.endMin!)}${e.location ? `\n${e.location}` : ""}`}
                          >
                            <span className="whitespace-normal break-words font-bold">{e.title}</span>
                            {h >= ROW_H * 2 && (
                              <span className="whitespace-normal break-words">
                                {e.allDay ? "All day" : rangeLabel(e.startMin!, e.endMin!)}
                              </span>
                            )}
                            {h >= ROW_H * 3 && e.clientName && (
                              <span className="flex min-w-0 items-center gap-1 font-semibold">
                                {client && (
                                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: client.hex, boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.25)" }} />
                                )}
                                <span className="truncate">{e.clientName}</span>
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
              <div className="grid" style={{ gridTemplateColumns: cols }}>
                <div className="flex h-5 items-start justify-end pr-1.5 text-[10px] font-medium tabular-nums text-ink-muted">{minToLabel(cfg.endMin)}</div>
                {days.map((d) => <div key={d} className="h-5 border-l" style={{ borderColor: RULE }} />)}
              </div>
            </details>
          );
        })}
      </div>
      {contextMenuNode}
    </div>
  );
}
