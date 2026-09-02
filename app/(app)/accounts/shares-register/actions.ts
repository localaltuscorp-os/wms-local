"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { accountsShares } from "@/db/schema";
import { requireAccountsAccess } from "@/lib/accounts/access";
import { rateLimitOrError } from "@/lib/rate-limit";
import { parseAmount } from "@/lib/accounts/amounts";

const PATH = "/accounts/shares-register";

export type ActionResult<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };
function fail(error: string): { ok: false; error: string } { return { ok: false, error }; }

const optText = z
  .preprocess((v) => (typeof v === "string" ? v.trim() : v), z.string().max(4000).nullable().optional())
  .transform((s) => (s ? s : null));
function amt(v: unknown): string | null {
  const n = parseAmount(typeof v === "string" || typeof v === "number" ? v : null);
  return n === null ? null : String(n);
}

const Fields = z.object({
  code: optText,
  entity: optText,
  company: z.string().trim().min(1, "A company is required.").max(2000),
  folioDemat: optText,
  qty: z.any(),
  rate: z.any(),
  value: z.any(),
  txnDate: optText,
  notes: optText,
});
const UpdateSchema = Fields.extend({ id: z.string().uuid() });

function vals(d: z.infer<typeof Fields>) {
  return {
    code: d.code, entity: d.entity, company: d.company, folioDemat: d.folioDemat,
    qty: amt(d.qty), rate: amt(d.rate), value: amt(d.value), txnDate: d.txnDate, notes: d.notes,
  };
}

export async function createShare(input: unknown): Promise<ActionResult<{ id: string }>> {
  const { me } = await requireAccountsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = Fields.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  try {
    const maxRows = (await db.select({ next: sql<number>`COALESCE(MAX(${accountsShares.sortOrder}), 0) + 1` }).from(accountsShares)) as Array<{ next: number }>;
    const [row] = await db.insert(accountsShares).values({ ...vals(parsed.data), sortOrder: maxRows[0]?.next ?? 1, createdById: me.id }).returning({ id: accountsShares.id });
    revalidatePath(PATH);
    return { ok: true, id: row!.id };
  } catch (err) { return fail(err instanceof Error ? err.message : String(err)); }
}

export async function updateShare(input: unknown): Promise<ActionResult> {
  const { me } = await requireAccountsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = UpdateSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const { id, ...d } = parsed.data;
  try {
    await db.update(accountsShares).set({ ...vals(d), updatedAt: new Date() }).where(eq(accountsShares.id, id));
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) { return fail(err instanceof Error ? err.message : String(err)); }
}

export async function deleteShare(id: string): Promise<ActionResult> {
  const { me } = await requireAccountsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!z.string().uuid().safeParse(id).success) return fail("Invalid id.");
  try {
    await db.update(accountsShares).set({ archived: true, updatedAt: new Date() }).where(eq(accountsShares.id, id));
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) { return fail(err instanceof Error ? err.message : String(err)); }
}
