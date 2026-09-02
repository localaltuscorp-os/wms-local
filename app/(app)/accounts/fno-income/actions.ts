"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { accountsFnoItems, accountsFnoMonths } from "@/db/schema";
import { requireAccountsAccess } from "@/lib/accounts/access";
import { rateLimitOrError } from "@/lib/rate-limit";
import { parseAmount } from "@/lib/accounts/amounts";

const PATH = "/accounts/fno-income";

export type ActionResult<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };
function fail(error: string): { ok: false; error: string } { return { ok: false, error }; }

const optText = z
  .preprocess((v) => (typeof v === "string" ? v.trim() : v), z.string().max(2000).nullable().optional())
  .transform((s) => (s ? s : null));

function amt(v: unknown): string | null {
  const n = parseAmount(typeof v === "string" || typeof v === "number" ? v : null);
  return n === null ? null : String(n);
}

const fyYear = z.number().int().min(2000).max(2100);

const ItemFields = z.object({
  fyStartYear: fyYear,
  code: optText,
  entity: optText,
  agency: z.string().trim().min(1, "An agency is required.").max(2000),
  capital: z.any(),
});
const UpdateSchema = ItemFields.omit({ fyStartYear: true }).extend({ id: z.string().uuid() });

export async function createFnoItem(input: unknown): Promise<ActionResult<{ id: string }>> {
  const { me } = await requireAccountsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = ItemFields.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const d = parsed.data;
  try {
    const maxRows = (await db
      .select({ next: sql<number>`COALESCE(MAX(${accountsFnoItems.sortOrder}), 0) + 1` })
      .from(accountsFnoItems)
      .where(eq(accountsFnoItems.fyStartYear, d.fyStartYear))) as Array<{ next: number }>;
    const [row] = await db
      .insert(accountsFnoItems)
      .values({
        fyStartYear: d.fyStartYear, code: d.code, entity: d.entity, agency: d.agency,
        capital: amt(d.capital), sortOrder: maxRows[0]?.next ?? 1, createdById: me.id,
      })
      .returning({ id: accountsFnoItems.id });
    revalidatePath(PATH);
    return { ok: true, id: row!.id };
  } catch (err) { return fail(err instanceof Error ? err.message : String(err)); }
}

export async function updateFnoItem(input: unknown): Promise<ActionResult> {
  const { me } = await requireAccountsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = UpdateSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const { id, ...d } = parsed.data;
  try {
    await db.update(accountsFnoItems).set({
      code: d.code, entity: d.entity, agency: d.agency, capital: amt(d.capital), updatedAt: new Date(),
    }).where(eq(accountsFnoItems.id, id));
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) { return fail(err instanceof Error ? err.message : String(err)); }
}

export async function deleteFnoItem(id: string): Promise<ActionResult> {
  const { me } = await requireAccountsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!z.string().uuid().safeParse(id).success) return fail("Invalid id.");
  try {
    await db.update(accountsFnoItems).set({ archived: true, updatedAt: new Date() }).where(eq(accountsFnoItems.id, id));
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) { return fail(err instanceof Error ? err.message : String(err)); }
}

const MonthSchema = z.object({
  itemId: z.string().uuid(),
  month: z.number().int().min(1).max(12),
  amount: z.any(),
});

export async function setFnoMonth(input: unknown): Promise<ActionResult> {
  const { me } = await requireAccountsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = MonthSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const { itemId, month } = parsed.data;
  const amount = amt(parsed.data.amount);
  try {
    if (amount === null) {
      await db.delete(accountsFnoMonths).where(and(eq(accountsFnoMonths.itemId, itemId), eq(accountsFnoMonths.month, month)));
      revalidatePath(PATH);
      return { ok: true };
    }
    await db
      .insert(accountsFnoMonths)
      .values({ itemId, month, amount, updatedById: me.id })
      .onConflictDoUpdate({ target: [accountsFnoMonths.itemId, accountsFnoMonths.month], set: { amount, updatedById: me.id, updatedAt: new Date() } });
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) { return fail(err instanceof Error ? err.message : String(err)); }
}
