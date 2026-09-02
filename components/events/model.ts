/**
 * Client-side view-model types for the calendar workspace. These are UI-only
 * shapes (view union, pending-create draft, editor target) — the DB row types
 * come from `@/lib/monthly-events/types` and are never redefined here.
 */
import type { CalendarEvent, EventCategory } from "@/lib/monthly-events/types";

export type CalendarView = "month" | "week" | "overview";

export const CALENDAR_VIEWS: CalendarView[] = ["month", "week", "overview"];

export function isCalendarView(v: string | null): v is CalendarView {
  return v === "month" || v === "week" || v === "overview";
}

/** A not-yet-saved event the editor is composing (from click-drag / quick-add). */
export interface DraftEvent {
  eventDate: string;
  startMin: number | null;
  endMin: number | null;
  allDay: boolean;
}

/** What the event editor is currently editing — an existing row or a fresh draft. */
export type EditorTarget =
  | { mode: "create"; draft: DraftEvent }
  | { mode: "edit"; event: CalendarEvent };

/** Map of category id → category, for fast colour/label lookups in the grid. */
export type CategoryMap = Map<string, EventCategory>;

export function toCategoryMap(cats: EventCategory[]): CategoryMap {
  return new Map(cats.map((c) => [c.id, c]));
}

/** Slot pixel height per view (drives all geometry). */
export const SLOT_HEIGHT: Record<Exclude<CalendarView, "overview">, number> = {
  month: 18,
  week: 40,
};

/** Right-click menu anchor + the event it targets. */
export interface ContextTarget {
  x: number;
  y: number;
  eventId: string;
}

/** Anchor for a slot the user clicked/selected but hasn't yet filled. */
export interface SlotAnchor {
  eventDate: string;
  startMin: number;
}
