"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { eventBatchSchedules } from "@/db/schema";
import { requireEventsAdmin } from "@/lib/monthly-events/access";
import { reconcileBatchEvents } from "@/lib/monthly-events/reconcile";
import { rateLimitOrError } from "@/lib/rate-limit";
import { EVENT_STATUSES } from "@/db/enums";
import { DAY_START_MIN, DAY_END_MIN, SLOT_MIN } from "@/lib/monthly-events/types";

const PATH = "/events/batches";
const CALENDAR_PATH = "/events/calendar";

export type ActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };
function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

function revalidate() {
  revalidatePath(PATH);
  revalidatePath(CALENDAR_PATH);
}

// ── Schema ──────────────────────────────────────────────────────────────────

const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date.");

const optText = z
  .preprocess(
    (v) => (typeof v === "string" ? v.trim() : v),
    z.string().max(2000).nullable().optional(),
  )
  .transform((s) => (s ? s : null));

/** A 30-min-aligned minutes-from-midnight value inside the 07:00–21:00 grid. */
const slotMin = z
  .number()
  .int()
  .min(DAY_START_MIN, "Time is before the grid starts (07:00).")
  .max(DAY_END_MIN, "Time is after the grid ends (21:00).")
  .refine((n) => n % SLOT_MIN === 0, "Times must land on a 30-minute slot.");

const BaseFields = z
  .object({
    batchTypeId: z.string().uuid("Pick a batch type."),
    name: optText,
    startDate: isoDate,
    endDate: isoDate,
    startMin: slotMin.nullable().optional().default(null),
    endMin: slotMin.nullable().optional().default(null),
    daysOfWeek: z
      .array(z.number().int().min(0).max(6))
      .max(7)
      .optional()
      .default([])
      // de-dupe + sort so the stored array is canonical.
      .transform((a) => Array.from(new Set(a)).sort((x, y) => x - y)),
    categoryId: z.string().uuid().nullable().optional().default(null),
    status: z.enum(EVENT_STATUSES).default("confirmed"),
    location: optText,
    notes: optText,
  })
  .refine((d) => d.endDate >= d.startDate, {
    message: "End date can't be before the start date.",
    path: ["endDate"],
  })
  .refine((d) => (d.startMin == null) === (d.endMin == null), {
    message: "Set both a start and end time, or leave both blank (all-day).",
    path: ["endMin"],
  })
  .refine((d) => d.startMin == null || d.endMin == null || d.endMin > d.startMin, {
    message: "End time must be after the start time.",
    path: ["endMin"],
  });

const UpdateSchema = z.object({ id: z.string().uuid() }).and(BaseFields);

// ── Actions ─────────────────────────────────────────────────────────────────

export async function createBatchSchedule(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const { me } = await requireEventsAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = BaseFields.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const d = parsed.data;
  try {
    const [row] = await db
      .insert(eventBatchSchedules)
      .values({
        batchTypeId: d.batchTypeId,
        name: d.name,
        startDate: d.startDate,
        endDate: d.endDate,
        startMin: d.startMin,
        endMin: d.endMin,
        daysOfWeek: d.daysOfWeek,
        categoryId: d.categoryId,
        status: d.status,
        location: d.location,
        notes: d.notes,
        createdById: me.id,
        updatedById: me.id,
      })
      .returning({ id: eventBatchSchedules.id });
    const id = row!.id;
    await reconcileBatchEvents(id);
    revalidate();
    return { ok: true, id };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}

export async function updateBatchSchedule(input: unknown): Promise<ActionResult> {
  const { me } = await requireEventsAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = UpdateSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const { id, ...d } = parsed.data;
  try {
    await db
      .update(eventBatchSchedules)
      .set({
        batchTypeId: d.batchTypeId,
        name: d.name,
        startDate: d.startDate,
        endDate: d.endDate,
        startMin: d.startMin,
        endMin: d.endMin,
        daysOfWeek: d.daysOfWeek,
        categoryId: d.categoryId,
        status: d.status,
        location: d.location,
        notes: d.notes,
        updatedById: me.id,
        updatedAt: new Date(),
      })
      .where(eq(eventBatchSchedules.id, id));
    await reconcileBatchEvents(id);
    revalidate();
    return { ok: true };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}

/** Toggle a schedule active/inactive. Deactivating removes its auto-blocks;
 *  reactivating regenerates them — both via reconcile. */
export async function setBatchScheduleActive(
  input: unknown,
): Promise<ActionResult> {
  const { me } = await requireEventsAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = z
    .object({ id: z.string().uuid(), isActive: z.boolean() })
    .safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const { id, isActive } = parsed.data;
  try {
    await db
      .update(eventBatchSchedules)
      .set({ isActive, updatedById: me.id, updatedAt: new Date() })
      .where(eq(eventBatchSchedules.id, id));
    await reconcileBatchEvents(id);
    revalidate();
    return { ok: true };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}

/** Hard-delete a schedule and every generated calendar event it produced. */
export async function deleteBatchSchedule(id: string): Promise<ActionResult> {
  const { me } = await requireEventsAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!z.string().uuid().safeParse(id).success) return fail("Invalid id.");
  try {
    await db.delete(eventBatchSchedules).where(eq(eventBatchSchedules.id, id));
    // Schedule row is gone → reconcile now finds nothing and clears its blocks.
    await reconcileBatchEvents(id);
    revalidate();
    return { ok: true };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}
