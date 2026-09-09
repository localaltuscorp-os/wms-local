import {
  CalendarDays,
  Palette,
  CalendarClock,
  Gauge,
  type LucideIcon,
} from "lucide-react";

/**
 * Data-driven registry for the Monthly Events Master sub-hub (`/events`).
 * Reorder/add sections by editing this one array — the sub-hub landing reads
 * from it. `adminOnly` cards are hidden from non-admin viewers.
 */
export interface EventsSection {
  /** URL slug → /events/<slug> */
  slug: string;
  /** Display order on the sub-hub. */
  order: number;
  title: string;
  blurb: string;
  Icon: LucideIcon;
  /** Restricted to admins within the module (masters / batches / obligations).
   *  The calendar is open to any module viewer. */
  adminOnly?: boolean;
}

export const EVENTS_SECTIONS: EventsSection[] = [
  {
    slug: "calendar",
    order: 1,
    title: "The Calendar",
    blurb:
      "Sir's Event Master, rebuilt — stacked weekly time-grids, drag/resize/copy-paste, per-event colour and Tentative/Confirmed. Month, week & overview views.",
    Icon: CalendarDays,
  },
  {
    slug: "masters",
    order: 2,
    title: "Category & Batch Masters",
    blurb:
      "The colour legend — add, rename, recolour and reorder event categories, plus the batch/section types that auto-block the calendar.",
    Icon: Palette,
    adminOnly: true,
  },
  {
    slug: "batches",
    order: 3,
    title: "Batch Schedules",
    blurb:
      "PS / BSS / Conclave / Graduate batch instances — enter dates & times and the calendar auto-blocks locked events across the range.",
    Icon: CalendarClock,
    adminOnly: true,
  },
  {
    slug: "obligations",
    order: 4,
    title: "Obligations Dashboard",
    blurb:
      "Compulsory monthly sessions — a done/target compliance grid across the financial year, auto-counted from tagged calendar events.",
    Icon: Gauge,
    adminOnly: true,
  },
];

export function getEventsSection(slug: string): EventsSection | undefined {
  return EVENTS_SECTIONS.find((s) => s.slug === slug);
}
