import "server-only";
import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  employees,
  execCalendarDayMarkers,
  execCalendarEvents,
  execCalendarPrefs,
  paEntries,
  type ExecVisibilityCol,
} from "@/db/schema";
import { DEFAULT_GRID, type GridConfig } from "@/lib/exec-calendar/grid";
import type { CalendarEventShape } from "@/lib/exec-calendar/privacy";
import { execClient } from "@/lib/exec-calendar/clients";
import type { DayMarker, MarkerMode } from "@/lib/exec-calendar/day-markers";

/**
 * Reads for the Executive Master Calendar.
 *
 * ── EVERY READ IS WRAPPED, AND THAT IS DELIBERATE ─────────────────────────
 * `0231_exec_calendar.sql` has not necessarily run on the database this build
 * is talking to — it did not on 17 September, when five migrations were found
 * outstanding at once. An unguarded read would throw `relation
 * "exec_calendar_events" does not exist` and, because the calendar renders
 * inside a layout, take the whole room down with it.
 *
 * So a missing table degrades to an EMPTY calendar: the page draws its grid,
 * its legend and its empty analytics, and says so. That is the same choice
 * `lib/queries/ce-dropdowns.ts` makes, and the same reasoning as the fail-soft
 * on the device-registration gate — a screen with nothing on it is recoverable,
 * a blank error page is not.
 *
 * The catch is scoped to "the table isn't there yet". It logs, so a genuine
 * outage is still visible in the server output rather than silently rendering
 * an empty week and letting somebody plan around it.
 */

export interface ExecEventRow extends CalendarEventShape {
  /** The fixed-list client (lib/exec-calendar/clients.ts), or null. */
  clientKey: string | null;
  allDay: boolean;
  location: string | null;
  batchLabel: string | null;
  routineId: string | null;
  ownerName: string;
}

function softFail<T>(what: string, fallback: T) {
  return (err: unknown): T => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[exec-calendar] ${what} failed — rendering empty. ${msg}`);
    return fallback;
  };
}

/** Every block for one owner between two day strings, inclusive. */
export async function listExecEvents(
  ownerId: string,
  fromDay: string,
  toDay: string,
): Promise<ExecEventRow[]> {
  const rows = await db
    .select({
      id: execCalendarEvents.id,
      ownerId: execCalendarEvents.ownerId,
      title: execCalendarEvents.title,
      categoryKey: execCalendarEvents.categoryKey,
      day: execCalendarEvents.eventDate,
      startMin: execCalendarEvents.startMin,
      endMin: execCalendarEvents.endMin,
      allDay: execCalendarEvents.allDay,
      visibility: execCalendarEvents.visibility,
      location: execCalendarEvents.location,
      notes: execCalendarEvents.notes,
      clientEntryId: execCalendarEvents.clientEntryId,
      clientKey: execCalendarEvents.clientKey,
      batchLabel: execCalendarEvents.batchLabel,
      routineId: execCalendarEvents.routineId,
      clientName: paEntries.name,
      ownerName: employees.name,
    })
    .from(execCalendarEvents)
    .leftJoin(paEntries, eq(paEntries.id, execCalendarEvents.clientEntryId))
    .leftJoin(employees, eq(employees.id, execCalendarEvents.ownerId))
    .where(
      and(
        eq(execCalendarEvents.ownerId, ownerId),
        gte(execCalendarEvents.eventDate, fromDay),
        lte(execCalendarEvents.eventDate, toDay),
      ),
    )
    // OLDEST FIRST (asked for 2026-09-17). Creation order decides which of two
    // clashing blocks sits in the left column, so the one that was there first
    // keeps its place instead of shuffling when a new block is added.
    .orderBy(
      asc(execCalendarEvents.eventDate),
      asc(execCalendarEvents.startMin),
      asc(execCalendarEvents.createdAt),
    )
    .catch(softFail("listExecEvents", [] as never[]));

  return rows.map((r) => ({
    ...r,
    // The fixed-list client wins; an older block linked to a Client Engagement
    // record still shows that record's name.
    clientName: execClient(r.clientKey)?.label ?? r.clientName,
    visibility: (r.visibility ?? "public") as ExecVisibilityCol,
    ownerName: r.ownerName ?? "",
  }));
}

/**
 * The grid window this person prefers, falling back to the brief's default.
 * A row that fails its own CHECK can never be written, so anything stored here
 * is already a valid window — but the fallback still guards a missing table.
 */
export async function getExecGridConfig(employeeId: string): Promise<GridConfig> {
  const [row] = await db
    .select({
      startMin: execCalendarPrefs.startMin,
      endMin: execCalendarPrefs.endMin,
      slotMin: execCalendarPrefs.slotMin,
    })
    .from(execCalendarPrefs)
    .where(eq(execCalendarPrefs.employeeId, employeeId))
    .limit(1)
    .catch(softFail("getExecGridConfig", [] as never[]));

  if (!row) return DEFAULT_GRID;
  return {
    startMin: row.startMin,
    endMin: row.endMin,
    slotMin: row.slotMin === 60 ? 60 : 30,
  };
}

/**
 * Has 0231 actually run? The page uses this to say "the calendar is not set up
 * yet, run the migration" instead of pretending the executive has a free year.
 * An empty calendar and an absent table look identical otherwise, and telling
 * somebody their quarter is free when the table is missing would be a lie.
 */
/**
 * One owner's Day Markers that touch the range (any of their dates inside it).
 * Every date is returned, not just the ones in range, so the editor can reopen
 * a marker whole.
 */
export async function listDayMarkers(ownerId: string, fromDay: string, toDay: string): Promise<DayMarker[]> {
  const rows = await db
    .select({
      id: execCalendarDayMarkers.id,
      label: execCalendarDayMarkers.label,
      mode: execCalendarDayMarkers.mode,
      dates: execCalendarDayMarkers.dates,
    })
    .from(execCalendarDayMarkers)
    .where(
      and(
        eq(execCalendarDayMarkers.ownerId, ownerId),
        sql`exists (select 1 from unnest(${execCalendarDayMarkers.dates}) d where d between ${fromDay}::date and ${toDay}::date)`,
      ),
    )
    .orderBy(asc(execCalendarDayMarkers.createdAt))
    .catch(softFail("listDayMarkers", [] as never[]));
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    mode: (r.mode ?? "day") as MarkerMode,
    dates: [...(r.dates ?? [])].map(String).sort(),
  }));
}

export async function execCalendarReady(): Promise<boolean> {
  try {
    await db.select({ id: execCalendarEvents.id }).from(execCalendarEvents).limit(1);
    return true;
  } catch {
    return false;
  }
}

/**
 * Whose calendars can be opened (§5, team view). Everyone active: the point of
 * the module is that the team can plan around the executive, and masking — not
 * a hidden list — is what protects the private half.
 */
export async function listExecOwners(): Promise<{ id: string; name: string }[]> {
  return db
    .select({ id: employees.id, name: employees.name })
    .from(employees)
    .where(eq(employees.isActive, true))
    .orderBy(asc(employees.name))
    .limit(500)
    .catch(softFail("listExecOwners", [] as { id: string; name: string }[]));
}

/** The clients a consulting slot may point at (§4A) — active engagements. */
export async function listExecClientOptions(): Promise<{ id: string; name: string }[]> {
  return db
    .select({ id: paEntries.id, name: paEntries.name })
    .from(paEntries)
    .orderBy(asc(paEntries.name))
    .limit(500)
    .catch(softFail("listExecClientOptions", [] as { id: string; name: string }[]));
}
