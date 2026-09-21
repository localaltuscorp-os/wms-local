import "server-only";

import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { billingLookups } from "@/db/schema";
import { LOOKUP_LISTS, type LookupList } from "@/lib/billing/lookups";

/**
 * READING THE DROPDOWN MASTER.
 *
 * One query for every list, then grouped in memory. Twelve `where kind = ...`
 * queries would be twelve round trips to a table that holds a few hundred rows
 * in total, and the master screen needs all of them at once anyway.
 */

export interface LookupOption {
  id: string;
  value: string;
  sortOrder: number;
}

export interface LookupListState extends LookupList {
  options: LookupOption[];
  /**
   * True when nothing has been saved for this list and `options` is therefore
   * the registry's defaults rather than anything anyone chose.
   *
   * The master badges this as DEFAULT vs CUSTOM, and the distinction is real:
   * a list showing defaults has no rows behind it, so "reset to defaults" is a
   * no-op and removing an option means saving the whole list first. The screen
   * says "Suggested defaults (not saved yet)" for exactly this case.
   */
  isDefault: boolean;
}

/** Every list with its options, defaults filled in where nothing is saved. */
export async function listBillingLookups(): Promise<LookupListState[]> {
  const rows = await db
    .select({
      id: billingLookups.id,
      kind: billingLookups.kind,
      value: billingLookups.value,
      sortOrder: billingLookups.sortOrder,
    })
    .from(billingLookups)
    .where(and(isNull(billingLookups.deletedAt)))
    .orderBy(asc(billingLookups.kind), asc(billingLookups.sortOrder), asc(billingLookups.value));

  const byKind = new Map<string, LookupOption[]>();
  for (const r of rows) {
    const list = byKind.get(r.kind) ?? [];
    list.push({ id: r.id, value: r.value, sortOrder: r.sortOrder });
    byKind.set(r.kind, list);
  }

  return LOOKUP_LISTS.map((list) => {
    const saved = byKind.get(list.kind) ?? [];
    return {
      ...list,
      isDefault: saved.length === 0,
      options:
        saved.length > 0
          ? saved
          : // Synthetic ids, so the screen can key on them. They are not
            // database rows and cannot be edited until the list is saved.
            list.defaults.map((value, i) => ({ id: `default:${list.kind}:${i}`, value, sortOrder: i })),
    };
  });
}

/**
 * The options for ONE list, for a form that just needs to fill a <select>.
 * Falls back to the registry defaults so a dropdown is never empty on a fresh
 * database — a KYC form whose Designation list had nothing in it would look
 * broken rather than unconfigured.
 */
export async function lookupOptions(kind: string): Promise<string[]> {
  const rows = await db
    .select({ value: billingLookups.value })
    .from(billingLookups)
    .where(and(eq(billingLookups.kind, kind), isNull(billingLookups.deletedAt)))
    .orderBy(asc(billingLookups.sortOrder), asc(billingLookups.value));

  if (rows.length > 0) return rows.map((r) => r.value);
  return LOOKUP_LISTS.find((l) => l.kind === kind)?.defaults ?? [];
}

/** Every list's options in one map, for the KYC form's many dropdowns. */
export async function allLookupOptions(): Promise<Record<string, string[]>> {
  const lists = await listBillingLookups();
  return Object.fromEntries(lists.map((l) => [l.kind, l.options.map((o) => o.value)]));
}
