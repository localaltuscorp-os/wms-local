"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { accountsWeeklyItems, accountsWeeklyChecks } from "@/db/schema";
import { requireAccountsAccess } from "@/lib/accounts/access";
import { rateLimitOrError } from "@/lib/rate-limit";
import { WEEKLY_CHECK_STATUSES } from "@/lib/accounts/weekly";

const PATH = "/accounts/weekly-checklist";

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

const ItemFields = z.object({
  code: optText,
  title: z.string().trim().min(1, "A title is required.").max(2000),
  deadline: optText,
  category: optText,
  responsiblePerson: optText,
  accountsNotes: optText,
  mananNotes: optText,
  fileLink: optText,
  frequency: optText,
});
const UpdateItemSchema = ItemFields.extend({ id: z.string().uuid() });

// ── Item CRUD ─────────────────────────────────────────────────────────────────

export async function createWeeklyItem(input: unknown): Promise<ActionResult<{ id: string }>> {
  const { me } = await requireAccountsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = ItemFields.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const d = parsed.data;

  try {
    const maxRows = (await db
      .select({ next: sql<number>`COALESCE(MAX(${accountsWeeklyItems.sortOrder}), 0) + 1` })
      .from(accountsWeeklyItems)) as Array<{ next: number }>;
    const next = maxRows[0]?.next ?? 1;

    const [row] = await db
      .insert(accountsWeeklyItems)
      .values({
        code: d.code,
        title: d.title,
        deadline: d.deadline,
        category: d.category,
        responsiblePerson: d.responsiblePerson,
        accountsNotes: d.accountsNotes,
        mananNotes: d.mananNotes,
        fileLink: d.fileLink,
        frequency: d.frequency,
        sortOrder: next,
        createdById: me.id,
      })
      .returning({ id: accountsWeeklyItems.id });
    revalidatePath(PATH);
    return { ok: true, id: row!.id };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}

export async function updateWeeklyItem(input: unknown): Promise<ActionResult> {
  const { me } = await requireAccountsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = UpdateItemSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const { id, ...d } = parsed.data;

  try {
    await db
      .update(accountsWeeklyItems)
      .set({
        code: d.code,
        title: d.title,
        deadline: d.deadline,
        category: d.category,
        responsiblePerson: d.responsiblePerson,
        accountsNotes: d.accountsNotes,
        mananNotes: d.mananNotes,
        fileLink: d.fileLink,
        frequency: d.frequency,
        updatedAt: new Date(),
      })
      .where(eq(accountsWeeklyItems.id, id));
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}

export async function deleteWeeklyItem(id: string): Promise<ActionResult> {
  const { me } = await requireAccountsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!z.string().uuid().safeParse(id).success) return fail("Invalid id.");

  try {
    // Soft archive — keep the row (and its check history) rather than hard-delete.
    await db
      .update(accountsWeeklyItems)
      .set({ archived: true, updatedAt: new Date() })
      .where(eq(accountsWeeklyItems.id, id));
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}

// ── Per-week completion status ─────────────────────────────────────────────────

const SetCheckSchema = z.object({
  itemId: z.string().uuid(),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  weekNo: z.number().int().min(1).max(5),
  // "" clears the cell; otherwise must be one of the closed status set.
  status: z
    .string()
    .trim()
    .refine((s) => s === "" || (WEEKLY_CHECK_STATUSES as readonly string[]).includes(s), "Invalid status."),
});

/**
 * Upsert (or clear) a single week's completion status for an item. An empty
 * status deletes the cell so the grid stays sparse.
 */
export async function setWeeklyCheck(input: unknown): Promise<ActionResult> {
  const { me } = await requireAccountsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = SetCheckSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const { itemId, year, month, weekNo, status } = parsed.data;

  try {
    if (status === "") {
      await db
        .delete(accountsWeeklyChecks)
        .where(
          and(
            eq(accountsWeeklyChecks.itemId, itemId),
            eq(accountsWeeklyChecks.periodYear, year),
            eq(accountsWeeklyChecks.periodMonth, month),
            eq(accountsWeeklyChecks.weekNo, weekNo),
          ),
        );
      revalidatePath(PATH);
      return { ok: true };
    }

    await db
      .insert(accountsWeeklyChecks)
      .values({
        itemId,
        periodYear: year,
        periodMonth: month,
        weekNo,
        status,
        updatedById: me.id,
      })
      .onConflictDoUpdate({
        target: [
          accountsWeeklyChecks.itemId,
          accountsWeeklyChecks.periodYear,
          accountsWeeklyChecks.periodMonth,
          accountsWeeklyChecks.weekNo,
        ],
        set: { status, updatedById: me.id, updatedAt: new Date() },
      });
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}
