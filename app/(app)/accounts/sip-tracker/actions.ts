"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { accountsSipItems, accountsSipMonths } from "@/db/schema";
import { requireAccountsAccess } from "@/lib/accounts/access";
import { rateLimitOrError } from "@/lib/rate-limit";
import { parseAmount } from "@/lib/accounts/amounts";

const PATH = "/accounts/sip-tracker";

export type ActionResult<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };
function fail(error: string): { ok: false; error: string } { return { ok: false, error }; }

const optText = z
  .preprocess((v) => (typeof v === "string" ? v.trim() : v), z.string().max(2000).nullable().optional())
  .transform((s) => (s ? s : null));

/** Coerce any amount-ish input to a clean numeric string for the numeric column. */
function amt(v: unknown): string | null {
  const n = parseAmount(typeof v === "string" || typeof v === "number" ? v : null);
  return n === null ? null : String(n);
}

const fyYear = z.number().int().min(2000).max(2100);

const ItemFields = z.object({
  fyStartYear: fyYear,
  code: optText,
  entity: optText,
  fundName: z.string().trim().min(1, "A fund name is required.").max(2000),
  location: optText,
  sipDate: optText,
  type: optText,
  amount: z.any(),
});
const UpdateSchema = ItemFields.omit({ fyStartYear: true }).extend({ id: z.string().uuid() });

export async function createSipItem(input: unknown): Promise<ActionResult<{ id: string }>> {
  const { me } = await requireAccountsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = ItemFields.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const d = parsed.data;
  try {
    const maxRows = (await db
      .select({ next: sql<number>`COALESCE(MAX(${accountsSipItems.sortOrder}), 0) + 1` })
      .from(accountsSipItems)
      .where(eq(accountsSipItems.fyStartYear, d.fyStartYear))) as Array<{ next: number }>;
    const [row] = await db
      .insert(accountsSipItems)
      .values({
        fyStartYear: d.fyStartYear, code: d.code, entity: d.entity, fundName: d.fundName,
        location: d.location, sipDate: d.sipDate, type: d.type, amount: amt(d.amount),
        sortOrder: maxRows[0]?.next ?? 1, createdById: me.id,
      })
      .returning({ id: accountsSipItems.id });
    revalidatePath(PATH);
    return { ok: true, id: row!.id };
  } catch (err) { return fail(err instanceof Error ? err.message : String(err)); }
}

export async function updateSipItem(input: unknown): Promise<ActionResult> {
  const { me } = await requireAccountsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = UpdateSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const { id, ...d } = parsed.data;
  try {
    await db.update(accountsSipItems).set({
      code: d.code, entity: d.entity, fundName: d.fundName, location: d.location,
      sipDate: d.sipDate, type: d.type, amount: amt(d.amount), updatedAt: new Date(),
    }).where(eq(accountsSipItems.id, id));
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) { return fail(err instanceof Error ? err.message : String(err)); }
}

export async function deleteSipItem(id: string): Promise<ActionResult> {
  const { me } = await requireAccountsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!z.string().uuid().safeParse(id).success) return fail("Invalid id.");
  try {
    await db.update(accountsSipItems).set({ archived: true, updatedAt: new Date() }).where(eq(accountsSipItems.id, id));
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) { return fail(err instanceof Error ? err.message : String(err)); }
}

const MonthSchema = z.object({
  itemId: z.string().uuid(),
  month: z.number().int().min(1).max(12),
  amount: z.any(),
});

export async function setSipMonth(input: unknown): Promise<ActionResult> {
  const { me } = await requireAccountsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = MonthSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const { itemId, month } = parsed.data;
  const amount = amt(parsed.data.amount);
  try {
    if (amount === null) {
      await db.delete(accountsSipMonths).where(and(eq(accountsSipMonths.itemId, itemId), eq(accountsSipMonths.month, month)));
      revalidatePath(PATH);
      return { ok: true };
    }
    await db
      .insert(accountsSipMonths)
      .values({ itemId, month, amount, updatedById: me.id })
      .onConflictDoUpdate({ target: [accountsSipMonths.itemId, accountsSipMonths.month], set: { amount, updatedById: me.id, updatedAt: new Date() } });
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) { return fail(err instanceof Error ? err.message : String(err)); }
}
