import "server-only";
import { inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees } from "@/db/schema";
import { nameKey } from "@/lib/incentive/payout-sources";
import type { AnalyticsScope } from "./model";

/**
 * THE SCOPE AS NAME KEYS, for the surfaces keyed by a person's NAME rather than
 * by their employee id.
 *
 * The Billing ledger is the one that matters: it is read live from a Google
 * Sheet whose only identity column is the salesperson's typed name, so it cannot
 * be joined to `employees.id` and has to be matched on the same normalised key
 * the rest of the module already uses (`nameKey` — the same function
 * `resolveEarner` uses to match the imported sheet's annotated names).
 *
 * ── WHY THIS IS NOT IN `scope.ts` ─────────────────────────────────────────────
 * `scope.ts` holds the identity rules and is unit-tested for the pure ones
 * (`applyAnalyticsView`); it reaches the org chart through a module the tests
 * stub. This file needs `db`, so keeping it separate keeps that import surface —
 * and therefore that test — intact.
 *
 * ── THE RETURN CONTRACT ───────────────────────────────────────────────────────
 * `null` means NO FILTER: the viewer is company-wide and the caller should pass
 * nothing down. That is deliberately not the same as an empty set, which means
 * "this viewer may see nobody" and must empty the screen rather than widen it.
 * An unresolvable scope (no ids at all) still returns a real, empty set.
 */
export async function visibleNameKeysFor(
  scope: AnalyticsScope,
): Promise<ReadonlySet<string> | null> {
  if (scope.all) return null;
  if (scope.employeeIds.size === 0) return new Set<string>();

  const rows = await db
    .select({ name: employees.name })
    .from(employees)
    .where(inArray(employees.id, [...scope.employeeIds]));

  const keys = new Set<string>();
  for (const r of rows) {
    const k = nameKey(r.name);
    if (k) keys.add(k);
  }
  return keys;
}
