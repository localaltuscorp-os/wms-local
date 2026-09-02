"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { incentiveCatalog } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";

export type ActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

const PATH = "/incentive";
const UUID = z.string().uuid();

const EntrySchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2, "Name is required.").max(160),
  description: z.string().trim().max(500).optional().nullable(),
  amount: z.number().min(0).max(10_000_000),
  salesEligible: z.boolean(),
  internsEligible: z.boolean(),
  notes: z.string().trim().max(1000).optional().nullable(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  active: z.boolean().optional(),
});

/** Create or update one incentive-catalog entry. Admin-only. */
export async function upsertCatalogEntry(
  input: z.input<typeof EntrySchema>,
): Promise<ActionResult<{ id: string }>> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = EntrySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid entry." };
  }
  const v = parsed.data;
  const values = {
    name: v.name,
    description: v.description?.trim() || null,
    amount: v.amount.toFixed(2),
    salesEligible: v.salesEligible,
    internsEligible: v.internsEligible,
    notes: v.notes?.trim() || null,
    sortOrder: v.sortOrder ?? 100,
    active: v.active ?? true,
  };

  try {
    if (v.id) {
      await db.update(incentiveCatalog).set(values).where(eq(incentiveCatalog.id, v.id));
      revalidatePath(PATH);
      return { ok: true, id: v.id };
    }
    const [row] = await db
      .insert(incentiveCatalog)
      .values(values)
      .returning({ id: incentiveCatalog.id });
    revalidatePath(PATH);
    return { ok: true, id: row!.id };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // Unique-name collision surfaces a friendly message.
    if (/unique|duplicate/i.test(msg)) return { ok: false, error: "An incentive with that name already exists." };
    return { ok: false, error: `DB: ${msg}` };
  }
}

/** Delete one incentive-catalog entry. Admin-only. */
export async function deleteCatalogEntry(id: string): Promise<ActionResult> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!UUID.safeParse(id).success) return { ok: false, error: "Invalid entry." };

  try {
    await db.delete(incentiveCatalog).where(eq(incentiveCatalog.id, id));
  } catch (err: unknown) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
  revalidatePath(PATH);
  return { ok: true };
}
