/**
 * The dropdown master's CATEGORIES — client-safe on purpose.
 *
 * `lib/billing/lookups.ts` is `server-only`: it carries `canEditLookup`, which
 * reads an Employee, and that file must never reach the browser. But the
 * Customer Master DD screen is a client component and needs the category ORDER
 * to lay itself out — the filter pills and the section headings are both this
 * list, in this sequence.
 *
 * So the names live here, where both sides can read them, and `lookups.ts`
 * re-exports them rather than declaring a second copy. One definition; a
 * category added here appears on the master and in the registry together.
 */

export const LOOKUP_CATEGORIES = [
  "Customer",
  "People",
  "Commercial Terms",
  "Banking",
  "Location & Currency",
  "Descriptions",
] as const;

export type LookupCategory = (typeof LOOKUP_CATEGORIES)[number];
