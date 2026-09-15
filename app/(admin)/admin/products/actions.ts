"use server";

import { revalidatePath, updateTag } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { outstandingProducts } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/current";
import { requireModuleEdit } from "@/lib/permissions/resolve";
import { rateLimitOrError } from "@/lib/rate-limit";
import { CACHE_TAGS } from "@/lib/cache-tags";

/**
 * THE PRODUCT MASTER — write paths.
 *
 * A dedicated action file rather than another caller of
 * `lib/outstanding/roster-actions.ts`, because products now carry a `code` that
 * the other four rosters do not. Widening the shared helper's schema with an
 * optional field would let a `code` be passed to entities, payment modes,
 * responsibles, designations and paying entities, where the column does not
 * exist — a runtime DB error reachable from five screens to serve one.
 *
 * Every mutation here:
 *   · requires admin (the layout requires it too; an action is not protected by
 *     the layout that rendered its button),
 *   · then asks the PERMISSION MATRIX for edit rights on `admin.masters.products`,
 *     which is what makes "Edit: NO" mean something for a POST rather than only
 *     for a hidden button,
 *   · busts the `products` cache tag, so Billing, the contract form and the
 *     `product` form-field MCQ all see the change at once instead of one screen
 *     at a time.
 */

const PATHS = ["/admin/products", "/admin/outstanding-products"];
const NODE = "admin.masters.products";

export type ProductActionResult =
  | { ok: true; id?: string }
  | { ok: false; error: string };

const NameSchema = z.string().trim().min(1, "Name is required").max(120, "Name is too long");

/**
 * The code is intentionally permissive about CASE and strict about SHAPE.
 *
 * Letters, digits, dash, underscore and dot; no spaces. A code with a space in
 * it is a name, and the whole point of the column is that the two are different
 * things. Uniqueness is case-insensitive (a partial unique index on
 * `lower(code)` in migration 0217), so "bss" cannot be created beside "BSS".
 *
 * Empty string is accepted and stored as NULL — "no code yet" is a legitimate
 * state that 0217 deliberately left for the multi-word products, and an admin
 * clearing the field must be able to get back to it.
 */
const CodeSchema = z
  .string()
  .trim()
  .max(24, "Code is too long")
  .regex(/^[A-Za-z0-9._-]*$/, "Code can use letters, digits, dot, dash and underscore only");

const CreateSchema = z
  .object({
    name: NameSchema,
    code: CodeSchema.optional(),
    sortOrder: z.number().int().min(0).max(9999).optional(),
  })
  .strict();

const UpdateSchema = z
  .object({
    name: NameSchema.optional(),
    code: CodeSchema.optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().min(0).max(9999).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "No changes to save." });

export type CreateProductInput = z.infer<typeof CreateSchema>;
export type UpdateProductInput = z.infer<typeof UpdateSchema>;

/** Case-insensitive duplicate checks, run up front so a unique index never
 *  surfaces to the user as a raw Postgres error. */
async function nameTaken(name: string, exceptId?: string): Promise<boolean> {
  const rows = await db
    .select({ id: outstandingProducts.id })
    .from(outstandingProducts)
    .where(sql`lower(${outstandingProducts.name}) = lower(${name})`)
    .limit(2);
  return rows.some((r) => r.id !== exceptId);
}

async function codeTaken(code: string, exceptId?: string): Promise<boolean> {
  if (!code) return false;
  const rows = await db
    .select({ id: outstandingProducts.id })
    .from(outstandingProducts)
    .where(sql`lower(${outstandingProducts.code}) = lower(${code})`)
    .limit(2);
  return rows.some((r) => r.id !== exceptId);
}

function bust(): void {
  for (const p of PATHS) revalidatePath(p);
  updateTag(CACHE_TAGS.products);
}

export async function createProduct(
  input: CreateProductInput,
): Promise<ProductActionResult> {
  const me = await requireAdmin();
  await requireModuleEdit(NODE);
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, error: limited.error };

  const parsed = CreateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { name } = parsed.data;
  const code = parsed.data.code?.trim() || null;

  if (await nameTaken(name)) {
    return { ok: false, error: "A product with this name already exists." };
  }
  if (code && (await codeTaken(code))) {
    return { ok: false, error: `The code "${code}" is already used by another product.` };
  }

  try {
    const [row] = await db
      .insert(outstandingProducts)
      .values({ name, code, sortOrder: parsed.data.sortOrder ?? 100 })
      .returning({ id: outstandingProducts.id });
    if (!row) return { ok: false, error: "DB: insert returned no row" };
    bust();
    return { ok: true, id: row.id };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }
}

export async function updateProduct(
  id: string,
  fields: UpdateProductInput,
): Promise<ProductActionResult> {
  const me = await requireAdmin();
  await requireModuleEdit(NODE);
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, error: limited.error };

  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Invalid id" };

  const parsed = UpdateSchema.safeParse(fields);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const [current] = await db
    .select()
    .from(outstandingProducts)
    .where(eq(outstandingProducts.id, id))
    .limit(1);
  if (!current) return { ok: false, error: "Product not found" };

  if (parsed.data.name !== undefined && parsed.data.name !== current.name) {
    if (await nameTaken(parsed.data.name, id)) {
      return { ok: false, error: "A product with this name already exists." };
    }
  }

  // `code: ""` is a deliberate CLEAR, not a no-op — see CodeSchema.
  const nextCode =
    parsed.data.code === undefined ? undefined : parsed.data.code.trim() || null;
  if (nextCode !== undefined && nextCode && nextCode !== current.code) {
    if (await codeTaken(nextCode, id)) {
      return { ok: false, error: `The code "${nextCode}" is already used by another product.` };
    }
  }

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.name !== undefined) patch.name = parsed.data.name;
  if (nextCode !== undefined) patch.code = nextCode;
  if (parsed.data.isActive !== undefined) patch.isActive = parsed.data.isActive;
  if (parsed.data.sortOrder !== undefined) patch.sortOrder = parsed.data.sortOrder;

  try {
    await db.update(outstandingProducts).set(patch).where(eq(outstandingProducts.id, id));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  bust();
  return { ok: true };
}

/**
 * NO DELETE ACTION, on purpose.
 *
 * `outstanding_contracts.product_id` references these rows, and the brief's own
 * rule is to prefer `active = false` for a master that history depends on.
 * Deactivating removes it from every new-selection dropdown while every past
 * contract keeps printing the product it was actually sold under. A delete would
 * either be refused by the FK or (with ON DELETE SET NULL, which is what the
 * column declares) quietly blank the product on historical contracts.
 */
