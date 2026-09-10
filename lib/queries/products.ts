import "server-only";
import { asc, eq, sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import { outstandingContracts, outstandingProducts } from "@/db/schema";
import { CACHE_TAGS } from "@/lib/cache-tags";

/**
 * THE PRODUCT MASTER — the module-neutral reader.
 *
 * ── ONE MASTER, ONE READER ─────────────────────────────────────────────────
 * The brief asks that Billing and every other module select products from one
 * master and that the values are not hardcoded per module. This file is that
 * one door. Anything wanting a product list imports from here; nothing declares
 * its own array.
 *
 * ── WHY THE TABLE IS STILL CALLED `outstanding_products` ───────────────────
 * Because it is the SAME master, and renaming it would buy a tidier name at the
 * cost of churning a live financial table. It has been the admin-managed
 * product roster since migration 0055, `/admin/outstanding-products` has always
 * managed it, and `outstanding_contracts.product_id` /
 * `outstanding_collections` reference it by uuid. Migration 0217 gave it a
 * `code`; the brief's other requirement — that it become canonical — is a
 * question of who reads it, which is what this module settles.
 *
 * `lib/queries/outstanding-rosters.ts` keeps its own product readers for the
 * Outstanding module's contract form. They query the same rows. This file is
 * not a second source of truth; it is the name the rest of the app uses, and
 * the only one that carries `code`.
 */

export interface ProductOption {
  id: string;
  /** Short code, e.g. "BSS". Null for a product an admin has not coded yet —
   *  0217 deliberately declined to invent one. */
  code: string | null;
  name: string;
}

export interface ProductRow extends ProductOption {
  isActive: boolean;
  sortOrder: number;
  /** Outstanding contracts referencing this product. Shown on the admin screen
   *  so nobody deactivates something history depends on without seeing it. */
  usageCount: number;
}

/**
 * ACTIVE products for a dropdown, ordered as the admin arranged them.
 *
 * Cached under the `products` tag: the roster is identical for every user and
 * changes only when an admin edits it (every write path calls
 * `updateTag(CACHE_TAGS.products)`). The 10-minute TTL is a safety net for an
 * invalidation we missed, matching how the client roster is cached.
 */
export const listActiveProducts = unstable_cache(
  async (): Promise<ProductOption[]> => {
    const rows = await db
      .select({
        id: outstandingProducts.id,
        code: outstandingProducts.code,
        name: outstandingProducts.name,
      })
      .from(outstandingProducts)
      .where(eq(outstandingProducts.isActive, true))
      .orderBy(asc(outstandingProducts.sortOrder), asc(outstandingProducts.name));
    return rows;
  },
  ["list-active-products"],
  { tags: [CACHE_TAGS.products], revalidate: 600 },
);

/**
 * Active product NAMES only — for the surfaces that still store a product as
 * text rather than as an FK (the `product` form-field MCQ, above all).
 *
 * Its own cache entry rather than a `.map()` over the one above, because
 * `unstable_cache` keys on the function, and deriving it in a caller would
 * re-run that caller's whole render on a product change for no reason.
 */
export const listActiveProductNames = unstable_cache(
  async (): Promise<string[]> => {
    const rows = await db
      .select({ name: outstandingProducts.name })
      .from(outstandingProducts)
      .where(eq(outstandingProducts.isActive, true))
      .orderBy(asc(outstandingProducts.sortOrder), asc(outstandingProducts.name));
    return rows.map((r) => r.name);
  },
  ["list-active-product-names"],
  { tags: [CACHE_TAGS.products], revalidate: 600 },
);

/**
 * EVERY product (active and inactive) with its usage count — the admin table.
 *
 * Not cached: it is one admin screen, it must show a write immediately, and it
 * is the only reader that wants inactive rows.
 */
export async function listProductsWithCounts(): Promise<ProductRow[]> {
  const rows = await db
    .select({
      id: outstandingProducts.id,
      code: outstandingProducts.code,
      name: outstandingProducts.name,
      isActive: outstandingProducts.isActive,
      sortOrder: outstandingProducts.sortOrder,
      usageCount: sql<number>`count(${outstandingContracts.id})::int`,
    })
    .from(outstandingProducts)
    .leftJoin(
      outstandingContracts,
      eq(outstandingContracts.productId, outstandingProducts.id),
    )
    .groupBy(outstandingProducts.id);

  // Locale-aware, like the client roster: Postgres orders by byte value, which
  // puts every uppercase code above every lowercase name.
  return rows.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
}

/** One product by id — for rendering a historical reference whose product may
 *  since have been deactivated. Inactive rows are returned deliberately: a past
 *  contract must still print the product it was actually sold under. */
export async function productById(id: string): Promise<ProductRow | null> {
  const [row] = await db
    .select({
      id: outstandingProducts.id,
      code: outstandingProducts.code,
      name: outstandingProducts.name,
      isActive: outstandingProducts.isActive,
      sortOrder: outstandingProducts.sortOrder,
      usageCount: sql<number>`0::int`,
    })
    .from(outstandingProducts)
    .where(eq(outstandingProducts.id, id))
    .limit(1);
  return row ?? null;
}

/**
 * The display label lives in `lib/products/label.ts`, not here.
 *
 * It is pure presentation and the components that need it are CLIENT components,
 * which cannot import this `server-only` module. Re-exported so a server caller
 * still has one import for the whole product surface.
 */
export { productLabel, type ProductNameParts } from "@/lib/products/label";
