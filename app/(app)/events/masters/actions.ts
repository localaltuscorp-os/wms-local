"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  eventCategories,
  eventBatchTypes,
  calendarEvents,
  eventBatchSchedules,
  obligations,
} from "@/db/schema";
import { requireEventsAdmin } from "@/lib/monthly-events/access";
import { rateLimitOrError } from "@/lib/rate-limit";

const PATH = "/events/masters";

export type ActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

/** Postgres unique-violation → a friendly message instead of the raw SQL. */
function dbError(err: unknown, dupMsg: string): { ok: false; error: string } {
  const msg = err instanceof Error ? err.message : String(err);
  if (/duplicate key|unique constraint|already exists/i.test(msg)) {
    return fail(dupMsg);
  }
  return fail(msg);
}

// ── validation ──────────────────────────────────────────────────────────────

const HEX = /^#[0-9a-fA-F]{6}$/;
const nameField = z
  .preprocess((v) => (typeof v === "string" ? v.trim() : v), z.string().min(1, "A name is required.").max(80));
const colorField = z
  .preprocess((v) => (typeof v === "string" ? v.trim().toLowerCase() : v), z.string().regex(HEX, "Pick a colour or enter a valid hex (#RRGGBB)."));
const idField = z.string().uuid("Invalid id.");
const optCategoryId = z
  .preprocess((v) => (v === "" || v == null ? null : v), z.string().uuid().nullable());

// ── categories ────────────────────────────────────────────────────────────

const CreateCategorySchema = z.object({ name: nameField, color: colorField });

export async function createCategory(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const { me } = await requireEventsAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = CreateCategorySchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  try {
    const [{ next } = { next: 1 }] = (await db
      .select({ next: sql<number>`COALESCE(MAX(${eventCategories.sortOrder}), 0) + 1` })
      .from(eventCategories)) as Array<{ next: number }>;
    const [row] = await db
      .insert(eventCategories)
      .values({ name: parsed.data.name, color: parsed.data.color, sortOrder: next, createdById: me.id })
      .returning({ id: eventCategories.id });
    revalidatePath(PATH);
    return { ok: true, id: row!.id };
  } catch (err) {
    return dbError(err, "A category with that name already exists.");
  }
}

const UpdateCategorySchema = z.object({ id: idField, name: nameField, color: colorField });

export async function updateCategory(input: unknown): Promise<ActionResult> {
  const { me } = await requireEventsAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = UpdateCategorySchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const { id, name, color } = parsed.data;
  try {
    await db
      .update(eventCategories)
      .set({ name, color, updatedById: me.id, updatedAt: new Date() })
      .where(eq(eventCategories.id, id));
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return dbError(err, "A category with that name already exists.");
  }
}

const ReorderSchema = z.object({ ids: z.array(idField).min(1) });

/** Persist a new drag-sorted order: sort_order = position in the list. */
export async function reorderCategories(input: unknown): Promise<ActionResult> {
  const { me } = await requireEventsAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = ReorderSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  try {
    const { ids } = parsed.data;
    await Promise.all(
      ids.map((id, i) =>
        db
          .update(eventCategories)
          .set({ sortOrder: (i + 1) * 10, updatedById: me.id, updatedAt: new Date() })
          .where(eq(eventCategories.id, id)),
      ),
    );
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}

const ArchiveSchema = z.object({
  id: idField,
  // "none"     → not in use (or caller chose to leave references dangling)
  // "reassign" → move every referencing row to reassignToId
  // "clear"    → null out the category on every referencing row
  mode: z.enum(["none", "reassign", "clear"]).default("none"),
  reassignToId: optCategoryId.optional(),
});

/**
 * Soft-archive a category (is_active=false). If it's in use the caller resolves
 * the references first via `mode`: reassign every calendar event / batch
 * schedule / obligation / batch-type-default to another category, or clear them.
 */
export async function archiveCategory(input: unknown): Promise<ActionResult> {
  const { me } = await requireEventsAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = ArchiveSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const { id, mode, reassignToId } = parsed.data;
  if (mode === "reassign") {
    if (!reassignToId) return fail("Choose a category to reassign to.");
    if (reassignToId === id) return fail("Choose a different category to reassign to.");
  }
  const target = mode === "reassign" ? reassignToId! : null;
  try {
    if (mode !== "none") {
      const stamp = { updatedById: me.id, updatedAt: new Date() };
      await Promise.all([
        db.update(calendarEvents).set({ categoryId: target, ...stamp }).where(eq(calendarEvents.categoryId, id)),
        db.update(eventBatchSchedules).set({ categoryId: target, ...stamp }).where(eq(eventBatchSchedules.categoryId, id)),
        db.update(obligations).set({ categoryId: target, ...stamp }).where(eq(obligations.categoryId, id)),
        db.update(eventBatchTypes).set({ defaultCategoryId: target, ...stamp }).where(eq(eventBatchTypes.defaultCategoryId, id)),
      ]);
    }
    await db
      .update(eventCategories)
      .set({ isActive: false, updatedById: me.id, updatedAt: new Date() })
      .where(eq(eventCategories.id, id));
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}

export async function restoreCategory(id: unknown): Promise<ActionResult> {
  const { me } = await requireEventsAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = idField.safeParse(id);
  if (!parsed.success) return fail("Invalid id.");
  try {
    await db
      .update(eventCategories)
      .set({ isActive: true, updatedById: me.id, updatedAt: new Date() })
      .where(eq(eventCategories.id, parsed.data));
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}

// ── batch types ─────────────────────────────────────────────────────────────

const CreateBatchTypeSchema = z.object({ name: nameField, defaultCategoryId: optCategoryId });

export async function createBatchType(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const { me } = await requireEventsAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = CreateBatchTypeSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  try {
    const [{ next } = { next: 1 }] = (await db
      .select({ next: sql<number>`COALESCE(MAX(${eventBatchTypes.sortOrder}), 0) + 1` })
      .from(eventBatchTypes)) as Array<{ next: number }>;
    const [row] = await db
      .insert(eventBatchTypes)
      .values({
        name: parsed.data.name,
        defaultCategoryId: parsed.data.defaultCategoryId,
        sortOrder: next,
        createdById: me.id,
      })
      .returning({ id: eventBatchTypes.id });
    revalidatePath(PATH);
    return { ok: true, id: row!.id };
  } catch (err) {
    return dbError(err, "A batch type with that name already exists.");
  }
}

const UpdateBatchTypeSchema = z.object({
  id: idField,
  name: nameField,
  defaultCategoryId: optCategoryId,
});

export async function updateBatchType(input: unknown): Promise<ActionResult> {
  const { me } = await requireEventsAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = UpdateBatchTypeSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const { id, name, defaultCategoryId } = parsed.data;
  try {
    await db
      .update(eventBatchTypes)
      .set({ name, defaultCategoryId, updatedById: me.id, updatedAt: new Date() })
      .where(eq(eventBatchTypes.id, id));
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return dbError(err, "A batch type with that name already exists.");
  }
}

const SetBatchTypeActiveSchema = z.object({ id: idField, isActive: z.boolean() });

/** Soft archive / restore a batch type. Existing schedules keep their FK. */
export async function setBatchTypeActive(input: unknown): Promise<ActionResult> {
  const { me } = await requireEventsAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = SetBatchTypeActiveSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const { id, isActive } = parsed.data;
  try {
    await db
      .update(eventBatchTypes)
      .set({ isActive, updatedById: me.id, updatedAt: new Date() })
      .where(eq(eventBatchTypes.id, id));
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}
