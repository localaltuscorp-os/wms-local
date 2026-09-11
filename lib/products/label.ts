/**
 * HOW A PRODUCT IS WRITTEN OUT.
 *
 * PURE and client-safe — no `server-only`, no DB. It lives here rather than in
 * `lib/queries/products.ts` because the components that render a product are
 * client components, and importing a `server-only` module from one of them fails
 * at build time. Keeping the label in one place is the point: the alternative is
 * each screen composing `code` and `name` its own way, and the same product
 * reading differently on two of them.
 */

export interface ProductNameParts {
  /** Null for a product an admin has not coded yet — a real state, since
   *  migration 0217 declined to invent codes for the multi-word products. */
  code: string | null;
  name: string;
}

/**
 * "GP · Graduate Programs", or just the name.
 *
 * The code is omitted when it IS the name (BSS, PSO), because "BSS · BSS" is
 * noise, and when there is no code at all.
 */
export function productLabel(p: ProductNameParts): string {
  return p.code && p.code !== p.name ? `${p.code} · ${p.name}` : p.name;
}
