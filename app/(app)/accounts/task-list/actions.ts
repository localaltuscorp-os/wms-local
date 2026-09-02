"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { accountsTaskList, accountsScreenshots } from "@/db/schema";
import { requireAccountsAccess } from "@/lib/accounts/access";
import { rateLimitOrError } from "@/lib/rate-limit";

const PATH = "/accounts/task-list";

export type ActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

// ── Shared field coercion ───────────────────────────────────────────────────
// Empty strings from the inline editor become null; dates are kept as
// YYYY-MM-DD strings (the drizzle `date` column accepts them directly).
const optText = z
  .preprocess(
    (v) => (typeof v === "string" ? v.trim() : v),
    z.string().max(4000).nullable().optional(),
  )
  .transform((s) => (s ? s : null));

const optDate = z
  .preprocess(
    (v) => (typeof v === "string" ? v.trim() : v),
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/u, "Use a valid date.")
      .or(z.literal(""))
      .nullable()
      .optional(),
  )
  .transform((s) => (s ? s : null));

const optSrNo = z
  .union([z.number(), z.string(), z.null()])
  .optional()
  .transform((v) => {
    if (v === null || v === undefined || v === "") return null;
    const n = typeof v === "number" ? v : parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  });

// ── Task schemas ─────────────────────────────────────────────────────────────
const TaskFields = z.object({
  srNo: optSrNo,
  area: optText,
  taskDescription: optText,
  status: z.string().trim().min(1, "Status is required.").max(120),
  links: optText,
  targetDate: optDate,
  actualDate: optDate,
  gear: optText,
  notes: optText,
});
const UpdateTaskSchema = TaskFields.extend({ id: z.string().uuid() });

// ── Screenshot schemas ───────────────────────────────────────────────────────
const ShotFields = z.object({
  srNo: optSrNo,
  projectName: optText,
  projectDetails: optText,
  frequency: optText,
  targetDate: optDate,
  actualDate: optDate,
  gear: optText,
  notes: optText,
});
const UpdateShotSchema = ShotFields.extend({ id: z.string().uuid() });

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

// ── Tasks ────────────────────────────────────────────────────────────────────

export async function createTask(input: unknown): Promise<ActionResult<{ id: string }>> {
  const { me } = await requireAccountsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = TaskFields.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const d = parsed.data;

  try {
    // New rows sort to the bottom by default.
    const maxRows = (await db
      .select({ next: sql<number>`COALESCE(MAX(${accountsTaskList.sortOrder}), 0) + 1` })
      .from(accountsTaskList)) as Array<{ next: number }>;
    const next = maxRows[0]?.next ?? 1;

    const [row] = await db
      .insert(accountsTaskList)
      .values({
        srNo: d.srNo,
        area: d.area,
        taskDescription: d.taskDescription,
        status: d.status,
        links: d.links,
        targetDate: d.targetDate,
        actualDate: d.actualDate,
        gear: d.gear,
        notes: d.notes,
        sortOrder: next,
        createdById: me.id,
      })
      .returning({ id: accountsTaskList.id });
    revalidatePath(PATH);
    return { ok: true, id: row!.id };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}

export async function updateTask(input: unknown): Promise<ActionResult> {
  const { me } = await requireAccountsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = UpdateTaskSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const { id, ...d } = parsed.data;

  try {
    await db
      .update(accountsTaskList)
      .set({
        srNo: d.srNo,
        area: d.area,
        taskDescription: d.taskDescription,
        status: d.status,
        links: d.links,
        targetDate: d.targetDate,
        actualDate: d.actualDate,
        gear: d.gear,
        notes: d.notes,
        updatedAt: new Date(),
      })
      .where(eq(accountsTaskList.id, id));
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}

/** Lightweight inline patch — change just status and/or gear from the table. */
const QuickPatchSchema = z.object({
  id: z.string().uuid(),
  status: z.string().trim().min(1).max(120).optional(),
  gear: z.string().max(120).nullable().optional(),
});

export async function quickPatchTask(input: unknown): Promise<ActionResult> {
  const { me } = await requireAccountsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = QuickPatchSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const { id, status, gear } = parsed.data;

  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (status !== undefined) set.status = status;
  if (gear !== undefined) set.gear = gear === "" ? null : gear;
  if (Object.keys(set).length === 1) return { ok: true }; // nothing but updatedAt

  try {
    await db.update(accountsTaskList).set(set).where(eq(accountsTaskList.id, id));
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}

export async function deleteTask(id: string): Promise<ActionResult> {
  const { me } = await requireAccountsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!z.string().uuid().safeParse(id).success) return fail("Invalid id.");

  try {
    // Soft archive — preserve history rather than hard-delete.
    await db
      .update(accountsTaskList)
      .set({ archived: true, updatedAt: new Date() })
      .where(eq(accountsTaskList.id, id));
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}

// ── Screenshots to Post ──────────────────────────────────────────────────────

export async function createShot(input: unknown): Promise<ActionResult<{ id: string }>> {
  const { me } = await requireAccountsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = ShotFields.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const d = parsed.data;

  try {
    const maxRows = (await db
      .select({ next: sql<number>`COALESCE(MAX(${accountsScreenshots.sortOrder}), 0) + 1` })
      .from(accountsScreenshots)) as Array<{ next: number }>;
    const next = maxRows[0]?.next ?? 1;

    const [row] = await db
      .insert(accountsScreenshots)
      .values({
        srNo: d.srNo,
        projectName: d.projectName,
        projectDetails: d.projectDetails,
        frequency: d.frequency,
        targetDate: d.targetDate,
        actualDate: d.actualDate,
        gear: d.gear,
        notes: d.notes,
        sortOrder: next,
      })
      .returning({ id: accountsScreenshots.id });
    revalidatePath(PATH);
    return { ok: true, id: row!.id };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}

export async function updateShot(input: unknown): Promise<ActionResult> {
  const { me } = await requireAccountsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = UpdateShotSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const { id, ...d } = parsed.data;

  try {
    await db
      .update(accountsScreenshots)
      .set({
        srNo: d.srNo,
        projectName: d.projectName,
        projectDetails: d.projectDetails,
        frequency: d.frequency,
        targetDate: d.targetDate,
        actualDate: d.actualDate,
        gear: d.gear,
        notes: d.notes,
        updatedAt: new Date(),
      })
      .where(eq(accountsScreenshots.id, id));
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}

export async function deleteShot(id: string): Promise<ActionResult> {
  const { me } = await requireAccountsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!z.string().uuid().safeParse(id).success) return fail("Invalid id.");

  try {
    await db
      .update(accountsScreenshots)
      .set({ archived: true, updatedAt: new Date() })
      .where(eq(accountsScreenshots.id, id));
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}
