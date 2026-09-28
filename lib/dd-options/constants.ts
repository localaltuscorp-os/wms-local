/**
 * DD MASTER — the fixed vocabulary for the handful of categories this ships
 * with. PURE + CLIENT-SAFE (no DB, no I/O): the category tab strip and the
 * page's metadata both read this.
 *
 * A category is not defined here — it is defined by having rows in
 * `dd_options` (see db/schema.ts). This file only supplies a friendlier tab
 * label for the categories we know about today; `labelForListKey` falls back
 * to a humanized version of the key for any category a future admin creates
 * through the UI, so a brand-new `list_key` needs no code change at all.
 */

export const DD_KNOWN_CATEGORIES: readonly { listKey: string; label: string }[] = [
  { listKey: "batch_number", label: "Batch Number" },
  { listKey: "handholding_calls", label: "Handholding Calls" },
  { listKey: "product_names", label: "Product Names" },
];

const KNOWN_LABELS = new Map(DD_KNOWN_CATEGORIES.map((c) => [c.listKey, c.label]));

/** "batch_number" -> "Batch Number" for a key this file doesn't name. */
function humanize(listKey: string): string {
  return listKey
    .split(/[_-]+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(" ");
}

export function labelForListKey(listKey: string): string {
  return KNOWN_LABELS.get(listKey) ?? humanize(listKey);
}

/** A fresh, unused category needs a `list_key` slug from whatever name is typed. */
export function slugifyListKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
