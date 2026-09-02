/**
 * Shared types + slot geometry for the Monthly Events Master module.
 *
 * The row shapes are derived directly from the Drizzle table `$inferSelect`
 * types so every slice's imports match the DB EXACTLY (no drift). The union
 * literals re-export the canonical enums from `db/enums.ts`.
 */
import type {
  calendarEvents,
  eventCategories,
  eventHolidays,
  obligations,
  eventBatchSchedules,
} from "@/db/schema";
import type { EventStatus, ReligionCode } from "@/db/enums";

export type { EventStatus, ReligionCode };

export type CalendarEvent = typeof calendarEvents.$inferSelect;
export type EventCategory = typeof eventCategories.$inferSelect;
// NOTE: backed by the `event_holidays` table (the `holidays` name is taken by
// Attendance Phase B). Slices consume this `Holiday` contract type.
export type Holiday = typeof eventHolidays.$inferSelect;
export type Obligation = typeof obligations.$inferSelect;
export type BatchSchedule = typeof eventBatchSchedules.$inferSelect;

// ── Time-grid geometry (design §2/§3) ───────────────────────────────────────
// FULL 24-hour grid — 30-minute slots from 00:00 (0 min) to 24:00 (1440 min), so
// EVERY hour is reachable by scrolling (early-morning + late-night events too).
/** Minutes-from-midnight where the grid starts (00:00). */
export const DAY_START_MIN = 0;
/** Minutes-from-midnight where the grid ends (24:00). */
export const DAY_END_MIN = 1440;
/** Slot height in minutes. */
export const SLOT_MIN = 30;
/** Number of 30-min rows in one day column (00:00→24:00 = 24h / 0.5h = 48). */
export const SLOTS_PER_DAY = (DAY_END_MIN - DAY_START_MIN) / SLOT_MIN;

/**
 * Format minutes-from-midnight as a 12-hour clock label (e.g. 420 → "7:00 AM",
 * 780 → "1:00 PM"). Used for the time-axis labels and event tooltips.
 */
export function minToLabel(min: number): string {
  const total = ((min % 1440) + 1440) % 1440;
  const h24 = Math.floor(total / 60);
  const m = total % 60;
  const period = h24 < 12 ? "AM" : "PM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

/**
 * The 0-based grid row for a given minutes-from-midnight value, measured from
 * DAY_START_MIN in SLOT_MIN steps. Values before the grid start are negative;
 * callers clamp as needed.
 */
export function slotIndexFromMin(min: number): number {
  return Math.floor((min - DAY_START_MIN) / SLOT_MIN);
}
