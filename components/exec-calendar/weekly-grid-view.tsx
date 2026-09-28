"use client";

import * as React from "react";
import { categoryColors, execCategory } from "@/lib/exec-calendar/taxonomy";
import { execClient } from "@/lib/exec-calendar/clients";
import {
  addDays,
  clampToWindow,
  isoWeek,
  minToLabel,
  parseDay,
  rangeLabel,
  slotMinutes,
  type GridConfig,
} from "@/lib/exec-calendar/grid";
import { GRID_WEEKS, monthName } from "@/lib/exec-calendar/period";
import { markersByDay, type DayMarker } from "@/lib/exec-calendar/day-markers";
import type { ExecEventRow } from "@/lib/queries/exec-calendar";

/**
 * WEEKLY GRID — the master sheet as a spreadsheet (asked 2026-09-18).
 *
 * Eight columns (time, then Monday → Sunday), and the chosen week plus the
 * three after it stacked down the page. A dark banner names the month where a
 * new one starts; each week opens with a dark row carrying its number, its
 * dates and that day's Day Markers. Below, one row per half hour across the
 * calendar's window (06:30–23:00, the same as Day and Week), white cells with a
 * light grey rule, and every block filled in its category's colour with black
 * text that wraps. Blocks that overlap split the cell side by side - a sheet has
 * no layers, so there is no nesting here.
 *
 * ALL-DAY BLOCKS ARE BANNERS in the dark week row, beside that day's markers,
 * NOT a column of their own: a sheet shows "Ganesh Chaturthi" once across the
 * day, and giving it a lane squeezed the real bookings into slivers.
 *
 * The header row stays pinned while the weeks scroll under it, and the time
 * column stays pinned while the grid scrolls sideways on a narrow screen.
 */

const ROW_H = 22;
const TIME_COL = 64;
/**
 * The column-header row's height, STATED rather than derived from its padding.
 *
 * The per-week bar below sticks at exactly this offset, so the two numbers have
 * to agree or the bar either overlaps the header or floats below it. Measuring
 * the header at runtime would agree by construction but costs a ResizeObserver
 * and a layout read on a box that scrolls — and a measured offset that updates a
 * frame late shows up as the sticky bar juddering. One constant, used by both,
 * cannot drift and cannot judder.
 *
 * 30px = py-2 (8+8) + an 11.5px line at leading-tight (~14px).
 */
const HEAD_H = 30;
const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MON_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const HEADER_BG = "#1A1A1A";
const RULE = "#D3D3D3";

type Placed = { e: ExecEventRow; start: number; end: number; lane: number; lanes: number };

/** Side-by-side lanes for one day: greedy packing, lane count per overlap cluster. */
function laneDay(events: ExecEventRow[], cfg: GridConfig): Placed[] {
  const items = events
    .flatMap((e) => {
      if (e.allDay) return []; // drawn as a banner in the week row
      if (e.startMin == null || e.endMin == null || e.endMin <= e.startMin) return [];
      let start = clampToWindow(e.startMin, cfg);
      let end = clampToWindow(e.endMin, cfg);
      // Wholly outside the window: pinned to the nearest edge, one row tall.
      if (end <= start) {
        start = e.endMin <= cfg.startMin ? cfg.startMin : cfg.endMin - cfg.slotMin;
        end = start + cfg.slotMin;
      }
      return [{ e, start, end }];
    })
    .sort((a, b) => a.start - b.start || b.end - a.end);

  const out: Placed[] = [];
  let cluster: Placed[] = [];
  let clusterEnd = -Infinity;
  const laneEnds: number[] = [];
  const flush = () => {
    const lanes = Math.max(1, laneEnds.length);
    for (const p of cluster) out.push({ ...p, lanes });
    cluster = [];
    laneEnds.length = 0;
  };
  for (const it of items) {
    if (it.start >= clusterEnd) {
      flush();
      clusterEnd = -Infinity;
    }
    let lane = laneEnds.findIndex((end) => end <= it.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(it.end);
    } else laneEnds[lane] = it.end;
    cluster.push({ ...it, lane, lanes: 1 });
    clusterEnd = Math.max(clusterEnd, it.end);
  }
  flush();
  return out;
}

/** "Sep 2026" banner text for a week, or null when no new month starts in it. */
function bannerFor(monday: string, index: number): string | null {
  if (index === 0) return monthName(monday, true);
  for (let i = 0; i < 7; i++) {
    const d = addDays(monday, i);
    if (d.endsWith("-01")) return monthName(d, true);
  }
  return null;
}

export function ExecWeeklyGridView({
  monday,
  events,
  markers,
  cfg,
  today,
  onPickEvent,
  onPickSlot,
  onPickMarker,
}: {
  /** The Monday of the first week shown. */
  monday: string;
  events: ExecEventRow[];
  markers: DayMarker[];
  cfg: GridConfig;
  today?: string;
  onPickEvent?: (event: ExecEventRow) => void;
  onPickSlot?: (day: string, startMin: number) => void;
  onPickMarker?: (marker: DayMarker) => void;
}) {
  const rows = slotMinutes(cfg);
  const height = rows.length * ROW_H;
  const cols = `${TIME_COL}px repeat(7, minmax(96px, 1fr))`;
  const weeks = Array.from({ length: GRID_WEEKS }, (_, i) => addDays(monday, 7 * i));

  const byDay = React.useMemo(() => {
    const m = new Map<string, ExecEventRow[]>();
    for (const e of events) m.set(e.day, [...(m.get(e.day) ?? []), e]);
    return m;
  }, [events]);
  const markerDays = React.useMemo(() => markersByDay(markers), [markers]);
  const topMin = (m: number) => ((m - cfg.startMin) / cfg.slotMin) * ROW_H;

  return (
    // Scrolls both ways (a sheet is wider than the pane), but only the
    // sideways overscroll is contained - at the bottom the wheel hands the page
    // back, so the box never traps it.
    <div className="max-h-[78vh] overflow-auto border border-hairline bg-white" style={{ overscrollBehaviorX: "contain" }}>
      <div style={{ minWidth: TIME_COL + 7 * 96 }}>
        {/* Day names, pinned while the weeks scroll under them. The height is
            STATED (HEAD_H) because each week's bar sticks directly beneath it —
            see the constant. */}
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
          const days = Array.from({ length: 7 }, (_, i) => addDays(wk, i));
          const banner = bannerFor(wk, wi);
          return (
            <section key={wk} aria-label={`Week ${isoWeek(wk).week}`}>
              {banner && (
                <div
                  className="border-t border-white/10 px-3 py-1.5 text-[13px] font-black uppercase tracking-wide text-white"
                  style={{ background: HEADER_BG }}
                >
                  {banner}
                </div>
              )}

              {/* The week's own dark row: number, dates, and each day's markers.
                  STICKY, directly under the column header.

                  It needs no scroll listener and no observer: a sticky element
                  is clipped by its PARENT, and each week is already its own
                  <section>. So week 36's bar pins at HEAD_H while week 36's body
                  is on screen, and the moment week 37's section arrives its bar
                  pushes week 36's out and takes the slot — the swap the browser
                  does for free, which is also why it cannot get stuck.

                  The month band above is deliberately NOT sticky: it renders on
                  some weeks and not others, so pinning it too would mean a
                  second offset that changes week to week. */}
              <div
                className="sticky z-20 grid border-t border-white/10 text-white"
                style={{ top: HEAD_H, gridTemplateColumns: cols, background: HEADER_BG }}
              >
                <div className="sticky left-0 z-10 flex items-center px-2 py-1.5 text-[11px] font-bold" style={{ background: HEADER_BG }}>
                  Week {isoWeek(wk).week}
                </div>
                {days.map((d) => {
                  const date = parseDay(d);
                  const isToday = d === today;
                  return (
                    <div key={d} className="min-w-0 border-l border-white/15 px-1.5 py-1.5">
                      <div
                        className="text-center text-[11px] font-bold tabular-nums"
                        style={isToday ? { color: "#FF6B6B" } : undefined}
                      >
                        {date.getUTCDate()} {MON_SHORT[date.getUTCMonth()]}
                      </div>
                      {(byDay.get(d) ?? [])
                        .filter((e) => e.allDay)
                        .map((e) => {
                          const cat = execCategory(e.categoryKey);
                          return (
                            <button
                              key={e.id}
                              type="button"
                              onClick={() => onPickEvent?.(e)}
                              title={`${e.title} · ${cat.label} · All day`}
                              className="mt-1 block w-full rounded-[3px] px-1 py-[1px] text-center text-[10.5px] font-bold leading-snug text-[#111]"
                              style={{ background: `color-mix(in srgb, ${cat.hex} 55%, white)`, cursor: onPickEvent ? "pointer" : "default" }}
                            >
                              {e.title}
                            </button>
                          );
                        })}
                      {(markerDays.get(d) ?? []).map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => onPickMarker?.(m)}
                          title={m.label}
                          className="mt-1 block w-full rounded-[3px] border border-white/40 px-1 py-[1px] text-center text-[10.5px] font-bold leading-snug text-white"
                          style={{ background: "rgba(255,255,255,0.12)", cursor: onPickMarker ? "pointer" : "default" }}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>

              {/* Half-hour rows. */}
              <div className="grid" style={{ gridTemplateColumns: cols }}>
                {/* z-10, lowered from z-20 when the week bar above became sticky
                    at z-20: this gutter is sticky horizontally and would
                    otherwise paint OVER the pinned week bar as it scrolled past.
                    Still above the event blocks, which sit at zIndex 1 + lane. */}
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
            </section>
          );
        })}
      </div>
    </div>
  );
}
