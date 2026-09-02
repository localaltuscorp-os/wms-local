/**
 * Slot geometry + overlap layout for the time-grid (design §2/§3).
 *
 * The grid is a fixed set of 30-min rows (07:00→21:00, SLOTS_PER_DAY) whose
 * pixel height per slot (`slotH`) varies by view. Events are positioned by
 * converting their minute range into top/height, and time-overlapping events in
 * the same day are split into side-by-side columns like Google Calendar.
 */
import {
  DAY_START_MIN,
  DAY_END_MIN,
  SLOT_MIN,
  SLOTS_PER_DAY,
} from "@/lib/monthly-events/types";
import type { CalendarEvent } from "@/lib/monthly-events/types";

export { DAY_START_MIN, DAY_END_MIN, SLOT_MIN, SLOTS_PER_DAY };

/** Total grid pixel height for a given slot height. */
export function gridHeight(slotH: number): number {
  return SLOTS_PER_DAY * slotH;
}

/** Clamp a minute value into the visible [DAY_START_MIN, DAY_END_MIN] window. */
export function clampMin(min: number): number {
  return Math.max(DAY_START_MIN, Math.min(DAY_END_MIN, min));
}

/** Pixel offset from the top of the grid for a minutes-from-midnight value. */
export function minToTop(min: number, slotH: number): number {
  return ((clampMin(min) - DAY_START_MIN) / SLOT_MIN) * slotH;
}

/** Round an arbitrary minute value to the nearest 30-min slot boundary. */
export function snapMin(min: number): number {
  return Math.round(min / SLOT_MIN) * SLOT_MIN;
}

/** Convert a pixel Y within the grid to a snapped minutes-from-midnight value. */
export function topToMin(top: number, slotH: number): number {
  const raw = DAY_START_MIN + (top / slotH) * SLOT_MIN;
  return clampMin(snapMin(raw));
}

export interface PositionedEvent {
  ev: CalendarEvent;
  /** 0-based column index within its overlap cluster. */
  col: number;
  /** Total columns in the cluster (width = 1 / cols). */
  cols: number;
  top: number;
  height: number;
}

/**
 * Lay out one day's timed events into side-by-side columns. Events sharing any
 * minute overlap the same cluster; each is assigned the first free column, and
 * the cluster's column count fixes every member's width. All-day events are
 * excluded (rendered as banners elsewhere).
 */
export function layoutDayEvents(
  events: CalendarEvent[],
  slotH: number,
): PositionedEvent[] {
  const timed = events
    .filter((e) => !e.allDay && e.startMin != null && e.endMin != null)
    .slice()
    .sort((a, b) => {
      const sa = a.startMin ?? 0;
      const sb = b.startMin ?? 0;
      if (sa !== sb) return sa - sb;
      return (b.endMin ?? 0) - b.startMin! - ((a.endMin ?? 0) - a.startMin!);
    });

  const out: PositionedEvent[] = [];
  let cluster: CalendarEvent[] = [];
  let clusterEnd = -1;

  const flush = () => {
    if (cluster.length === 0) return;
    // Greedy column assignment within the cluster.
    const colEnds: number[] = []; // end-min occupying each column
    const assigned = cluster.map((ev) => {
      const start = ev.startMin!;
      let col = colEnds.findIndex((end) => end <= start);
      if (col === -1) {
        col = colEnds.length;
        colEnds.push(ev.endMin!);
      } else {
        colEnds[col] = ev.endMin!;
      }
      return { ev, col };
    });
    const cols = colEnds.length;
    for (const { ev, col } of assigned) {
      const top = minToTop(ev.startMin!, slotH);
      const bottom = minToTop(ev.endMin!, slotH);
      out.push({ ev, col, cols, top, height: Math.max(slotH - 2, bottom - top) });
    }
    cluster = [];
    clusterEnd = -1;
  };

  for (const ev of timed) {
    if (cluster.length > 0 && ev.startMin! >= clusterEnd) flush();
    cluster.push(ev);
    clusterEnd = Math.max(clusterEnd, ev.endMin!);
  }
  flush();
  return out;
}
