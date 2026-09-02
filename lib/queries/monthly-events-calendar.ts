import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { eventCategories, obligations } from "@/db/schema";
import {
  getMonthEvents,
  listCategories,
} from "@/lib/queries/monthly-events";
import type {
  CalendarEvent,
  EventCategory,
  Obligation,
} from "@/lib/monthly-events/types";

/**
 * Calendar-slice reads (server-only). The hot month fetch (`getMonthEvents`)
 * already wraps in `withRetry` in the shared query module — we compose it here
 * with the legend (categories) and obligations so a single round of reads
 * hydrates the whole calendar workspace.
 */
export interface CalendarBundle {
  events: CalendarEvent[];
  categories: EventCategory[];
  obligations: Obligation[];
}

/** Obligations (active + inactive) so the editor's "tag obligation" picker can
 *  still show a previously-tagged but now-archived obligation by name. */
async function listAllObligations(): Promise<Obligation[]> {
  return db.select().from(obligations).orderBy(asc(obligations.name));
}

/**
 * One bundle for the calendar workspace: every event whose `event_date` is in
 * the inclusive `[from, to]` window, plus the colour legend and obligations.
 */
export async function getCalendarBundle(
  from: string,
  to: string,
): Promise<CalendarBundle> {
  const [events, categories, obligationRows] = await Promise.all([
    getMonthEvents(from, to),
    listCategories(),
    listAllObligations(),
  ]);
  return { events, categories, obligations: obligationRows };
}

/** Single category lookup (used when resolving a colour server-side). */
export async function getCategory(id: string): Promise<EventCategory | null> {
  const [row] = await db
    .select()
    .from(eventCategories)
    .where(eq(eventCategories.id, id))
    .limit(1);
  return row ?? null;
}
