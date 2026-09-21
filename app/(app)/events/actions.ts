"use server";

import { revalidatePath } from "next/cache";
import { and, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { execCalendarDayMarkers, execCalendarEvents, execCalendarPrefs, execCalendarRoutines } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import { isExecCategoryKey } from "@/lib/exec-calendar/taxonomy";
import { isExecClientKey } from "@/lib/exec-calendar/clients";
import { checkConflicts } from "@/lib/exec-calendar/privacy";
import { routineDays } from "@/lib/exec-calendar/grid";
import {
  MARKER_MAX_DAYS,
  MARKER_MAX_LABEL,
  expandRange,
  normaliseDates,
} from "@/lib/exec-calendar/day-markers";

/**
 * Writes for the Executive Master Calendar.
 *
 * TWO RULES RE-CHECKED HERE, NOT JUST IN THE FORM:
 *
 *   1. OWNERSHIP. Every write is scoped to the signed-in person's own calendar
 *      (`ownerId = me.id`) and every update/delete carries that in its WHERE.
 *      A crafted id therefore cannot reach somebody else's block — the check is
 *      part of the query, not a separate `if` that a later refactor can drop.
 *   2. PROTECTED TIME (§5). `checkConflicts` runs again on the server with the
 *      real diary. The dialog warns; this refuses. A form that is the only
 *      thing standing between an assistant and the executive's exercise hour is
 *      not a control, it is a suggestion.
 *
 * Times are integer minutes-from-midnight; dates are 'YYYY-MM-DD' strings.
 */

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");
const Minute = z.number().int().min(0).max(1440);

const EventInput = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(1, "Give it a title").max(200),
  categoryKey: z.string().refine(isExecCategoryKey, "Pick a category"),
  day: Day,
  startMin: Minute.nullable(),
  endMin: Minute.nullable(),
  allDay: z.boolean(),
  location: z.string().trim().max(200).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  clientEntryId: z.string().uuid().nullable().optional(),
  clientKey: z.string().refine(isExecClientKey, "Pick a client from the list").nullable().optional(),
  batchLabel: z.string().trim().max(120).nullable().optional(),
});

export type ExecEventInput = z.infer<typeof EventInput>;

/** Shared shape checks the database CHECK also enforces — caught here so the
 *  user gets a sentence instead of a constraint violation. */
function validateTimes(v: ExecEventInput): string | null {
  if (v.allDay) return v.startMin != null || v.endMin != null ? "An all-day block has no times." : null;
  if (v.startMin == null && v.endMin == null) return null; // "no time set yet" is allowed
  if (v.startMin == null || v.endMin == null) return "Give it both a start and an end.";
  if (v.endMin <= v.startMin) return "It has to end after it starts.";
  return null;
}

export async function saveExecEvent(input: ExecEventInput): Promise<Result<{ id: string }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = EventInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
  const v = parsed.data;

  const timeError = validateTimes(v);
  if (timeError) return { ok: false, error: timeError };

  // Re-check the diary. The owner may overrule their own protected time; this
  // is the path an assistant takes, and for them it is a refusal.
  if (!v.allDay && v.startMin != null && v.endMin != null) {
    const sameDay = await db
      .select({
        id: execCalendarEvents.id,
        day: execCalendarEvents.eventDate,
        startMin: execCalendarEvents.startMin,
        endMin: execCalendarEvents.endMin,
        categoryKey: execCalendarEvents.categoryKey,
        title: execCalendarEvents.title,
      })
      .from(execCalendarEvents)
      .where(and(eq(execCalendarEvents.ownerId, me.id), eq(execCalendarEvents.eventDate, v.day)));

    const verdict = checkConflicts(
      { id: v.id, day: v.day, startMin: v.startMin, endMin: v.endMin, categoryKey: v.categoryKey },
      sameDay,
      { employeeId: me.id, isOwner: true },
    );
    if (!verdict.ok) return { ok: false, error: verdict.reason };
  }

  const row = {
    title: v.title,
    categoryKey: v.categoryKey,
    eventDate: v.day,
    startMin: v.allDay ? null : v.startMin,
    endMin: v.allDay ? null : v.endMin,
    allDay: v.allDay,
    // Always public: the module exists so the team can see the schedule.
    visibility: "public" as const,
    location: v.location ?? null,
    notes: v.notes ?? null,
    // The Client Engagement link is no longer written (2026-09-18): the picker
    // is the fixed list in lib/exec-calendar/clients.ts. An edit keeps whatever
    // link an older block had; `clientKey` is the client from now on.
    ...(v.clientEntryId !== undefined ? { clientEntryId: v.clientEntryId } : {}),
    clientKey: v.clientKey ?? null,
    batchLabel: v.batchLabel ?? null,
    updatedById: me.id,
    updatedAt: new Date(),
  };

  try {
    if (v.id) {
      const [updated] = await db
        .update(execCalendarEvents)
        .set(row)
        // Ownership is IN the WHERE, so another person's id simply matches nothing.
        .where(and(eq(execCalendarEvents.id, v.id), eq(execCalendarEvents.ownerId, me.id)))
        .returning({ id: execCalendarEvents.id });
      if (!updated) return { ok: false, error: "That block is not yours to edit." };
      revalidatePath("/events");
      return { ok: true, id: updated.id };
    }

    const [created] = await db
      .insert(execCalendarEvents)
      .values({ ...row, ownerId: me.id, createdById: me.id })
      .returning({ id: execCalendarEvents.id });
    if (!created) return { ok: false, error: "Nothing was saved — try again." };
    revalidatePath("/events");
    return { ok: true, id: created.id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("exec_calendar_events")) {
      return { ok: false, error: "The calendar tables are not in this database yet (migration 0231)." };
    }
    return { ok: false, error: msg };
  }
}

export async function deleteExecEvent(id: string): Promise<Result> {
  const me = await requireUser();
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Invalid id" };
  const [gone] = await db
    .delete(execCalendarEvents)
    .where(and(eq(execCalendarEvents.id, id), eq(execCalendarEvents.ownerId, me.id)))
    .returning({ id: execCalendarEvents.id });
  if (!gone) return { ok: false, error: "That block is not yours to delete." };
  revalidatePath("/events");
  return { ok: true };
}

/* ── The grid window, per person (§2A) ───────────────────────────────────── */

const PrefsInput = z.object({
  startMin: Minute,
  endMin: Minute,
  slotMin: z.union([z.literal(30), z.literal(60)]),
});

export async function saveExecGridPrefs(input: z.infer<typeof PrefsInput>): Promise<Result> {
  const me = await requireUser();
  const parsed = PrefsInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That window makes no sense." };
  const { startMin, endMin, slotMin } = parsed.data;
  if (endMin <= startMin) return { ok: false, error: "The day has to end after it starts." };

  await db
    .insert(execCalendarPrefs)
    .values({ employeeId: me.id, startMin, endMin, slotMin })
    .onConflictDoUpdate({
      target: execCalendarPrefs.employeeId,
      set: { startMin, endMin, slotMin, updatedAt: new Date() },
    });
  revalidatePath("/events");
  return { ok: true };
}

/* ── Routines (§4B) ──────────────────────────────────────────────────────── */

const RoutineInput = z.object({
  title: z.string().trim().min(1, "Give the routine a title").max(200),
  categoryKey: z.string().refine(isExecCategoryKey, "Pick a category"),
  /** 0=Mon … 6=Sun. Empty = every day in the range. */
  daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7),
  startMin: Minute,
  endMin: Minute,
  fromDate: Day,
  toDate: Day,
});

/**
 * Stamp a recurring routine across a date range — the 07:00 exercise block, the
 * Saturday cohort, the executive break.
 *
 * GENERATES ROWS rather than expanding a rule at read time, because one deleted
 * Tuesday has to stay deleted and a rule evaluated on every read cannot
 * remember that. Each generated row carries `routineId`, so the routine can be
 * re-stamped or swept up later.
 *
 * Days that already hold a block of the same routine are skipped, so running it
 * twice does not double-stamp. A day where the slot would clash with PROTECTED
 * time is skipped too and reported back, rather than failing the whole run —
 * stamping a quarter should not abort on one Tuesday.
 */
export async function stampExecRoutine(
  input: z.infer<typeof RoutineInput>,
): Promise<Result<{ created: number; skipped: number }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = RoutineInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
  const v = parsed.data;
  if (v.endMin <= v.startMin) return { ok: false, error: "It has to end after it starts." };
  if (v.toDate < v.fromDate) return { ok: false, error: "The range ends before it begins." };

  const [routine] = await db
    .insert(execCalendarRoutines)
    .values({
      ownerId: me.id,
      title: v.title,
      categoryKey: v.categoryKey,
      daysOfWeek: v.daysOfWeek,
      startMin: v.startMin,
      endMin: v.endMin,
      fromDate: v.fromDate,
      toDate: v.toDate,
      visibility: "public" as const,
      createdById: me.id,
    })
    .returning({ id: execCalendarRoutines.id });
  if (!routine) return { ok: false, error: "Could not save the routine." };

  const existing = await db
    .select({
      day: execCalendarEvents.eventDate,
      startMin: execCalendarEvents.startMin,
      endMin: execCalendarEvents.endMin,
      categoryKey: execCalendarEvents.categoryKey,
      routineId: execCalendarEvents.routineId,
    })
    .from(execCalendarEvents)
    .where(
      and(
        eq(execCalendarEvents.ownerId, me.id),
        gte(execCalendarEvents.eventDate, v.fromDate),
        lte(execCalendarEvents.eventDate, v.toDate),
      ),
    );

  const rows: (typeof execCalendarEvents.$inferInsert)[] = [];
  let skipped = 0;

  for (const d of routineDays(v.fromDate, v.toDate, v.daysOfWeek)) {
    const sameDay = existing.filter((e) => e.day === d);
    const already = sameDay.some(
      (e) => e.routineId != null && e.startMin === v.startMin && e.endMin === v.endMin,
    );
    if (already) { skipped += 1; continue; }

    const verdict = checkConflicts(
      { day: d, startMin: v.startMin, endMin: v.endMin, categoryKey: v.categoryKey },
      sameDay,
      { employeeId: me.id, isOwner: false }, // strict: a routine must not eat protected time
    );
    if (!verdict.ok) { skipped += 1; continue; }

    rows.push({
      ownerId: me.id,
      title: v.title,
      categoryKey: v.categoryKey,
      eventDate: d,
      startMin: v.startMin,
      endMin: v.endMin,
      allDay: false,
      visibility: "public" as const,
      routineId: routine.id,
      createdById: me.id,
    });
  }

  if (rows.length > 0) await db.insert(execCalendarEvents).values(rows);
  revalidatePath("/events");
  return { ok: true, created: rows.length, skipped };
}

/* ── Importing the sheet (lib/exec-calendar/import.ts) ───────────────────── */

const ImportInput = z.object({
  blocks: z
    .array(
      z.object({
        day: Day,
        startMin: Minute,
        endMin: Minute,
        title: z.string().trim().min(1).max(200),
        categoryKey: z.string().refine(isExecCategoryKey, "Pick a category"),
      }),
    )
    .min(1, "Nothing to import")
    .max(2000, "That is more than one paste should carry — do it a quarter at a time."),
});

/**
 * Bulk-insert blocks parsed from a pasted sheet.
 *
 * NO CONFLICT CHECK, deliberately, and this is the one place that is right.
 * The sheet IS the record of what happened: a decade of it contains overlaps,
 * things that ran late and blocks that sat on top of each other, and refusing
 * those would mean importing a version of history that never happened. The
 * refusal exists to stop somebody booking over protected time in FUTURE; an
 * import is a transcription.
 *
 * Idempotency is by (day, start, title): re-pasting the same week updates
 * nothing and inserts nothing, so a nervous second paste is harmless.
 */
export async function importExecBlocks(
  input: z.infer<typeof ImportInput>,
): Promise<Result<{ created: number; skipped: number }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = ImportInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
  const { blocks } = parsed.data;

  const days = [...new Set(blocks.map((b) => b.day))].sort();
  const existing = await db
    .select({
      day: execCalendarEvents.eventDate,
      startMin: execCalendarEvents.startMin,
      title: execCalendarEvents.title,
    })
    .from(execCalendarEvents)
    .where(
      and(
        eq(execCalendarEvents.ownerId, me.id),
        gte(execCalendarEvents.eventDate, days[0]!),
        lte(execCalendarEvents.eventDate, days.at(-1)!),
      ),
    );
  const seen = new Set(existing.map((e) => `${e.day}|${e.startMin}|${e.title.toLowerCase()}`));

  const rows: (typeof execCalendarEvents.$inferInsert)[] = [];
  let skipped = 0;
  for (const b of blocks) {
    if (b.endMin <= b.startMin) { skipped += 1; continue; }
    const key = `${b.day}|${b.startMin}|${b.title.toLowerCase()}`;
    if (seen.has(key)) { skipped += 1; continue; }
    seen.add(key);
    rows.push({
      ownerId: me.id,
      title: b.title,
      categoryKey: b.categoryKey,
      eventDate: b.day,
      startMin: b.startMin,
      endMin: b.endMin,
      allDay: false,
      visibility: "public" as const,
      createdById: me.id,
    });
  }

  // Chunked: one 2,000-row INSERT is a large statement to send over a pooler,
  // and a failure halfway through a quarter is harder to reason about than a
  // failure on one chunk.
  for (let i = 0; i < rows.length; i += 200) {
    await db.insert(execCalendarEvents).values(rows.slice(i, i + 200));
  }

  revalidatePath("/events");
  return { ok: true, created: rows.length, skipped };
}

/* ── Listing and deleting routines (2026-09-18) ──────────────────────────── */

export interface RoutineSummary {
  id: string;
  title: string;
  categoryKey: string;
  daysOfWeek: number[];
  startMin: number;
  endMin: number;
  fromDate: string;
  toDate: string;
  /** Blocks this routine stamped that still exist. */
  blockCount: number;
  /** Of those, how many are today or later. */
  upcomingCount: number;
}

/** Every routine on YOUR calendar, newest first, with how many blocks each left. */
export async function listMyRoutines(today: string): Promise<Result<{ routines: RoutineSummary[] }>> {
  const me = await requireUser();
  if (!Day.safeParse(today).success) return { ok: false, error: "Invalid date" };

  const routines = await db
    .select({
      id: execCalendarRoutines.id,
      title: execCalendarRoutines.title,
      categoryKey: execCalendarRoutines.categoryKey,
      daysOfWeek: execCalendarRoutines.daysOfWeek,
      startMin: execCalendarRoutines.startMin,
      endMin: execCalendarRoutines.endMin,
      fromDate: execCalendarRoutines.fromDate,
      toDate: execCalendarRoutines.toDate,
      createdAt: execCalendarRoutines.createdAt,
    })
    .from(execCalendarRoutines)
    .where(eq(execCalendarRoutines.ownerId, me.id));

  const blocks = await db
    .select({ routineId: execCalendarEvents.routineId, day: execCalendarEvents.eventDate })
    .from(execCalendarEvents)
    .where(eq(execCalendarEvents.ownerId, me.id));

  const counts = new Map<string, { all: number; upcoming: number }>();
  for (const b of blocks) {
    if (!b.routineId) continue;
    const c = counts.get(b.routineId) ?? { all: 0, upcoming: 0 };
    c.all += 1;
    if (b.day >= today) c.upcoming += 1;
    counts.set(b.routineId, c);
  }

  return {
    ok: true,
    routines: routines
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((r) => ({
        id: r.id,
        title: r.title,
        categoryKey: r.categoryKey,
        daysOfWeek: r.daysOfWeek,
        startMin: r.startMin,
        endMin: r.endMin,
        fromDate: r.fromDate,
        toDate: r.toDate,
        blockCount: counts.get(r.id)?.all ?? 0,
        upcomingCount: counts.get(r.id)?.upcoming ?? 0,
      })),
  };
}

/**
 * Delete a routine.
 *
 * `scope` decides what happens to the blocks it already stamped:
 *   "upcoming"  delete today's and later ones, keep the past — the usual case:
 *               the routine is being STOPPED, and the record of the weeks it
 *               did run is still the record
 *   "all"       delete every block it ever stamped
 * Either way the routine row goes. Blocks that are kept lose their routine link
 * (the FK is ON DELETE SET NULL) and become ordinary blocks.
 *
 * Ownership is in every WHERE clause, as with every other write here.
 */
export async function deleteExecRoutine(
  id: string,
  scope: "upcoming" | "all",
  today: string,
): Promise<Result<{ removedBlocks: number }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Invalid id" };
  if (!Day.safeParse(today).success) return { ok: false, error: "Invalid date" };

  const [routine] = await db
    .select({ id: execCalendarRoutines.id })
    .from(execCalendarRoutines)
    .where(and(eq(execCalendarRoutines.id, id), eq(execCalendarRoutines.ownerId, me.id)))
    .limit(1);
  if (!routine) return { ok: false, error: "That routine is not yours to delete" };

  const removed = await db
    .delete(execCalendarEvents)
    .where(
      and(
        eq(execCalendarEvents.routineId, id),
        eq(execCalendarEvents.ownerId, me.id),
        scope === "upcoming" ? gte(execCalendarEvents.eventDate, today) : undefined,
      ),
    )
    .returning({ id: execCalendarEvents.id });

  await db
    .delete(execCalendarRoutines)
    .where(and(eq(execCalendarRoutines.id, id), eq(execCalendarRoutines.ownerId, me.id)));

  revalidatePath("/events");
  return { ok: true, removedBlocks: removed.length };
}


/* ── Day Markers (2026-09-18) ─────────────────────────────────────────────
   "Final exam", "Exam week": a label on one day, a period, or hand-picked
   days (lib/exec-calendar/day-markers.ts). Owner-scoped like every other write
   here - the owner id is in the WHERE, not a separate check. */

const MarkerInput = z.object({
  id: z.string().uuid().optional(),
  label: z.string().trim().min(1, "Say what the day is marked for").max(MARKER_MAX_LABEL),
  mode: z.enum(["day", "range", "dates"]),
  dates: z.array(Day).min(1, "Pick at least one date").max(MARKER_MAX_DAYS, "A marker covers at most a year"),
});

export type DayMarkerInput = z.infer<typeof MarkerInput>;

export async function saveDayMarker(input: DayMarkerInput): Promise<Result<{ id: string }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = MarkerInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
  const v = parsed.data;

  // Re-derive the days from the mode rather than trusting the list: a period
  // is every day between its ends, one day is exactly one.
  const sorted = normaliseDates(v.dates);
  const dates = v.mode === "range" ? expandRange(sorted[0]!, sorted.at(-1)!) : sorted;
  if (dates.length === 0) return { ok: false, error: "Pick at least one date" };
  if (v.mode === "day" && dates.length !== 1) return { ok: false, error: "One Day takes exactly one date" };

  try {
    if (v.id) {
      const [row] = await db
        .update(execCalendarDayMarkers)
        .set({ label: v.label, mode: v.mode, dates, updatedAt: new Date() })
        .where(and(eq(execCalendarDayMarkers.id, v.id), eq(execCalendarDayMarkers.ownerId, me.id)))
        .returning({ id: execCalendarDayMarkers.id });
      if (!row) return { ok: false, error: "That marker is not yours to change." };
      revalidatePath("/events");
      return { ok: true, id: row.id };
    }
    const [row] = await db
      .insert(execCalendarDayMarkers)
      .values({ ownerId: me.id, label: v.label, mode: v.mode, dates, createdById: me.id })
      .returning({ id: execCalendarDayMarkers.id });
    revalidatePath("/events");
    return { ok: true, id: row!.id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("exec_calendar_day_markers")) {
      return { ok: false, error: "Day markers are not in this database yet (migration 0237)." };
    }
    return { ok: false, error: msg };
  }
}

export async function deleteDayMarker(id: string): Promise<Result> {
  const me = await requireUser();
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Invalid id" };
  const [gone] = await db
    .delete(execCalendarDayMarkers)
    .where(and(eq(execCalendarDayMarkers.id, id), eq(execCalendarDayMarkers.ownerId, me.id)))
    .returning({ id: execCalendarDayMarkers.id });
  if (!gone) return { ok: false, error: "That marker is not yours to delete." };
  revalidatePath("/events");
  return { ok: true };
}
