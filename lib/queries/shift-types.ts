import "server-only";

import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, shiftTypes } from "@/db/schema";
import { unstable_cache } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache-tags";

/**
 * The SHIFT TYPES master (Admin → Shift Types) — the list the Sales Pitch
 * form's Shift field offers.
 *
 * Its own cache entry under the `shifts` tag rather than a `.map()` over
 * another reader, for the same reason `listActiveProductNames` has one: the
 * key belongs to the function, and deriving it in a caller would re-run that
 * caller's whole render on an unrelated write.
 *
 * Named `shiftTypeNames` rather than `shifts` because `employees.workerType`
 * (how somebody is PAID) must never be confused with `employees.shiftTypeId`
 * (when they work) — see the table comment in db/schema.ts.
 */
export const listActiveShiftTypeNames = unstable_cache(
  async (): Promise<string[]> => {
    const rows = await db
      .select({ name: shiftTypes.name })
      .from(shiftTypes)
      .where(eq(shiftTypes.isActive, true))
      .orderBy(asc(shiftTypes.sortOrder), asc(shiftTypes.name));
    return rows.map((r) => r.name);
  },
  ["list-active-shift-type-names"],
  { tags: [CACHE_TAGS.shifts], revalidate: 600 },
);

/**
 * The signed-in employee's OWN shift name, for the Sales Pitch form's default.
 * Null when they have none set — an unset shift is not guessed.
 */
export async function shiftTypeNameFor(employeeId: string): Promise<string | null> {
  const [row] = await db
    .select({ name: shiftTypes.name })
    .from(employees)
    .leftJoin(shiftTypes, eq(employees.shiftTypeId, shiftTypes.id))
    .where(eq(employees.id, employeeId))
    .limit(1);
  return row?.name ?? null;
}
