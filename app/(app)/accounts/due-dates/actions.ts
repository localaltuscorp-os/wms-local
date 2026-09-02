"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { accountsDueItems } from "@/db/schema";
import { requireAccountsAccess } from "@/lib/accounts/access";
import { rateLimitOrError } from "@/lib/rate-limit";

const PATH = "/accounts/due-dates";

export type ActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

const optText = z
  .preprocess(
    (v) => (typeof v === "string" ? v.trim() : v),
    z.string().max(4000).nullable().optional(),
  )
  .transform((s) => (s ? s : null));

const ItemFields = z.object({
  code: optText,
  area: optText,
  compliance: z.string().trim().min(1, "A name is required.").max(2000),
  frequency: optText,
  ecs: optText,
  ecsFrom: optText,
  statementPeriod: optText,
  statementDate: optText,
  dueDate: optText,
  softCopyAutoEmail: optText,
  hardCopy: optText,
  softCopy: optText,
  tallyEntry: optText,
  balanceTally: optText,
  paidDate: optText,
  paidAmt: optText,
  intFinChgs: optText,
  chgReversed: optText,
  notes: optText,
});
const UpdateSchema = ItemFields.extend({ id: z.string().uuid() });

export async function createDueItem(input: unknown): Promise<ActionResult<{ id: string }>> {
  const { me } = await requireAccountsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = ItemFields.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");

  try {
    const maxRows = (await db
      .select({ next: sql<number>`COALESCE(MAX(${accountsDueItems.sortOrder}), 0) + 1` })
      .from(accountsDueItems)) as Array<{ next: number }>;
    const [row] = await db
      .insert(accountsDueItems)
      .values({ ...parsed.data, sortOrder: maxRows[0]?.next ?? 1, createdById: me.id })
      .returning({ id: accountsDueItems.id });
    revalidatePath(PATH);
    return { ok: true, id: row!.id };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}

export async function updateDueItem(input: unknown): Promise<ActionResult> {
  const { me } = await requireAccountsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = UpdateSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const { id, ...d } = parsed.data;

  try {
    await db
      .update(accountsDueItems)
      .set({ ...d, updatedAt: new Date() })
      .where(eq(accountsDueItems.id, id));
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}

export async function deleteDueItem(id: string): Promise<ActionResult> {
  const { me } = await requireAccountsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!z.string().uuid().safeParse(id).success) return fail("Invalid id.");

  try {
    await db
      .update(accountsDueItems)
      .set({ archived: true, updatedAt: new Date() })
      .where(eq(accountsDueItems.id, id));
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}
