"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { accountsBankItems, accountsBankWeeks, accountsBankBalances } from "@/db/schema";
import { requireAccountsAccess } from "@/lib/accounts/access";
import { rateLimitOrError } from "@/lib/rate-limit";
import { parseAmount } from "@/lib/accounts/amounts";

const PATH = "/accounts/bank-balance";

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

// ── Entities / items ──────────────────────────────────────────────────────────
const ItemFields = z.object({
  fyStartYear: fyYear,
  code: optText,
  entity: z.string().trim().min(1, "An entity is required.").max(200),
  targetBalance: z.any(),
});
const UpdateSchema = ItemFields.omit({ fyStartYear: true }).extend({ id: z.string().uuid() });

export async function createBankItem(input: unknown): Promise<ActionResult<{ id: string }>> {
  const { me } = await requireAccountsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = ItemFields.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const d = parsed.data;
  try {
    const maxRows = (await db
      .select({ next: sql<number>`COALESCE(MAX(${accountsBankItems.sortOrder}), 0) + 1` })
      .from(accountsBankItems).where(eq(accountsBankItems.fyStartYear, d.fyStartYear))) as Array<{ next: number }>;
    const [row] = await db.insert(accountsBankItems)
      .values({ fyStartYear: d.fyStartYear, code: d.code, entity: d.entity, targetBalance: amt(d.targetBalance), sortOrder: maxRows[0]?.next ?? 1, createdById: me.id })
      .returning({ id: accountsBankItems.id });
    revalidatePath(PATH);
    return { ok: true, id: row!.id };
  } catch (err) { return fail(err instanceof Error ? err.message : String(err)); }
}

export async function updateBankItem(input: unknown): Promise<ActionResult> {
  const { me } = await requireAccountsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = UpdateSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const { id, ...d } = parsed.data;
  try {
    await db.update(accountsBankItems).set({ code: d.code, entity: d.entity, targetBalance: amt(d.targetBalance), updatedAt: new Date() }).where(eq(accountsBankItems.id, id));
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) { return fail(err instanceof Error ? err.message : String(err)); }
}

export async function deleteBankItem(id: string): Promise<ActionResult> {
  const { me } = await requireAccountsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!z.string().uuid().safeParse(id).success) return fail("Invalid id.");
  try {
    await db.update(accountsBankItems).set({ archived: true, updatedAt: new Date() }).where(eq(accountsBankItems.id, id));
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) { return fail(err instanceof Error ? err.message : String(err)); }
}

// ── Week columns ──────────────────────────────────────────────────────────────
export async function createBankWeek(input: unknown): Promise<ActionResult<{ id: string }>> {
  const { me } = await requireAccountsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = z.object({ fyStartYear: fyYear, label: z.string().trim().min(1, "A label is required.").max(100) }).safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const { fyStartYear, label } = parsed.data;
  try {
    const maxRows = (await db
      .select({ next: sql<number>`COALESCE(MAX(${accountsBankWeeks.sortOrder}), 0) + 1` })
      .from(accountsBankWeeks).where(eq(accountsBankWeeks.fyStartYear, fyStartYear))) as Array<{ next: number }>;
    const [row] = await db.insert(accountsBankWeeks)
      .values({ fyStartYear, label, sortOrder: maxRows[0]?.next ?? 1, createdById: me.id })
      .returning({ id: accountsBankWeeks.id });
    revalidatePath(PATH);
    return { ok: true, id: row!.id };
  } catch (err) { return fail(err instanceof Error ? err.message : String(err)); }
}

export async function renameBankWeek(input: unknown): Promise<ActionResult> {
  const { me } = await requireAccountsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = z.object({ id: z.string().uuid(), label: z.string().trim().min(1).max(100) }).safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  try {
    await db.update(accountsBankWeeks).set({ label: parsed.data.label, updatedAt: new Date() }).where(eq(accountsBankWeeks.id, parsed.data.id));
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) { return fail(err instanceof Error ? err.message : String(err)); }
}

export async function deleteBankWeek(id: string): Promise<ActionResult> {
  const { me } = await requireAccountsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!z.string().uuid().safeParse(id).success) return fail("Invalid id.");
  try {
    await db.update(accountsBankWeeks).set({ archived: true, updatedAt: new Date() }).where(eq(accountsBankWeeks.id, id));
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) { return fail(err instanceof Error ? err.message : String(err)); }
}

// ── Balance cells ─────────────────────────────────────────────────────────────
const BalanceSchema = z.object({ itemId: z.string().uuid(), weekId: z.string().uuid(), balance: z.any() });

export async function setBankBalance(input: unknown): Promise<ActionResult> {
  const { me } = await requireAccountsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = BalanceSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const { itemId, weekId } = parsed.data;
  const balance = amt(parsed.data.balance);
  try {
    if (balance === null) {
      await db.delete(accountsBankBalances).where(and(eq(accountsBankBalances.itemId, itemId), eq(accountsBankBalances.weekId, weekId)));
      revalidatePath(PATH);
      return { ok: true };
    }
    await db.insert(accountsBankBalances).values({ itemId, weekId, balance, updatedById: me.id })
      .onConflictDoUpdate({ target: [accountsBankBalances.itemId, accountsBankBalances.weekId], set: { balance, updatedById: me.id, updatedAt: new Date() } });
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) { return fail(err instanceof Error ? err.message : String(err)); }
}
