"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { accountsMonthlyItems, accountsMonthlyChecks } from "@/db/schema";
import { requireAccountsAccess } from "@/lib/accounts/access";
import { rateLimitOrError } from "@/lib/rate-limit";
import { MONTHLY_CHECK_STATUSES } from "@/lib/accounts/monthly";

const PATH = "/accounts/monthly-quarterly-annual";

export type ActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

// Empty strings from the inline editor collapse to null.
const optText = z
  .preprocess(
    (v) => (typeof v === "string" ? v.trim() : v),
    z.string().max(4000).nullable().optional(),
  )
  .transform((s) => (s ? s : null));

const optMonth = z
  .preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
    z.number().int().min(1).max(12).nullable(),
  );

const ItemFields = z.object({
  code: optText,
  title: z.string().trim().min(1, "A title is required.").max(2000),
  responsiblePerson: optText,
  deadline: optText,
  type: optText,
  accountsNotes: optText,
  mananNotes: optText,
  fileLink: optText,
  frequency: optText,
  dueMonth: optMonth,
});
const UpdateItemSchema = ItemFields.extend({ id: z.string().uuid() });

// ── Item CRUD ─────────────────────────────────────────────────────────────────

export async function createMonthlyItem(input: unknown): Promise<ActionResult<{ id: string }>> {
  const { me } = await requireAccountsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = ItemFields.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const d = parsed.data;

  try {
    const maxRows = (await db
      .select({ next: sql<number>`COALESCE(MAX(${accountsMonthlyItems.sortOrder}), 0) + 1` })
      .from(accountsMonthlyItems)) as Array<{ next: number }>;
    const next = maxRows[0]?.next ?? 1;

    const [row] = await db
      .insert(accountsMonthlyItems)
      .values({
        code: d.code,
        title: d.title,
        responsiblePerson: d.responsiblePerson,
        deadline: d.deadline,
        type: d.type,
        accountsNotes: d.accountsNotes,
        mananNotes: d.mananNotes,
        fileLink: d.fileLink,
        frequency: d.frequency,
        dueMonth: d.dueMonth,
        sortOrder: next,
        createdById: me.id,
      })
      .returning({ id: accountsMonthlyItems.id });
    revalidatePath(PATH);
    return { ok: true, id: row!.id };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}

export async function updateMonthlyItem(input: unknown): Promise<ActionResult> {
  const { me } = await requireAccountsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = UpdateItemSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const { id, ...d } = parsed.data;

  try {
    await db
      .update(accountsMonthlyItems)
      .set({
        code: d.code,
        title: d.title,
        responsiblePerson: d.responsiblePerson,
        deadline: d.deadline,
        type: d.type,
        accountsNotes: d.accountsNotes,
        mananNotes: d.mananNotes,
        fileLink: d.fileLink,
        frequency: d.frequency,
        dueMonth: d.dueMonth,
        updatedAt: new Date(),
      })
      .where(eq(accountsMonthlyItems.id, id));
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}

export async function deleteMonthlyItem(id: string): Promise<ActionResult> {
  const { me } = await requireAccountsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!z.string().uuid().safeParse(id).success) return fail("Invalid id.");

  try {
    // Soft archive — keep the row (and its check history) rather than hard-delete.
    await db
      .update(accountsMonthlyItems)
      .set({ archived: true, updatedAt: new Date() })
      .where(eq(accountsMonthlyItems.id, id));
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}

// ── Per-month completion status ────────────────────────────────────────────────

const SetCheckSchema = z.object({
  itemId: z.string().uuid(),
  fyStartYear: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  // "" clears the cell; otherwise must be one of the closed status set.
  status: z
    .string()
    .trim()
    .refine((s) => s === "" || (MONTHLY_CHECK_STATUSES as readonly string[]).includes(s), "Invalid status."),
});

/**
 * Upsert (or clear) a single month's completion status for an item. An empty
 * status deletes the cell so the grid stays sparse.
 */
export async function setMonthlyCheck(input: unknown): Promise<ActionResult> {
  const { me } = await requireAccountsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = SetCheckSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const { itemId, fyStartYear, month, status } = parsed.data;

  try {
    if (status === "") {
      await db
        .delete(accountsMonthlyChecks)
        .where(
          and(
            eq(accountsMonthlyChecks.itemId, itemId),
            eq(accountsMonthlyChecks.fyStartYear, fyStartYear),
            eq(accountsMonthlyChecks.month, month),
          ),
        );
      revalidatePath(PATH);
      return { ok: true };
    }

    await db
      .insert(accountsMonthlyChecks)
      .values({ itemId, fyStartYear, month, status, updatedById: me.id })
      .onConflictDoUpdate({
        target: [
          accountsMonthlyChecks.itemId,
          accountsMonthlyChecks.fyStartYear,
          accountsMonthlyChecks.month,
        ],
        set: { status, updatedById: me.id, updatedAt: new Date() },
      });
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}
