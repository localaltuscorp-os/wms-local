"use server";

import { revalidatePath } from "next/cache";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { calendarEvents } from "@/db/schema";
import {
  requireEventsAccess,
  requireEventsAdmin,
} from "@/lib/monthly-events/access";
import { rateLimitOrError } from "@/lib/rate-limit";
import { EVENT_STATUSES } from "@/db/enums";
import {
  getCalendarBundle,
  type CalendarBundle,
} from "@/lib/queries/monthly-events-calendar";
import { DAY_START_MIN, DAY_END_MIN } from "@/lib/monthly-events/types";

const PATH = "/events/calendar";

export type ActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

// ── Shared field coercion ────────────────────────────────────────────────────
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "Use a valid date.");
const uuid = z.string().uuid();

const optText = z
  .preprocess(
    (v) => (typeof v === "string" ? v.trim() : v),
    z.string().max(2000).nullable().optional(),
  )
  .transform((s) => (s ? s : null));

const hex = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/u, "Use a hex colour.")
  .nullable();

const statusEnum = z.enum(EVENT_STATUSES);

/** A timed slot must sit inside the visible grid and be at least 30 min long. */
const slotMin = z.number().int().min(DAY_START_MIN).max(DAY_END_MIN);

// ── Read (exposed for TanStack Query navigation) ─────────────────────────────
export async function fetchCalendarRange(
  from: string,
  to: string,
): Promise<ActionResult<{ bundle: CalendarBundle }>> {
  const { me } = await requireEventsAccess();
  const limited = rateLimitOrError(me.id, "read");
  if (limited) return limited;
  const f = isoDate.safeParse(from);
  const t = isoDate.safeParse(to);
  if (!f.success || !t.success) return fail("Invalid range.");
  try {
    const bundle = await getCalendarBundle(f.data, t.data);
    return { ok: true, bundle };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}

// ── Create ───────────────────────────────────────────────────────────────────
const CreateSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required.").max(200),
    categoryId: uuid.nullable().optional(),
    colorOverride: hex.optional(),
    eventDate: isoDate,
    startMin: slotMin.nullable().optional(),
    endMin: slotMin.nullable().optional(),
    allDay: z.boolean().optional(),
    status: statusEnum.optional(),
    location: optText,
    notes: optText,
    obligationId: uuid.nullable().optional(),
  })
  .refine(
    (d) => d.allDay || (d.startMin != null && d.endMin != null && d.endMin > d.startMin),
    { message: "End time must be after start time." },
  );

export async function createEvent(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const { me } = await requireEventsAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = CreateSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const d = parsed.data;
  try {
    const [row] = await db
      .insert(calendarEvents)
      .values({
        title: d.title,
        categoryId: d.categoryId ?? null,
        colorOverride: d.colorOverride ?? null,
        eventDate: d.eventDate,
        startMin: d.allDay ? null : d.startMin ?? null,
        endMin: d.allDay ? null : d.endMin ?? null,
        allDay: d.allDay ?? false,
        status: d.status ?? "confirmed",
        location: d.location,
        notes: d.notes,
        source: "manual",
        obligationId: d.obligationId ?? null,
        createdById: me.id,
        updatedById: me.id,
      })
      .returning({ id: calendarEvents.id });
    revalidatePath(PATH);
    return { ok: true, id: row!.id };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}

// ── Full edit (from the event editor) ────────────────────────────────────────
const UpdateSchema = CreateSchema.and(z.object({ id: uuid }));

export async function updateEvent(input: unknown): Promise<ActionResult> {
  const { me } = await requireEventsAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = UpdateSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const d = parsed.data;
  try {
    await db
      .update(calendarEvents)
      .set({
        title: d.title,
        categoryId: d.categoryId ?? null,
        colorOverride: d.colorOverride ?? null,
        eventDate: d.eventDate,
        startMin: d.allDay ? null : d.startMin ?? null,
        endMin: d.allDay ? null : d.endMin ?? null,
        allDay: d.allDay ?? false,
        status: d.status ?? "confirmed",
        location: d.location,
        notes: d.notes,
        obligationId: d.obligationId ?? null,
        updatedById: me.id,
        updatedAt: new Date(),
      })
      .where(eq(calendarEvents.id, d.id));
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}

// ── Inline title edit (double-click) ─────────────────────────────────────────
const RenameSchema = z.object({
  id: uuid,
  title: z.string().trim().min(1, "Title is required.").max(200),
});

export async function renameEvent(input: unknown): Promise<ActionResult> {
  const { me } = await requireEventsAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = RenameSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  try {
    await db
      .update(calendarEvents)
      .set({ title: parsed.data.title, updatedById: me.id, updatedAt: new Date() })
      .where(eq(calendarEvents.id, parsed.data.id));
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}

// ── Move (drag) ──────────────────────────────────────────────────────────────
const MoveSchema = z
  .object({
    id: uuid,
    eventDate: isoDate,
    startMin: slotMin.nullable(),
    endMin: slotMin.nullable(),
  })
  .refine((d) => d.startMin == null || (d.endMin != null && d.endMin > d.startMin), {
    message: "Invalid slot.",
  });

export async function moveEvent(input: unknown): Promise<ActionResult> {
  const { me } = await requireEventsAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = MoveSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const d = parsed.data;
  try {
    await db
      .update(calendarEvents)
      .set({
        eventDate: d.eventDate,
        startMin: d.startMin,
        endMin: d.endMin,
        updatedById: me.id,
        updatedAt: new Date(),
      })
      .where(eq(calendarEvents.id, d.id));
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}

// ── Resize ────────────────────────────────────────────────────────────────────
const ResizeSchema = z
  .object({ id: uuid, startMin: slotMin, endMin: slotMin })
  .refine((d) => d.endMin > d.startMin, { message: "Invalid duration." });

export async function resizeEvent(input: unknown): Promise<ActionResult> {
  const { me } = await requireEventsAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = ResizeSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const d = parsed.data;
  try {
    await db
      .update(calendarEvents)
      .set({ startMin: d.startMin, endMin: d.endMin, updatedById: me.id, updatedAt: new Date() })
      .where(eq(calendarEvents.id, d.id));
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}

// ── Quick single-field mutations (context menu) ──────────────────────────────
async function patch(
  id: string,
  set: Record<string, unknown>,
): Promise<ActionResult> {
  const { me } = await requireEventsAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!uuid.safeParse(id).success) return fail("Invalid id.");
  try {
    await db
      .update(calendarEvents)
      .set({ ...set, updatedById: me.id, updatedAt: new Date() })
      .where(eq(calendarEvents.id, id));
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}

export async function setColour(input: unknown): Promise<ActionResult> {
  const p = z.object({ id: uuid, colorOverride: hex }).safeParse(input);
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Invalid input.");
  return patch(p.data.id, { colorOverride: p.data.colorOverride });
}

export async function setCategory(input: unknown): Promise<ActionResult> {
  const p = z.object({ id: uuid, categoryId: uuid.nullable() }).safeParse(input);
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Invalid input.");
  return patch(p.data.id, { categoryId: p.data.categoryId });
}

export async function setStatus(input: unknown): Promise<ActionResult> {
  const p = z.object({ id: uuid, status: statusEnum }).safeParse(input);
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Invalid input.");
  return patch(p.data.id, { status: p.data.status });
}

export async function setLocation(input: unknown): Promise<ActionResult> {
  const p = z.object({ id: uuid, location: optText }).safeParse(input);
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Invalid input.");
  return patch(p.data.id, { location: p.data.location });
}

export async function tagObligation(input: unknown): Promise<ActionResult> {
  const p = z.object({ id: uuid, obligationId: uuid.nullable() }).safeParse(input);
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Invalid input.");
  return patch(p.data.id, { obligationId: p.data.obligationId });
}

/** Unlock a batch-generated block so Sir can override it (drag / edit /
 *  recolour / delete). The reconciler keys on source_ref_id, so an unlocked row
 *  becomes a normal editable event; deleting it may be re-created on next
 *  reconcile — that's the intended "override" semantics. */
export async function unlockEvent(id: string): Promise<ActionResult> {
  return patch(id, { isLocked: false });
}

// ── Delete ────────────────────────────────────────────────────────────────────
export async function deleteEvent(id: string): Promise<ActionResult> {
  const { me } = await requireEventsAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!uuid.safeParse(id).success) return fail("Invalid id.");
  try {
    // Hard delete — calendar_events has no is_active flag and manual rows are
    // fully re-creatable. (Source rows re-appear on the next reconcile.)
    await db.delete(calendarEvents).where(eq(calendarEvents.id, id));
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}

export async function deleteEvents(ids: unknown): Promise<ActionResult> {
  const { me } = await requireEventsAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const p = z.array(uuid).min(1).max(200).safeParse(ids);
  if (!p.success) return fail("Invalid ids.");
  try {
    await db.delete(calendarEvents).where(inArray(calendarEvents.id, p.data));
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}

// ── Duplicate ─────────────────────────────────────────────────────────────────
export async function duplicateEvent(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  const { me } = await requireEventsAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!uuid.safeParse(id).success) return fail("Invalid id.");
  try {
    const [src] = await db
      .select()
      .from(calendarEvents)
      .where(eq(calendarEvents.id, id))
      .limit(1);
    if (!src) return fail("Event not found.");
    const [row] = await db
      .insert(calendarEvents)
      .values({
        title: src.title,
        categoryId: src.categoryId,
        colorOverride: src.colorOverride,
        eventDate: src.eventDate,
        startMin: src.startMin,
        endMin: src.endMin,
        allDay: src.allDay,
        status: src.status,
        location: src.location,
        notes: src.notes,
        source: "manual", // a duplicate is always a manual, unlocked copy
        obligationId: src.obligationId,
        createdById: me.id,
        updatedById: me.id,
      })
      .returning({ id: calendarEvents.id });
    revalidatePath(PATH);
    return { ok: true, id: row!.id };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}

// ── Paste (from the client clipboard store) ──────────────────────────────────
// Each item carries its own start/end so multi-paste preserves relative offsets;
// the whole set is re-anchored so the earliest item lands on target date/slot.
const PasteItem = z.object({
  title: z.string().trim().min(1).max(200),
  categoryId: uuid.nullable().optional(),
  colorOverride: hex.optional(),
  status: statusEnum.optional(),
  location: optText,
  notes: optText,
  allDay: z.boolean().optional(),
  startMin: slotMin.nullable().optional(),
  endMin: slotMin.nullable().optional(),
  obligationId: uuid.nullable().optional(),
});
const PasteSchema = z.object({
  items: z.array(PasteItem).min(1).max(50),
  eventDate: isoDate,
  /** Target start slot for the earliest timed item (ignored for all-day). */
  anchorMin: slotMin.optional(),
});

export async function pasteEvents(
  input: unknown,
): Promise<ActionResult<{ count: number }>> {
  const { me } = await requireEventsAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = PasteSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const { items, eventDate, anchorMin } = parsed.data;

  const timedStarts = items
    .filter((i) => !i.allDay && i.startMin != null)
    .map((i) => i.startMin!) as number[];
  const earliest = timedStarts.length ? Math.min(...timedStarts) : DAY_START_MIN;
  const shift = anchorMin != null ? anchorMin - earliest : 0;

  const rows = items.map((i) => {
    let start = i.startMin != null ? i.startMin + shift : null;
    let end = i.endMin != null ? i.endMin + shift : null;
    if (start != null && end != null) {
      // Keep inside the grid, preserving duration.
      const dur = end - start;
      if (start < DAY_START_MIN) {
        start = DAY_START_MIN;
        end = Math.min(DAY_END_MIN, start + dur);
      }
      if (end > DAY_END_MIN) {
        end = DAY_END_MIN;
        start = Math.max(DAY_START_MIN, end - dur);
      }
    }
    return {
      title: i.title,
      categoryId: i.categoryId ?? null,
      colorOverride: i.colorOverride ?? null,
      eventDate,
      startMin: i.allDay ? null : start,
      endMin: i.allDay ? null : end,
      allDay: i.allDay ?? false,
      status: i.status ?? "confirmed",
      location: i.location ?? null,
      notes: i.notes ?? null,
      source: "manual" as const,
      obligationId: i.obligationId ?? null,
      createdById: me.id,
      updatedById: me.id,
    };
  });

  try {
    await db.insert(calendarEvents).values(rows);
    revalidatePath(PATH);
    return { ok: true, count: rows.length };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}
