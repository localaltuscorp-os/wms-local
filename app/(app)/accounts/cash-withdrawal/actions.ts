"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { accountsCashItems, accountsCashMonths, accountsCashLimits } from "@/db/schema";
import { requireAccountsAccess } from "@/lib/accounts/access";
import { rateLimitOrError } from "@/lib/rate-limit";
import { parseAmount } from "@/lib/accounts/amounts";

const PATH = "/accounts/cash-withdrawal";

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

// ── Withdrawal items ──────────────────────────────────────────────────────────
const ItemFields = z.object({
  fyStartYear: fyYear,
  code: optText,
  entity: optText,
  nameOnCheque: optText,
  chequeNo: optText,
  chqDate: optText,
  amount: z.any(),
});
const UpdateSchema = ItemFields.omit({ fyStartYear: true }).extend({ id: z.string().uuid() });

export async function createCashItem(input: unknown): Promise<ActionResult<{ id: string }>> {
  const { me } = await requireAccountsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = ItemFields.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const d = parsed.data;
  try {
    const maxRows = (await db
      .select({ next: sql<number>`COALESCE(MAX(${accountsCashItems.sortOrder}), 0) + 1` })
      .from(accountsCashItems)
      .where(eq(accountsCashItems.fyStartYear, d.fyStartYear))) as Array<{ next: number }>;
    const [row] = await db
      .insert(accountsCashItems)
      .values({
        fyStartYear: d.fyStartYear, code: d.code, entity: d.entity, nameOnCheque: d.nameOnCheque,
        chequeNo: d.chequeNo, chqDate: d.chqDate, amount: amt(d.amount), sortOrder: maxRows[0]?.next ?? 1, createdById: me.id,
      })
      .returning({ id: accountsCashItems.id });
    revalidatePath(PATH);
    return { ok: true, id: row!.id };
  } catch (err) { return fail(err instanceof Error ? err.message : String(err)); }
}

export async function updateCashItem(input: unknown): Promise<ActionResult> {
  const { me } = await requireAccountsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = UpdateSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const { id, ...d } = parsed.data;
  try {
    await db.update(accountsCashItems).set({
      code: d.code, entity: d.entity, nameOnCheque: d.nameOnCheque, chequeNo: d.chequeNo,
      chqDate: d.chqDate, amount: amt(d.amount), updatedAt: new Date(),
    }).where(eq(accountsCashItems.id, id));
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) { return fail(err instanceof Error ? err.message : String(err)); }
}

export async function deleteCashItem(id: string): Promise<ActionResult> {
  const { me } = await requireAccountsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!z.string().uuid().safeParse(id).success) return fail("Invalid id.");
  try {
    await db.update(accountsCashItems).set({ archived: true, updatedAt: new Date() }).where(eq(accountsCashItems.id, id));
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) { return fail(err instanceof Error ? err.message : String(err)); }
}

const MonthSchema = z.object({ itemId: z.string().uuid(), month: z.number().int().min(1).max(12), amount: z.any() });

export async function setCashMonth(input: unknown): Promise<ActionResult> {
  const { me } = await requireAccountsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = MonthSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const { itemId, month } = parsed.data;
  const amount = amt(parsed.data.amount);
  try {
    if (amount === null) {
      await db.delete(accountsCashMonths).where(and(eq(accountsCashMonths.itemId, itemId), eq(accountsCashMonths.month, month)));
      revalidatePath(PATH);
      return { ok: true };
    }
    await db.insert(accountsCashMonths).values({ itemId, month, amount, updatedById: me.id })
      .onConflictDoUpdate({ target: [accountsCashMonths.itemId, accountsCashMonths.month], set: { amount, updatedById: me.id, updatedAt: new Date() } });
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) { return fail(err instanceof Error ? err.message : String(err)); }
}

// ── Per-entity caps ─────────────────────────────────────────────────────────
const LimitSchema = z.object({ fyStartYear: fyYear, entity: z.string().trim().min(1, "Entity is required.").max(200), maxAllowed: z.any() });

export async function setCashLimit(input: unknown): Promise<ActionResult> {
  const { me } = await requireAccountsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = LimitSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const { fyStartYear, entity } = parsed.data;
  const maxAllowed = amt(parsed.data.maxAllowed);
  try {
    const maxRows = (await db
      .select({ next: sql<number>`COALESCE(MAX(${accountsCashLimits.sortOrder}), 0) + 1` })
      .from(accountsCashLimits).where(eq(accountsCashLimits.fyStartYear, fyStartYear))) as Array<{ next: number }>;
    await db.insert(accountsCashLimits)
      .values({ fyStartYear, entity, maxAllowed, sortOrder: maxRows[0]?.next ?? 1, createdById: me.id })
      .onConflictDoUpdate({ target: [accountsCashLimits.fyStartYear, accountsCashLimits.entity], set: { maxAllowed, archived: false, updatedAt: new Date() } });
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) { return fail(err instanceof Error ? err.message : String(err)); }
}

export async function deleteCashLimit(id: string): Promise<ActionResult> {
  const { me } = await requireAccountsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!z.string().uuid().safeParse(id).success) return fail("Invalid id.");
  try {
    await db.update(accountsCashLimits).set({ archived: true, updatedAt: new Date() }).where(eq(accountsCashLimits.id, id));
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) { return fail(err instanceof Error ? err.message : String(err)); }
}
