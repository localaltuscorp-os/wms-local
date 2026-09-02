"use client";

/**
 * Full-width all-day banner (holidays + all-day events) shown atop each day
 * column (design §2). Locked holiday banners show a lock; selecting / right-
 * clicking behaves like a timed block but there is no drag/resize.
 */
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CalendarEvent } from "@/lib/monthly-events/types";
import type { CategoryMap } from "./model";
import { eventColor, readableTextColor, borderColor } from "./colors";

interface AllDayBannerProps {
  ev: CalendarEvent;
  catMap: CategoryMap;
  selected: boolean;
  onSelect: (id: string, additive: boolean) => void;
  onContextMenu: (id: string, x: number, y: number) => void;
  onOpenEditor: (ev: CalendarEvent) => void;
  onLockedInteract: (ev: CalendarEvent) => void;
}

export function AllDayBanner({
  ev,
  catMap,
  selected,
  onSelect,
  onContextMenu,
  onOpenEditor,
  onLockedInteract,
}: AllDayBannerProps) {
  const cat = ev.categoryId ? catMap.get(ev.categoryId) : undefined;
  const color = eventColor(ev.colorOverride, cat?.color ?? "#c8102e");
  const textColor = readableTextColor(color);
  const tentative = ev.status === "tentative";

  return (
    <button
      type="button"
      aria-label={`${ev.title}, all day${ev.isLocked ? ", locked" : ""}`}
      className={cn(
        "flex w-full items-center gap-1 truncate rounded px-1.5 py-0.5 text-left text-[10.5px] font-semibold",
        selected && "ring-2 ring-offset-1",
      )}
      style={{
        background: tentative
          ? `repeating-linear-gradient(45deg, ${color}, ${color} 6px, ${color}bf 6px, ${color}bf 12px)`
          : color,
        color: textColor,
        border: `1px ${tentative ? "dashed" : "solid"} ${borderColor(color)}`,
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(ev.id, e.metaKey || e.ctrlKey);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (ev.isLocked) onLockedInteract(ev);
        else onOpenEditor(ev);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onSelect(ev.id, false);
        onContextMenu(ev.id, e.clientX, e.clientY);
      }}
    >
      {ev.isLocked && <Lock size={9} className="shrink-0 opacity-80" />}
      <span className="truncate">{ev.title}</span>
    </button>
  );
}
