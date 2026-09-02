"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { accountsLoanItems, accountsLoanPeriods, accountsLoanCells } from "@/db/schema";
import { requireAccountsAccess } from "@/lib/accounts/access";
import { rateLimitOrError } from "@/lib/rate-limit";
import { parseAmount } from "@/lib/accounts/amounts";

const PATH = "/accounts/sip-tracker";

export type ActionResult<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };
function fail(error: string): { ok: false; error: string } { return { ok: false, error }; }

const optText = z
  .preprocess((v) => (typeof v === "string" ? v.trim() : v), z.string().max(2000).nullable().optional())
  .transform((s) => (s ? s : null));
function amt(v: unknown): string | null {
  const n = parseAmount(typeof v === "string" || typeof v === "number" ? v : null);
  return n === null ? null : String(n);
}

// ── Loan rows ─────────────────────────────────────────────────────────────────
const ItemFields = z.object({
  code: optText,
  entity: optText,
  loanName: z.string().trim().min(1, "A loan name is required.").max(2000),
  location: optText,
  emiDate: optText,
});
const UpdateItem = ItemFields.extend({ id: z.string().uuid() });

export async function createLoanItem(input: unknown): Promise<ActionResult<{ id: string }>> {
  const { me } = await requireAccountsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = ItemFields.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const d = parsed.data;
  try {
    const maxRows = (await db.select({ next: sql<number>`COALESCE(MAX(${accountsLoanItems.sortOrder}), 0) + 1` }).from(accountsLoanItems)) as Array<{ next: number }>;
    const [row] = await db.insert(accountsLoanItems).values({ code: d.code, entity: d.entity, loanName: d.loanName, location: d.location, emiDate: d.emiDate, sortOrder: maxRows[0]?.next ?? 1, createdById: me.id }).returning({ id: accountsLoanItems.id });
    revalidatePath(PATH);
    return { ok: true, id: row!.id };
  } catch (err) { return fail(err instanceof Error ? err.message : String(err)); }
}

export async function updateLoanItem(input: unknown): Promise<ActionResult> {
  const { me } = await requireAccountsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = UpdateItem.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const { id, ...d } = parsed.data;
  try {
    await db.update(accountsLoanItems).set({ code: d.code, entity: d.entity, loanName: d.loanName, location: d.location, emiDate: d.emiDate, updatedAt: new Date() }).where(eq(accountsLoanItems.id, id));
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) { return fail(err instanceof Error ? err.message : String(err)); }
}

export async function deleteLoanItem(id: string): Promise<ActionResult> {
  const { me } = await requireAccountsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!z.string().uuid().safeParse(id).success) return fail("Invalid id.");
  try {
    await db.update(accountsLoanItems).set({ archived: true, updatedAt: new Date() }).where(eq(accountsLoanItems.id, id));
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) { return fail(err instanceof Error ? err.message : String(err)); }
}

// ── Period columns ────────────────────────────────────────────────────────────
export async function createLoanPeriod(input: unknown): Promise<ActionResult<{ id: string }>> {
  const { me } = await requireAccountsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = z.object({ label: z.string().trim().min(1, "A label is required.").max(100) }).safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  try {
    const maxRows = (await db.select({ next: sql<number>`COALESCE(MAX(${accountsLoanPeriods.sortOrder}), 0) + 1` }).from(accountsLoanPeriods)) as Array<{ next: number }>;
    const [row] = await db.insert(accountsLoanPeriods).values({ label: parsed.data.label, sortOrder: maxRows[0]?.next ?? 1, createdById: me.id }).returning({ id: accountsLoanPeriods.id });
    revalidatePath(PATH);
    return { ok: true, id: row!.id };
  } catch (err) { return fail(err instanceof Error ? err.message : String(err)); }
}

export async function deleteLoanPeriod(id: string): Promise<ActionResult> {
  const { me } = await requireAccountsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!z.string().uuid().safeParse(id).success) return fail("Invalid id.");
  try {
    await db.update(accountsLoanPeriods).set({ archived: true, updatedAt: new Date() }).where(eq(accountsLoanPeriods.id, id));
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) { return fail(err instanceof Error ? err.message : String(err)); }
}

// ── Cells (emi | closing_balance) ───────────────────────────────────────────
const CellSchema = z.object({
  loanId: z.string().uuid(),
  periodId: z.string().uuid(),
  field: z.enum(["emi", "closingBalance"]),
  value: z.any(),
});

export async function setLoanCell(input: unknown): Promise<ActionResult> {
  const { me } = await requireAccountsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = CellSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const { loanId, periodId, field } = parsed.data;
  const value = amt(parsed.data.value);
  const col = field === "emi" ? { emi: value } : { closingBalance: value };
  try {
    // Upsert the row, setting only the touched column.
    await db.insert(accountsLoanCells)
      .values({ loanId, periodId, ...col, updatedById: me.id })
      .onConflictDoUpdate({ target: [accountsLoanCells.loanId, accountsLoanCells.periodId], set: { ...col, updatedById: me.id, updatedAt: new Date() } });
    // If both values are now null, drop the row to keep the grid sparse.
    await db.delete(accountsLoanCells).where(and(
      eq(accountsLoanCells.loanId, loanId),
      eq(accountsLoanCells.periodId, periodId),
      sql`${accountsLoanCells.emi} is null`,
      sql`${accountsLoanCells.closingBalance} is null`,
    ));
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) { return fail(err instanceof Error ? err.message : String(err)); }
}
