"use client";

/**
 * One day's column in a time-grid band. Draws the 30-min slot background
 * (solid hour lines, dotted half-hour lines), hosts the click-drag "create"
 * surface, and absolutely-positions this day's event blocks (overlap-split into
 * side-by-side columns). All-day events are rendered as banners by the band, not
 * here.
 */
import * as React from "react";
import type { CalendarEvent } from "@/lib/monthly-events/types";
import {
  DAY_START_MIN,
  DAY_END_MIN,
  SLOT_MIN,
  gridHeight,
  layoutDayEvents,
  topToMin,
} from "./geometry";
import { EventBlock } from "./event-block";
import type { CategoryMap } from "./model";
import { eventColor } from "./colors";

interface DayColumnProps {
  date: string;
  events: CalendarEvent[];
  catMap: CategoryMap;
  slotH: number;
  selectedIds: Set<string>;
  compact?: boolean;
  onMeasure: (width: number) => void;
  onSelect: (id: string, additive: boolean) => void;
  onContextMenu: (id: string, x: number, y: number) => void;
  onRename: (id: string, title: string) => void;
  onResize: (id: string, startMin: number, endMin: number) => void;
  onLockedInteract: (ev: CalendarEvent) => void;
  onCreateRange: (date: string, startMin: number, endMin: number) => void;
}

export function DayColumn({
  date,
  events,
  catMap,
  slotH,
  selectedIds,
  compact,
  onMeasure,
  onSelect,
  onContextMenu,
  onRename,
  onResize,
  onLockedInteract,
  onCreateRange,
}: DayColumnProps) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const [sel, setSel] = React.useState<{ top: number; height: number } | null>(null);
  const positioned = React.useMemo(
    () => layoutDayEvents(events, slotH),
    [events, slotH],
  );

  React.useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    onMeasure(el.getBoundingClientRect().width);
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) onMeasure(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [onMeasure]);

  const startCreate = (e: React.PointerEvent) => {
    // Only start from the empty background, never from an event block.
    if (e.target !== rootRef.current) return;
    if (e.button !== 0) return;
    const rect = rootRef.current!.getBoundingClientRect();
    const anchorMin = topToMin(e.clientY - rect.top, slotH);
    let curEnd = Math.min(DAY_END_MIN, anchorMin + SLOT_MIN);
    setSel({
      top: ((anchorMin - DAY_START_MIN) / SLOT_MIN) * slotH,
      height: ((curEnd - anchorMin) / SLOT_MIN) * slotH,
    });

    const move = (me: PointerEvent) => {
      const m = topToMin(me.clientY - rect.top, slotH);
      const lo = Math.min(anchorMin, m);
      const hi = Math.max(anchorMin, m);
      curEnd = Math.max(lo + SLOT_MIN, hi);
      setSel({
        top: ((lo - DAY_START_MIN) / SLOT_MIN) * slotH,
        height: ((curEnd - lo) / SLOT_MIN) * slotH,
      });
    };
    const up = (ue: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setSel(null);
      const m = topToMin(ue.clientY - rect.top, slotH);
      const lo = Math.min(anchorMin, m);
      const hi = Math.max(lo + SLOT_MIN, Math.max(anchorMin, m));
      onCreateRange(date, lo, hi);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div
      ref={rootRef}
      className="relative border-l border-hairline-strong"
      style={{
        height: gridHeight(slotH),
        // Solid full-hour lines + dotted half-hour lines.
        backgroundImage: `repeating-linear-gradient(to bottom, var(--hour-line, rgba(15,23,42,0.10)) 0, var(--hour-line, rgba(15,23,42,0.10)) 1px, transparent 1px, transparent ${
          slotH * 2
        }px), repeating-linear-gradient(to bottom, transparent 0, transparent ${
          slotH - 1
        }px, var(--half-line, rgba(15,23,42,0.05)) ${slotH - 1}px, var(--half-line, rgba(15,23,42,0.05)) ${slotH}px, transparent ${slotH}px, transparent ${
          slotH * 2
        }px)`,
      }}
      onPointerDown={startCreate}
    >
      {sel && (
        <div
          className="pointer-events-none absolute inset-x-0.5 rounded-md border-2 border-solid"
          style={{
            top: sel.top,
            height: sel.height,
            borderColor: "var(--color-altus-red, #c8102e)",
            background: "rgba(200,16,46,0.08)",
          }}
        />
      )}
      {positioned.map((p) => {
        const cat = p.ev.categoryId ? catMap.get(p.ev.categoryId) : undefined;
        return (
          <EventBlock
            key={p.ev.id}
            ev={p.ev}
            color={eventColor(p.ev.colorOverride, cat?.color)}
            catLabel={cat?.name ?? null}
            slotH={slotH}
            compact={compact}
            selected={selectedIds.has(p.ev.id)}
            pos={{
              top: p.top,
              height: p.height,
              leftPct: (p.col / p.cols) * 100,
              widthPct: (1 / p.cols) * 100,
            }}
            onSelect={onSelect}
            onContextMenu={onContextMenu}
            onRename={onRename}
            onResize={onResize}
            onLockedInteract={onLockedInteract}
          />
        );
      })}
    </div>
  );
}
