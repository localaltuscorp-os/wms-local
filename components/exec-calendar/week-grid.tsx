"use client";

import { categoryColors, execCategory } from "@/lib/exec-calendar/taxonomy";
import {
  durationLabel,
  gridHeight,
  isoWeekLabel,
  layoutDay,
  minToLabel,
  minToTop,
  parseDay,
  rangeLabel,
  slotMinutes,
  type GridConfig,
} from "@/lib/exec-calendar/grid";
import * as React from "react";
import { snapToSlot, topToMin } from "@/lib/exec-calendar/grid";
import { ExecHoverCard } from "./hover-card";
import { execClient } from "@/lib/exec-calendar/clients";
import { MARKER_BG, MARKER_FG, markerSpan, markersByDay, type DayMarker } from "@/lib/exec-calendar/day-markers";
import type { ExecEventRow } from "@/lib/queries/exec-calendar";

/**
 * Week-at-a-glance (§2A view 2, §4C, §6).
 *
 * Monday→Sunday, the configured window only, and one absolutely-positioned card
 * per block so a 15:00–20:00 cohort is a single five-hour card with its span
 * printed on it — not ten stacked cells. Overlapping blocks split into columns,
 * because a double booking has to be visible to be fixed.
 *
 * ALL-DAY BLOCKS ARE DRAWN IN THE TIMELINE, the full height of the window, and
 * take part in the overlap layout like any other block (2026-09-18, Google
 * Calendar's behaviour) - timed blocks nest on top of them instead of the
 * all-day one being tucked into a strip above. The strip above the grid now
 * belongs to Day Markers.
 *
 * Untimed blocks — a cell in the old sheet that never got a clock — are listed
 * under the grid instead of being dropped, so importing a decade of rows never
 * silently loses one.
 */

const SLOT_H = 26;
const HOUR_LABEL_EVERY = 60;
/** How far each cascade level is indented, in px (Google uses about this). */
const NEST_INDENT = 10;
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

interface Props {
  /**
   * The columns to draw. Seven for a week, one for a day — the day view is this
   * same grid with a narrower list, rather than a second component that would
   * drift from it.
   */
  days: string[];
  events: ExecEventRow[];
  cfg: GridConfig;
  today?: string;
  /** Click a block to edit it. */
  onPickEvent?: (event: ExecEventRow) => void;
  /** Click empty grid to create one at that day and snapped minute. */
  onPickSlot?: (day: string, startMin: number) => void;
  /**
   * Drag finished: the block moved to `day`/`startMin`, keeping its length, or
   * was resized to a new `endMin`. The grid does not persist anything itself —
   * it reports, the workspace saves, so the optimistic state and the write live
   * in one place.
   */
  onMove?: (event: ExecEventRow, day: string, startMin: number, endMin: number) => void;
  /** Clicking the date in a column header opens that single day. */
  onPickDay?: (day: string) => void;
  /** Day Markers on these days, drawn in the strip under the headers. */
  markers?: DayMarker[];
  onPickMarker?: (marker: DayMarker) => void;
}

export function ExecWeekGrid({ days, events, cfg, today, onPickEvent, onPickSlot, onMove, onPickDay, markers = [], onPickMarker }: Props) {
  const markerDays = markersByDay(markers);
  /** The block under the cursor, and where to put its quick-card (§6). */
  const [hover, setHover] = React.useState<{ event: ExecEventRow; x: number; y: number } | null>(null);
  /**
   * An in-progress drag. `kind` separates moving the whole block from dragging
   * its bottom edge; `preview` is what the grid draws while the pointer is
   * down, so the block follows the cursor instead of jumping on release.
   */
  const [drag, setDrag] = React.useState<{
    id: string;
    kind: "move" | "resize";
    event: ExecEventRow;
    preview: { day: string; startMin: number; endMin: number };
  } | null>(null);

  const dragRef = React.useRef(drag);
  dragRef.current = drag;

  // Pointer handlers live on the WINDOW while a drag is live, not on the block:
  // the cursor routinely leaves the block it is dragging (that is the point of
  // dragging), and a handler bound to the block would drop the gesture there.
  React.useEffect(() => {
    if (!drag) return;
    const onUp = () => {
      const d = dragRef.current;
      setDrag(null);
      if (!d) return;
      const { day, startMin, endMin } = d.preview;
      const same = day === d.event.day && startMin === d.event.startMin && endMin === d.event.endMin;
      if (!same) onMove?.(d.event, day, startMin, endMin);
    };
    window.addEventListener("pointerup", onUp);
    return () => window.removeEventListener("pointerup", onUp);
  }, [drag, onMove]);
  const height = gridHeight(cfg, SLOT_H);
  const rows = slotMinutes(cfg);

  const byDay = new Map<string, ExecEventRow[]>();
  for (const e of events) {
    const list = byDay.get(e.day) ?? [];
    list.push(e);
    byDay.set(e.day, list);
  }

  const untimed = events.filter((e) => !e.allDay && (e.startMin == null || e.endMin == null));

  return (
    <div className="overflow-hidden border border-hairline bg-surface-card">
      {/* Day headers — the ISO week number sits in the gutter, as it does on the sheet. */}
      <div className="grid border-b border-hairline" style={{ gridTemplateColumns: `60px repeat(${days.length}, minmax(0, 1fr))` }}>
        <div className="flex items-end justify-center px-1 pb-1.5 pt-2 text-center text-[10px] font-bold uppercase leading-tight text-ink-subtle">
          {days[0] ? isoWeekLabel(days[0]).replace("Week No", "Wk") : ""}
        </div>
        {days.map((d) => {
          const date = parseDay(d);
          const isToday = d === today;
          return (
            <div
              key={d}
              className="border-l border-hairline px-2 py-1.5 text-center"
              style={isToday ? { background: "var(--color-altus-red-wash)" } : undefined}
            >
              <div className="text-[10.5px] font-bold uppercase tracking-wide text-ink-subtle">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][(date.getUTCDay() + 6) % 7]}
              </div>
              {/* "18 - SEP - 2026" (asked 2026-09-18). Two unbreakable halves, so a
                  narrow column (week view with the sidebar open) wraps the year
                  onto a second line instead of splitting mid-word. */}
              <button
                type="button"
                onClick={() => onPickDay?.(d)}
                className={`inline-flex max-w-full flex-wrap justify-center gap-x-1 text-[11.5px] font-bold leading-tight tabular-nums transition hover:underline ${isToday ? "text-[var(--color-altus-red)]" : "text-ink-strong"}`}
                title="Open this day"
              >
                <span className="whitespace-nowrap">
                  {String(date.getUTCDate()).padStart(2, "0")} - {MONTHS[date.getUTCMonth()]}
                </span>
                <span className="whitespace-nowrap">- {date.getUTCFullYear()}</span>
              </button>
            </div>
          );
        })}
      </div>

      {/* DAY MARKERS - "Final exam", "Exam week" - in the strip the all-day
          blocks used to occupy. Only drawn when a day on show has one. */}
      {days.some((d) => (markerDays.get(d)?.length ?? 0) > 0) && (
        <div className="grid border-b border-hairline bg-surface-soft" style={{ gridTemplateColumns: `60px repeat(${days.length}, minmax(0, 1fr))` }}>
          <div className="px-1 py-1.5 text-right text-[9.5px] font-bold uppercase leading-tight text-ink-subtle">Day marker</div>
          {days.map((d) => (
            <div key={d} className="min-h-[26px] min-w-0 space-y-1 border-l border-hairline p-1">
              {(markerDays.get(d) ?? []).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onPickMarker?.(m)}
                  className="block w-full truncate rounded-[5px] px-1.5 py-[3px] text-left text-[11px] font-bold"
                  style={{ background: MARKER_BG, color: MARKER_FG, cursor: onPickMarker ? "pointer" : "default" }}
                  title={`${m.label} · ${markerSpan(m)}`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* The grid itself. */}
      <div className="grid" style={{ gridTemplateColumns: `60px repeat(${days.length}, minmax(0, 1fr))` }}>
        <div className="relative" style={{ height }}>
          {rows.map((m, i) =>
            m % HOUR_LABEL_EVERY === 0 || i === 0 ? (
              <div
                key={m}
                className={`absolute right-1.5 text-[10.5px] font-medium text-ink-subtle ${i === 0 ? "translate-y-0.5" : "-translate-y-1/2"}`}
                style={{ top: minToTop(m, cfg, SLOT_H) }}
              >
                {minToLabel(m)}
              </div>
            ) : null,
          )}
        </div>

        {days.map((d) => {
          // All-day blocks are laid out as the whole window, so they fill the
          // column and timed blocks cascade onto them.
          const placed = layoutDay(
            (byDay.get(d) ?? []).flatMap((e) =>
              e.allDay
                ? [{ ...e, startMin: cfg.startMin, endMin: cfg.endMin }]
                : e.startMin != null && e.endMin != null
                  ? [{ ...e, startMin: e.startMin, endMin: e.endMin }]
                  : [],
            ),
            cfg,
            SLOT_H,
          );
          return (
            <div
              key={d}
              className="relative border-l border-hairline"
              style={{ height, cursor: onPickSlot ? "copy" : undefined }}
              onPointerMove={(ev) => {
                const d0 = dragRef.current;
                if (!d0) return;
                const y = ev.clientY - ev.currentTarget.getBoundingClientRect().top;
                const minute = topToMin(y, cfg, SLOT_H);
                setDrag((p) => {
                  if (!p) return p;
                  if (p.kind === "resize") {
                    // Never let the end cross the start: one slot is the floor.
                    const end = Math.max(p.preview.startMin + cfg.slotMin, snapToSlot(minute, cfg));
                    return { ...p, preview: { ...p.preview, endMin: end } };
                  }
                  const length = (p.event.endMin ?? 0) - (p.event.startMin ?? 0);
                  return { ...p, preview: { day: d, startMin: minute, endMin: minute + length } };
                });
              }}
              onClick={(ev) => {
                if (!onPickSlot) return;
                // Only a click on the column ITSELF — a click that landed on a
                // block has already been handled by that block's button.
                if (ev.target !== ev.currentTarget) return;
                const y = ev.clientY - ev.currentTarget.getBoundingClientRect().top;
                onPickSlot(d, topToMin(y, cfg, SLOT_H));
              }}
            >
              {rows.map((m) => (
                <div
                  key={m}
                  className="absolute inset-x-0 border-t"
                  style={{
                    top: minToTop(m, cfg, SLOT_H),
                    borderColor: m % HOUR_LABEL_EVERY === 0 ? "var(--color-hairline)" : "var(--color-hairline-soft, rgba(0,0,0,0.04))",
                  }}
                />
              ))}

              {drag && drag.preview.day === d && (
                <div
                  className="pointer-events-none absolute inset-x-[2px] z-[1000] rounded-[6px] border-2 border-dashed"
                  style={{
                    top: minToTop(drag.preview.startMin, cfg, SLOT_H),
                    height: Math.max(
                      SLOT_H / 2,
                      minToTop(drag.preview.endMin, cfg, SLOT_H) - minToTop(drag.preview.startMin, cfg, SLOT_H),
                    ),
                    borderColor: categoryColors(drag.event.categoryKey).base,
                    background: categoryColors(drag.event.categoryKey).bg,
                  }}
                >
                  <div className="px-1.5 py-1 text-[10.5px] font-bold" style={{ color: categoryColors(drag.event.categoryKey).deep }}>
                    {rangeLabel(drag.preview.startMin, drag.preview.endMin)}
                  </div>
                </div>
              )}

              {placed.map((p) => {
                const e = p.event;
                const dragging = drag?.id === e.id;
                const cat = execCategory(e.categoryKey);
                const col = categoryColors(e.categoryKey);
                // Column + span across the cluster, less the cascade indent.
                const indent = Math.min(p.depth, 4) * NEST_INDENT;
                const left = `calc(${(100 / p.columns) * p.column}% + ${2 + indent}px)`;
                const width = `calc(${(100 / p.columns) * p.span}% - ${3 + indent}px)`;
                const timed = !e.allDay && e.startMin != null && e.endMin != null;
                const when = e.allDay ? "All day" : rangeLabel(e.startMin!, e.endMin!);
                return (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => { if (!dragging) onPickEvent?.(e); }}
                    onPointerEnter={(ev) => !dragRef.current && setHover({ event: e, x: ev.clientX, y: ev.clientY })}
                    onPointerMove={(ev) => !dragRef.current && setHover({ event: e, x: ev.clientX, y: ev.clientY })}
                    onPointerLeave={() => setHover(null)}
                    onPointerDown={(ev) => {
                      if (!onMove || !timed || p.pinned) return;
                      // The bottom 7px is the resize grip; anywhere else moves it.
                      const box = ev.currentTarget.getBoundingClientRect();
                      const kind = ev.clientY > box.bottom - 7 ? "resize" : "move";
                      setHover(null);
                      setDrag({
                        id: e.id,
                        kind,
                        event: e,
                        preview: { day: e.day, startMin: e.startMin!, endMin: e.endMin! },
                      });
                    }}
                    // Content from the TOP, as in Google - a <button> centres it by default,
                    // which put a tall block's title halfway down it.
                    className="absolute flex flex-col justify-start overflow-hidden rounded-[6px] px-1.5 py-1 text-left transition hover:brightness-95"
                    style={{
                      top: p.top,
                      height: p.height,
                      cursor: onMove && timed && !p.pinned ? "grab" : "pointer",
                      opacity: dragging ? 0.45 : 1,
                      left,
                      width,
                      zIndex: 1 + p.z,
                      background: col.bg,
                      borderLeft: `3px solid ${col.base}`,
                      // A block over another gets a ring in the page colour, as in
                      // Google, so its edge reads against the block beneath.
                      boxShadow: p.depth > 0 || p.column > 0
                        ? "0 0 0 1px var(--color-surface-card), 0 2px 6px rgba(16,24,40,0.12)"
                        : "0 1px 2px rgba(16,24,40,0.06)",
                    }}
                    title={`${e.title} · ${cat.label}${e.clientName ? ` · ${e.clientName}` : ""}\n${when}${timed ? ` (${durationLabel(e.endMin! - e.startMin!)})` : ""}${p.pinned ? ` - ${p.pinned} the calendar's hours` : ""}${e.notes ? `\n${e.notes}` : ""}`}
                  >
                    <div className="truncate text-[11.5px] font-bold leading-tight" style={{ color: col.deep }}>
                      {e.title}
                    </div>
                    {p.height > 34 && (
                      <div className="truncate text-[10px] leading-tight text-ink-muted">
                        {p.pinned ? `${p.pinned === "before" ? "↑" : "↓"} ${when}` : when}
                      </div>
                    )}
                    {p.height > 52 && e.clientName && (
                      <div className="flex min-w-0 items-center gap-1 text-[10px] font-semibold leading-tight" style={{ color: col.deep }}>
                        {/* The client's own colour, as a dot beside its name. */}
                        {execClient(e.clientKey) && (
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: execClient(e.clientKey)!.hex, boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.18)" }} />
                        )}
                        <span className="truncate">{e.clientName}</span>
                      </div>
                    )}
                    {p.height > 70 && e.location && (
                      <div className="truncate text-[10px] leading-tight text-ink-muted">{e.location}</div>
                    )}
                    {onMove && timed && !p.pinned && (
                      <span
                        className="absolute inset-x-0 bottom-0 h-[7px]"
                        style={{ cursor: "ns-resize" }}
                        aria-hidden
                      />
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      {hover && !drag && <ExecHoverCard event={hover.event} x={hover.x} y={hover.y} />}

      {untimed.length > 0 && (
        <div className="border-t border-hairline bg-surface-soft px-3 py-2">
          <span className="text-[10.5px] font-bold uppercase tracking-wide text-ink-subtle">
            No time set
          </span>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {untimed.map((e) => {
              const col = categoryColors(e.categoryKey);
              return (
                <span
                  key={e.id}
                  className="rounded-pill px-2 py-[3px] text-[11px] font-semibold"
                  style={{ background: col.bg, color: col.deep }}
                >
                  {e.title}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
