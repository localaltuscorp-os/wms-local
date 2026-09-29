"use client";

import * as React from "react";
import { categoryColors, execCategory } from "@/lib/exec-calendar/taxonomy";
import { execClient } from "@/lib/exec-calendar/clients";
import {
  addDays,
  isoWeek,
  laneDay,
  minToLabel,
  monthStart,
  parseDay,
  rangeLabel,
  slotMinutes,
  weekStart,
  type GridConfig,
} from "@/lib/exec-calendar/grid";
import { monthName } from "@/lib/exec-calendar/period";
import type { ExecEventRow } from "@/lib/queries/exec-calendar";
import { MARKER_BG, MARKER_FG, markersByDay, type DayMarker } from "@/lib/exec-calendar/day-markers";
import { useEventContextMenu } from "./event-context-menu";

/**
 * MONTHLY GRID (revamped 2026-09-26, then corrected same day) — the Weekly
 * Grid's own engine, over a ROLLING window: one week before `anchor`'s week,
 * that week, and four after — six weeks total, same count as Grid, just
 * centred differently. NOT bounded to a calendar month any more (that was
 * the first cut; scrapped the same day because "one week before the current
 * week... 4 weeks after" doesn't respect month boundaries at all) — so
 * `monthWeeks()` and its `inMonth` flag don't apply here, and every day
 * simply carries its own "31 Aug" / "1 Sep" label to stay unambiguous as the
 * window crosses a month line.
 *
 * THE STICKY MONTH TITLE (asked twice — it "still disappeared" the first
 * time): every week — not just the ones where a month starts — renders its
 * OWN sticky band naming the month it belongs to (by its Thursday, the same
 * "the day in the middle owns the week" rule the header numbering uses).
 * Because every week's `<section>` has one, the browser's native sticky
 * stacking swaps them for free as you scroll — the same trick the per-week
 * dark bar below it already relies on (see the comment down there). A
 * banner that only appeared on month-transition weeks (Weekly Grid's
 * approach) would vanish the moment you scrolled past that one week, which
 * is exactly the bug being fixed.
 */

const ROW_H = 22;
const TIME_COL = 64;
const MONTH_H = 26;
const HEAD_H = 30;
const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MON_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const HEADER_BG = "#6B7280";
const HEADER_BG_CURRENT = "var(--color-altus-red)";
const MONTH_BG = "#52525B";
const RULE = "#D3D3D3";

/** One week before, then five more — the -1/+4 window around `anchor`'s week. */
const WEEKS_BEFORE = 1;
const WEEKS_TOTAL = 6;

/** Which month a week "belongs to" for the sticky title — its Thursday's month. */
function owningMonth(monday: string): string {
  return monthStart(addDays(monday, 3));
}

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
  /** Any day in the reference week — the window runs from one week before it. */
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
  const firstMonday = addDays(weekStart(anchor), -7 * WEEKS_BEFORE);
  const weeks = Array.from({ length: WEEKS_TOTAL }, (_, i) => addDays(firstMonday, 7 * i));
  const { openMenu, node: contextMenuNode } = useEventContextMenu();
  const canEdit = !!onPickEvent;

  const byDay = React.useMemo(() => {
    const m = new Map<string, ExecEventRow[]>();
    for (const e of events) m.set(e.day, [...(m.get(e.day) ?? []), e]);
    return m;
  }, [events]);
  const markerDays = React.useMemo(() => markersByDay(markers), [markers]);
  const topMin = (m: number) => ((m - cfg.startMin) / cfg.slotMin) * ROW_H;

  // On the CURRENT week by default (asked 2026-09-28) — the window itself
  // already starts one week early (WEEKS_BEFORE), so without this the page
  // opens showing last week first, with the highlighted current week
  // scrolled halfway off the bottom. Sets scrollTop directly on THIS
  // component's own scroll box rather than `scrollIntoView` — that walks up
  // every scrollable ancestor, which also dragged the outer page down and
  // hid the toolbar above it. Mount-only ([]): a later prev/next click is
  // the user deliberately looking elsewhere, and should stay put.
  const scrollBoxRef = React.useRef<HTMLDivElement>(null);
  const currentWeekRef = React.useRef<HTMLElement | null>(null);
  React.useEffect(() => {
    const box = scrollBoxRef.current;
    const wk = currentWeekRef.current;
    if (box && wk) {
      // getBoundingClientRect(), not offsetTop: offsetTop is relative to the
      // nearest POSITIONED ancestor, which here is neither `box` nor
      // predictable — it overshot into the middle of the week below.
      box.scrollTop += wk.getBoundingClientRect().top - box.getBoundingClientRect().top;
    }
  }, []);

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
          const days = Array.from({ length: 7 }, (_, i) => addDays(wk, i));
          const isCurrentWeek = !!today && days.includes(today);
          const weekBg = isCurrentWeek ? HEADER_BG_CURRENT : HEADER_BG;
          return (
            <section key={`${wk}-${wi}`} ref={isCurrentWeek ? currentWeekRef : undefined} aria-label={`Week of ${wk}`}>
              {/* Every week has one — see the file-level comment on why that,
                  and not "only when the month changes", is what stays visible. */}
              <div
                className="sticky top-0 z-40 flex items-center px-3 text-[12px] font-black uppercase tracking-wide text-white"
                style={{ background: MONTH_BG, height: MONTH_H }}
              >
                {monthName(owningMonth(wk), true)}
              </div>

              <div
                className="sticky z-20 grid border-t border-white/10 text-white"
                style={{ top: MONTH_H, gridTemplateColumns: cols, background: weekBg }}
              >
                <div className="sticky left-0 z-10 flex items-center px-2 py-1.5 text-[11px] font-bold" style={{ background: weekBg }}>
                  Week {isoWeek(wk).week}
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
            </section>
          );
        })}
      </div>
      {contextMenuNode}
    </div>
  );
}
