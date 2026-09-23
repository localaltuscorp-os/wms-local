import "server-only";
import { asc, eq, sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import { ddOptions, type DdOption } from "@/db/schema";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { DD_KNOWN_CATEGORIES, labelForListKey } from "@/lib/dd-options/constants";

/**
 * Migrations run by hand in Supabase (db/migrations/0245_dd_options.sql), so
 * there is a real, expected window where this code is deployed and
 * `dd_options` does not exist yet — Postgres 42P01 "undefined_table". Callers
 * use this to show "not set up yet" instead of a 500. Same check as
 * lib/queries/operations-checklist.ts's `isMissingChecklistTable`, kept local
 * rather than shared so this file has no dependency on an unrelated module.
 */
export function isMissingDdTable(e: unknown): boolean {
  const codeOf = (v: unknown): unknown =>
    typeof v === "object" && v !== null ? (v as { code?: unknown }).code : undefined;
  const hit = (c: unknown) => c === "42P01" || c === "42703";
  if (hit(codeOf(e))) return true;
  const cause = typeof e === "object" && e !== null ? (e as { cause?: unknown }).cause : undefined;
  return hit(codeOf(cause));
}

export interface DdOptionWithUsage extends DdOption {
  /**
   * Records that already hold this option's `code`. Zero for every row today
   * because no WMS field reads from `dd_options` yet (see the header of
   * app/(app)/operations/masters/dd/actions.ts) — the column exists so the
   * FIRST real consumer only has to add a join here, not build the "don't
   * retire something in use" affordance from scratch.
   */
  usageCount: number;
}

export interface DdCategory {
  listKey: string;
  label: string;
  options: DdOptionWithUsage[];
}

const listAllDdOptionRows = unstable_cache(
  async () => {
    return db
      .select()
      .from(ddOptions)
      .orderBy(asc(ddOptions.listKey), asc(ddOptions.sortOrder), asc(ddOptions.label));
  },
  ["list-all-dd-options"],
  { tags: [CACHE_TAGS.ddOptions], revalidate: 300 },
);

/** Every category that has at least one option, each option's live rows. */
export async function listDdCategories(): Promise<DdCategory[]> {
  const rows = await listAllDdOptionRows();
  const byKey = new Map<string, DdOptionWithUsage[]>();
  for (const row of rows) {
    const list = byKey.get(row.listKey) ?? [];
    list.push({ ...row, usageCount: 0 });
    byKey.set(row.listKey, list);
  }

  // Known categories first, in their declared order; anything an admin has
  // created beyond that follows alphabetically by key — new categories are
  // never hidden just because this file doesn't name them.
  const knownKeys = DD_KNOWN_CATEGORIES.map((c) => c.listKey);
  const extraKeys = [...byKey.keys()].filter((k) => !knownKeys.includes(k)).sort();

  return [...knownKeys, ...extraKeys]
    .filter((key) => byKey.has(key))
    .map((listKey) => ({ listKey, label: labelForListKey(listKey), options: byKey.get(listKey)! }));
}

/** Every distinct `list_key` in use, active or not — for validating "does this category already exist". */
export async function listDdListKeys(): Promise<string[]> {
  const rows = await db.selectDistinct({ listKey: ddOptions.listKey }).from(ddOptions);
  return rows.map((r) => r.listKey);
}

/** Active options a dropdown in the app may OFFER for one category. Retired options are excluded; nothing already saved is affected. */
export async function listActiveDdOptions(listKey: string): Promise<{ code: string; label: string }[]> {
  const rows = await db
    .select({ code: ddOptions.code, label: ddOptions.label })
    .from(ddOptions)
    .where(sql`${ddOptions.listKey} = ${listKey} and ${ddOptions.isActive} = true`)
    .orderBy(asc(ddOptions.sortOrder), asc(ddOptions.label));
  return rows;
}

export async function nextSortOrder(listKey: string): Promise<number> {
  const [row] = await db
    .select({ max: sql<number>`coalesce(max(${ddOptions.sortOrder}), 0)::int` })
    .from(ddOptions)
    .where(eq(ddOptions.listKey, listKey));
  return (row?.max ?? 0) + 1;
}
