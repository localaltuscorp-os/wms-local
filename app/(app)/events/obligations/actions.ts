"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { obligations, obligationCompletions } from "@/db/schema";
import { requireEventsAdmin } from "@/lib/monthly-events/access";
import { rateLimitOrError } from "@/lib/rate-limit";

const PATH = "/events/obligations";

export type ActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

/** Trim → null for optional free-text; empty string becomes null. */
const optText = z
  .preprocess(
    (v) => (typeof v === "string" ? v.trim() : v),
    z.string().max(2000).nullable().optional(),
  )
  .transform((s) => (s ? s : null));

/** Optional uuid FK — "" / null / undefined all collapse to null. */
const optUuid = z
  .preprocess(
    (v) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null),
    z.string().uuid().nullable(),
  );

// ── Obligation master CRUD ───────────────────────────────────────────────────

const ObligationFields = z.object({
  name: z.string().trim().min(1, "A name is required.").max(300),
  counterparty: optText,
  targetCount: z.coerce.number().int().min(1, "Target must be at least 1.").max(999),
  isCompulsory: z.coerce.boolean(),
  penaltyNote: optText,
  categoryId: optUuid,
});
const UpdateObligationSchema = ObligationFields.extend({ id: z.string().uuid() });

export async function createObligation(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const { me } = await requireEventsAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = ObligationFields.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");

  try {
    const [row] = await db
      .insert(obligations)
      .values({ ...parsed.data, cadence: "monthly", createdById: me.id })
      .returning({ id: obligations.id });
    revalidatePath(PATH);
    return { ok: true, id: row!.id };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}

export async function updateObligation(input: unknown): Promise<ActionResult> {
  const { me } = await requireEventsAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = UpdateObligationSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const { id, ...d } = parsed.data;

  try {
    await db
      .update(obligations)
      .set({ ...d, updatedById: me.id, updatedAt: new Date() })
      .where(eq(obligations.id, id));
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}

/** Soft-delete: archive the obligation (is_active=false) so its history and any
 *  tagged calendar events survive. */
export async function deleteObligation(id: string): Promise<ActionResult> {
  const { me } = await requireEventsAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!z.string().uuid().safeParse(id).success) return fail("Invalid id.");

  try {
    await db
      .update(obligations)
      .set({ isActive: false, updatedById: me.id, updatedAt: new Date() })
      .where(eq(obligations.id, id));
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}

/** Un-archive a soft-deleted obligation. */
export async function restoreObligation(id: string): Promise<ActionResult> {
  const { me } = await requireEventsAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!z.string().uuid().safeParse(id).success) return fail("Invalid id.");

  try {
    await db
      .update(obligations)
      .set({ isActive: true, updatedById: me.id, updatedAt: new Date() })
      .where(eq(obligations.id, id));
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}

// ── Manual completion override (the "bump" control) ──────────────────────────
// Effective count for a month = MAX(this manual override, auto-count of tagged
// calendar_events in that month). This writes only the manual override; the
// auto-count is computed live from calendar_events at read time.

const CompletionSchema = z.object({
  obligationId: z.string().uuid(),
  fyStartYear: z.coerce.number().int().min(2000).max(2100),
  periodMonth: z.coerce.number().int().min(1).max(12),
  completedCount: z.coerce.number().int().min(0).max(999),
  note: optText,
});

/**
 * Upsert the manual override for one (obligation, FY, calendar-month) cell,
 * keyed on the unique (obligation_id, fy_start_year, period_month). When the
 * override is 0 with no note the row is deleted so the table stays sparse (the
 * auto-count still drives the effective value).
 */
export async function setObligationCompletion(
  input: unknown,
): Promise<ActionResult> {
  const { me } = await requireEventsAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = CompletionSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const { obligationId, fyStartYear, periodMonth, completedCount, note } = parsed.data;

  try {
    if (completedCount === 0 && note === null) {
      await db
        .delete(obligationCompletions)
        .where(
          and(
            eq(obligationCompletions.obligationId, obligationId),
            eq(obligationCompletions.fyStartYear, fyStartYear),
            eq(obligationCompletions.periodMonth, periodMonth),
          ),
        );
      revalidatePath(PATH);
      return { ok: true };
    }

    await db
      .insert(obligationCompletions)
      .values({
        obligationId,
        fyStartYear,
        periodMonth,
        completedCount,
        note,
        createdById: me.id,
      })
      .onConflictDoUpdate({
        target: [
          obligationCompletions.obligationId,
          obligationCompletions.fyStartYear,
          obligationCompletions.periodMonth,
        ],
        set: { completedCount, note, updatedById: me.id, updatedAt: new Date() },
      });
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}
