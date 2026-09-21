"use client";

import { MapPin } from "lucide-react";
import { categoryColors, execCategory } from "@/lib/exec-calendar/taxonomy";
import { execClient } from "@/lib/exec-calendar/clients";
import { durationLabel, rangeLabel } from "@/lib/exec-calendar/grid";
import type { ExecEventRow } from "@/lib/queries/exec-calendar";

/**
 * The hover quick-card (§6): title, category, duration, client, notes.
 *
 * WHY IT EXISTS AT ALL. At week density a block is ~26px per half hour, so a
 * one-hour call shows a title and, if it is lucky, its times. Everything else —
 * which client, what the note says — is invisible until you open the drawer,
 * and opening a drawer to answer "who is that with" is too much ceremony for
 * the question. This is the read; the drawer is the write.
 *
 * POSITIONED BY THE CALLER, not by a portal library: the grid already knows
 * where the block is, and a floating-UI dependency for one tooltip would be a
 * lot of machinery for a box. It flips to the left of the cursor near the right
 * edge so the card never falls off the last day column, which at Sunday 20:00 is
 * exactly where it would otherwise land.
 */
export function ExecHoverCard({
  event,
  x,
  y,
}: {
  event: ExecEventRow;
  x: number;
  y: number;
}) {
  const cat = execCategory(event.categoryKey);
  const col = categoryColors(event.categoryKey);
  const flip = typeof window !== "undefined" && x > window.innerWidth - 300;

  return (
    <div
      className="pointer-events-none fixed z-[60] w-[260px] rounded-xl border border-hairline bg-surface-card p-3 shadow-xl"
      style={{ left: flip ? x - 272 : x + 12, top: Math.max(8, y - 12) }}
      role="tooltip"
    >
      <div className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: col.base }} />
        <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: col.deep }}>
          {cat.label}
        </span>
        {cat.protected && (
          <span
            className="rounded-pill px-1.5 py-[1px] text-[9.5px] font-bold uppercase"
            style={{ background: col.bg, color: col.deep }}
          >
            protected
          </span>
        )}
      </div>

      <div className="mt-1 text-[13.5px] font-bold leading-snug text-ink-strong">{event.title}</div>

      <div className="mt-1 text-[12px] text-ink-muted">
        {event.allDay
          ? "All day"
          : event.startMin != null && event.endMin != null
            ? `${rangeLabel(event.startMin, event.endMin)} · ${durationLabel(event.endMin - event.startMin)}`
            : "No time set"}
      </div>

      {event.clientName && (
        <div className="mt-1.5 flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: col.deep }}>
          {execClient(event.clientKey) && (
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: execClient(event.clientKey)!.hex, boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.15)" }} />
          )}
          {event.clientName}
        </div>
      )}
      {event.batchLabel && (
        <div className="mt-1.5 text-[12px] font-semibold" style={{ color: col.deep }}>
          {event.batchLabel}
        </div>
      )}
      {event.location && (
        <div className="mt-1 flex items-center gap-1 text-[11.5px] text-ink-muted">
          <MapPin size={12} className="shrink-0" /> {event.location}
        </div>
      )}
      {event.notes && (
        <p className="mt-1.5 line-clamp-3 text-[11.5px] leading-snug text-ink-muted">{event.notes}</p>
      )}

    </div>
  );
}
