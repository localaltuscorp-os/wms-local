import "server-only";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  outstandingProducts,
  outstandingEntitiesTbl,
  outstandingPaymentModes,
  outstandingResponsibles,
  designations,
  payingEntities,
} from "@/db/schema";
import { requireAdmin } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";

export type ActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

/**
 * The three outstanding roster tables share an identical column shape
 * (name unique, isActive, sortOrder). This union lets one helper serve
 * all three admin action files. We constrain to the concrete tables so
 * Drizzle's typed insert/update still work.
 */
type RosterTable =
  | typeof outstandingProducts
  | typeof outstandingEntitiesTbl
  | typeof outstandingPaymentModes
  | typeof outstandingResponsibles
  | typeof designations
  | typeof payingEntities;

const NameSchema = z
  .string()
  .trim()
  .min(1, "Name is required")
  .max(120, "Name is too long");

const CreateSchema = z
  .object({
    name: NameSchema,
    sortOrder: z.number().int().min(0).max(9999).optional(),
  })
  .strict();

const UpdateSchema = z
  .object({
    name: NameSchema.optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().min(0).max(9999).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "No changes to save." });

export type CreateRosterInput = z.infer<typeof CreateSchema>;
export type UpdateRosterInput = z.infer<typeof UpdateSchema>;

/**
 * Create a roster row (admin). Rejects case-insensitive duplicates up
 * front so the unique constraint never surfaces as a raw DB error.
 * NOTE: no settingsEvents audit row — these rosters are low-stakes
 * lookup lists; we keep the helper simple and skip the audit trail.
 */
export async function createRosterItem(
  table: RosterTable,
  revalidatePaths: string[],
  input: CreateRosterInput,
): Promise<ActionResult<{ id: string }>> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = CreateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const existing = await db
    .select({ id: table.id })
    .from(table)
    .where(sql`lower(${table.name}) = lower(${parsed.data.name})`)
    .limit(1);
  if (existing[0]) {
    return { ok: false, error: "An item with this name already exists." };
  }

  let inserted;
  try {
    [inserted] = await db
      .insert(table)
      .values({
        name: parsed.data.name,
        sortOrder: parsed.data.sortOrder ?? 100,
      })
      .returning({ id: table.id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }
  if (!inserted) return { ok: false, error: "DB: insert returned no row" };

  for (const p of revalidatePaths) revalidatePath(p);
  return { ok: true, id: inserted.id };
}

/**
 * Update a roster row (admin). A rename is blocked if it collides
 * (case-insensitive) with another row.
 */
export async function updateRosterItem(
  table: RosterTable,
  revalidatePaths: string[],
  id: string,
  fields: UpdateRosterInput,
): Promise<ActionResult> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, error: "Invalid id" };
  }

  const parsed = UpdateSchema.safeParse(fields);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const existing = await db
    .select({ id: table.id, name: table.name })
    .from(table)
    .where(eq(table.id, id))
    .limit(1);
  const current = existing[0];
  if (!current) return { ok: false, error: "Item not found" };

  if (parsed.data.name !== undefined && parsed.data.name !== current.name) {
    const clash = await db
      .select({ id: table.id })
      .from(table)
      .where(sql`lower(${table.name}) = lower(${parsed.data.name})`)
      .limit(1);
    if (clash[0] && clash[0].id !== current.id) {
      return { ok: false, error: "An item with this name already exists." };
    }
  }

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.name !== undefined) patch.name = parsed.data.name;
  if (parsed.data.isActive !== undefined) patch.isActive = parsed.data.isActive;
  if (parsed.data.sortOrder !== undefined) patch.sortOrder = parsed.data.sortOrder;

  try {
    await db.update(table).set(patch).where(eq(table.id, current.id));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  for (const p of revalidatePaths) revalidatePath(p);
  return { ok: true };
}
