"use client";

/**
 * A single coloured event block on the time-grid (design §3/§5).
 *
 * - Confirmed = solid fill; Tentative = diagonal-hatch fill + dashed border +
 *   "TENT" chip (colour-independent status cue).
 * - dnd-kit draggable (move); top/bottom pointer handles resize in 30-min steps.
 * - Double-click → inline title edit. Right-click → context menu. Click/⌘-click
 *   → (multi)select. Locked (holiday/batch) blocks show a lock and refuse drag.
 * - Location shows a pin. Text colour auto-picked by luminance for contrast.
 */
import * as React from "react";
import { useDraggable } from "@dnd-kit/core";
import { Lock, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CalendarEvent } from "@/lib/monthly-events/types";
import { minToLabel } from "@/lib/monthly-events/types";
import {
  DAY_START_MIN,
  DAY_END_MIN,
  SLOT_MIN,
} from "./geometry";
import { readableTextColor, borderColor } from "./colors";

export interface BlockPosition {
  top: number;
  height: number;
  leftPct: number;
  widthPct: number;
}

interface EventBlockProps {
  ev: CalendarEvent;
  color: string;
  catLabel: string | null;
  pos: BlockPosition;
  slotH: number;
  selected: boolean;
  compact?: boolean;
  onSelect: (id: string, additive: boolean) => void;
  onContextMenu: (id: string, x: number, y: number) => void;
  onRename: (id: string, title: string) => void;
  onResize: (id: string, startMin: number, endMin: number) => void;
  onLockedInteract: (ev: CalendarEvent) => void;
}

export function EventBlock({
  ev,
  color,
  catLabel,
  pos,
  slotH,
  selected,
  compact,
  onSelect,
  onContextMenu,
  onRename,
  onResize,
  onLockedInteract,
}: EventBlockProps) {
  const tentative = ev.status === "tentative";
  const textColor = readableTextColor(color);
  const [editing, setEditing] = React.useState(false);
  const [draftTitle, setDraftTitle] = React.useState(ev.title);
  const [resizeDelta, setResizeDelta] = React.useState<{ top: number; bottom: number }>(
    { top: 0, bottom: 0 },
  );

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: ev.id,
    disabled: ev.isLocked || editing,
    data: { type: "event", event: ev },
  });

  React.useEffect(() => setDraftTitle(ev.title), [ev.title]);

  // ── Pointer-based resize (top/bottom handles) ──────────────────────────────
  const startResize = (edge: "top" | "bottom") => (e: React.PointerEvent) => {
    if (ev.isLocked || ev.allDay || ev.startMin == null || ev.endMin == null) return;
    e.preventDefault();
    e.stopPropagation();
    const startY = e.clientY;
    const origStart = ev.startMin;
    const origEnd = ev.endMin;

    const move = (me: PointerEvent) => {
      const deltaMin = Math.round((me.clientY - startY) / slotH) * SLOT_MIN;
      if (edge === "top") {
        const newStart = Math.max(
          DAY_START_MIN,
          Math.min(origEnd - SLOT_MIN, origStart + deltaMin),
        );
        setResizeDelta({ top: ((newStart - origStart) / SLOT_MIN) * slotH, bottom: 0 });
      } else {
        const newEnd = Math.max(
          origStart + SLOT_MIN,
          Math.min(DAY_END_MIN, origEnd + deltaMin),
        );
        setResizeDelta({ top: 0, bottom: ((newEnd - origEnd) / SLOT_MIN) * slotH });
      }
    };
    const up = (ue: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setResizeDelta({ top: 0, bottom: 0 });
      const deltaMin = Math.round((ue.clientY - startY) / slotH) * SLOT_MIN;
      if (deltaMin === 0) return;
      if (edge === "top") {
        const newStart = Math.max(
          DAY_START_MIN,
          Math.min(origEnd - SLOT_MIN, origStart + deltaMin),
        );
        if (newStart !== origStart) onResize(ev.id, newStart, origEnd);
      } else {
        const newEnd = Math.max(
          origStart + SLOT_MIN,
          Math.min(DAY_END_MIN, origEnd + deltaMin),
        );
        if (newEnd !== origEnd) onResize(ev.id, origStart, newEnd);
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const commitRename = () => {
    setEditing(false);
    const t = draftTitle.trim();
    if (t && t !== ev.title) onRename(ev.id, t);
    else setDraftTitle(ev.title);
  };

  const dragStyle = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  const timeLabel =
    ev.startMin != null && ev.endMin != null
      ? `${minToLabel(ev.startMin)} – ${minToLabel(ev.endMin)}`
      : "";

  return (
    <div
      ref={setNodeRef}
      aria-label={`${ev.title}${timeLabel ? `, ${timeLabel}` : ""}${
        tentative ? ", tentative" : ""
      }${ev.isLocked ? ", locked" : ""}`}
      className={cn(
        "group absolute overflow-hidden rounded-md px-1.5 py-0.5 text-left transition-shadow",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
        isDragging && "opacity-70 shadow-lg",
        selected && "ring-2 ring-offset-1",
      )}
      style={{
        top: pos.top + resizeDelta.top,
        height: Math.max(slotH - 2, pos.height - resizeDelta.top + resizeDelta.bottom),
        left: `calc(${pos.leftPct}% + 1px)`,
        width: `calc(${pos.widthPct}% - 3px)`,
        background: tentative
          ? `repeating-linear-gradient(45deg, ${color}, ${color} 6px, ${color}bf 6px, ${color}bf 12px)`
          : color,
        color: textColor,
        border: `1.5px ${tentative ? "dashed" : "solid"} ${borderColor(color)}`,
        cursor: ev.isLocked ? "not-allowed" : "grab",
        ...dragStyle,
      }}
      {...(ev.isLocked ? {} : listeners)}
      {...attributes}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(ev.id, e.metaKey || e.ctrlKey);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (ev.isLocked) return onLockedInteract(ev);
        setEditing(true);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onSelect(ev.id, false);
        onContextMenu(ev.id, e.clientX, e.clientY);
      }}
    >
      {/* resize handles (hidden for locked/all-day) */}
      {!ev.isLocked && !ev.allDay && (
        <>
          <div
            role="separator"
            aria-label="Resize start"
            onPointerDown={startResize("top")}
            className="absolute inset-x-0 top-0 h-1.5 cursor-ns-resize opacity-0 group-hover:opacity-100"
          />
          <div
            role="separator"
            aria-label="Resize end"
            onPointerDown={startResize("bottom")}
            className="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize opacity-0 group-hover:opacity-100"
          />
        </>
      )}

      <div className="flex items-start gap-1">
        {ev.isLocked && <Lock size={10} className="mt-[2px] shrink-0 opacity-80" />}
        {editing ? (
          <input
            autoFocus
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") {
                setEditing(false);
                setDraftTitle(ev.title);
              }
              e.stopPropagation();
            }}
            className="w-full rounded-sm bg-white/85 px-1 text-[11px] font-semibold text-ink-strong outline-none"
          />
        ) : (
          <span className="min-w-0 flex-1 truncate text-[11px] font-semibold leading-tight">
            {ev.title}
          </span>
        )}
        {tentative && (
          <span
            className="shrink-0 rounded-[3px] bg-black/25 px-1 text-[8px] font-bold uppercase leading-[1.4] tracking-wide"
            style={{ color: textColor }}
          >
            TENT
          </span>
        )}
      </div>

      {!compact && pos.height > slotH * 1.4 && (
        <div className="mt-0.5 space-y-0.5 text-[9.5px] leading-tight opacity-90">
          {timeLabel && <div className="truncate">{timeLabel}</div>}
          {ev.location && (
            <div className="flex items-center gap-0.5 truncate">
              <MapPin size={9} className="shrink-0" />
              <span className="truncate">{ev.location}</span>
            </div>
          )}
          {catLabel && <div className="truncate opacity-75">{catLabel}</div>}
        </div>
      )}
    </div>
  );
}
