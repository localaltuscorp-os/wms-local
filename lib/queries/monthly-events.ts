import "server-only";
import { and, asc, eq, gte, lte, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { withRetry } from "@/lib/db/with-timeout";
import {
  calendarEvents,
  eventBatchSchedules,
  eventBatchTypes,
  eventCategories,
  eventHolidays,
  obligations,
} from "@/db/schema";
import type {
  CalendarEvent,
  EventCategory,
  Holiday,
  Obligation,
} from "@/lib/monthly-events/types";

/** One pickable item for the Goals drawer's "Monthly Master" combobox — either a
 *  recurring obligation or a scheduled batch/event from the Monthly Events Master
 *  module. `label` is the display snapshot the goal persists (via monthlyMasterRef). */
export type MonthlyMasterPickable = {
  kind: "obligation" | "batch";
  id: string;
  label: string;
};

/**
 * Shared reads for the Monthly Events Master module. Used across slices
 * (calendar, masters, holidays, obligations). Hot reads (the calendar month
 * fetch) wrap in `withRetry` to self-heal a stale pooled connection.
 */

/** Active categories (the colour legend), ordered by sort_order then name. */
export async function listCategories(): Promise<EventCategory[]> {
  return db
    .select()
    .from(eventCategories)
    .where(eq(eventCategories.isActive, true))
    .orderBy(asc(eventCategories.sortOrder), asc(eventCategories.name));
}

/**
 * Calendar events whose `event_date` falls in the inclusive `[from, to]` window
 * (ISO `yyyy-mm-dd`). This is the calendar's hot path → wrapped in `withRetry`.
 */
export async function getMonthEvents(
  from: string,
  to: string,
): Promise<CalendarEvent[]> {
  return withRetry(
    () =>
      db
        .select()
        .from(calendarEvents)
        .where(
          and(
            gte(calendarEvents.eventDate, from),
            lte(calendarEvents.eventDate, to),
            // Holidays were removed from this module (they live in HR) — hide any
            // previously-projected holiday banners so the calendar stays clean.
            ne(calendarEvents.source, "holiday"),
          ),
        )
        .orderBy(asc(calendarEvents.eventDate), asc(calendarEvents.startMin)),
    { timeoutMs: [6000, 12000], label: "monthly-events.getMonthEvents" },
  );
}

/** All holidays for a financial year (fy_start_year), ordered by date. */
export async function listHolidays(fyStartYear: number): Promise<Holiday[]> {
  return db
    .select()
    .from(eventHolidays)
    .where(eq(eventHolidays.fyStartYear, fyStartYear))
    .orderBy(asc(eventHolidays.holidayDate));
}

/** Active obligations ("compulsory sessions"), ordered by name. */
export async function listObligations(): Promise<Obligation[]> {
  return db
    .select()
    .from(obligations)
    .where(eq(obligations.isActive, true))
    .orderBy(asc(obligations.name));
}

/**
 * Flat, pickable list for the Goals drawer's "Monthly Master" combobox: active
 * obligations + active scheduled batches (joined to their batch-type for a
 * readable name). Each item is `{ kind, id, label }` — the goal stores that
 * snapshot so the board never re-joins these tables to render the chip.
 */
export async function listMonthlyMasterPickables(): Promise<MonthlyMasterPickable[]> {
  const [obl, batches] = await Promise.all([
    db
      .select({
        id: obligations.id,
        name: obligations.name,
        counterparty: obligations.counterparty,
      })
      .from(obligations)
      .where(eq(obligations.isActive, true))
      .orderBy(asc(obligations.name)),
    db
      .select({
        id: eventBatchSchedules.id,
        name: eventBatchSchedules.name,
        startDate: eventBatchSchedules.startDate,
        typeName: eventBatchTypes.name,
      })
      .from(eventBatchSchedules)
      .innerJoin(eventBatchTypes, eq(eventBatchSchedules.batchTypeId, eventBatchTypes.id))
      .where(eq(eventBatchSchedules.isActive, true))
      .orderBy(asc(eventBatchSchedules.startDate)),
  ]);

  const oblItems: MonthlyMasterPickable[] = obl.map((o) => ({
    kind: "obligation",
    id: o.id,
    label: o.counterparty ? `${o.name} · ${o.counterparty}` : o.name,
  }));
  const batchItems: MonthlyMasterPickable[] = batches.map((b) => ({
    kind: "batch",
    id: b.id,
    label: `${b.name?.trim() || b.typeName}${b.startDate ? ` · ${b.startDate}` : ""}`,
  }));
  return [...oblItems, ...batchItems];
}
