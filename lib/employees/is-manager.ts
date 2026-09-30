import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

/**
 * The explicit "this person is a manager" flag (migration 0253).
 *
 * `is_manager` is deliberately NOT a column on `employees` in db/schema.ts —
 * same reasoning as `lib/hr/background-check.ts` and `lib/employees/
 * sort-order.ts`: `localSessionEmployee` runs a full-row `select()` on every
 * request, and naming an unmigrated column there breaks sign-in, not just
 * this feature. Read and written here by name, guarded against 42703
 * (undefined_column) so a database without 0253 degrades to "nobody has an
 * explicit flag" rather than throwing.
 *
 * DELETE THIS FILE once 0253 is applied everywhere — move the column onto
 * `employees` in db/schema.ts and let callers read it like any other.
 */

/** id → is_manager, for every active employee. Empty map on a database
 *  without 0253 — callers then fall back to the derived definition. */
export async function loadManagerFlags(): Promise<Map<string, boolean>> {
  try {
    const rows = (await db.execute(sql`
      SELECT id, is_manager FROM employees WHERE is_active = true
    `)) as unknown as Array<{ id: string; is_manager: boolean }>;
    return new Map(rows.map((r) => [r.id, r.is_manager]));
  } catch {
    return new Map();
  }
}

/** This one person's flag. `false` on a database without 0253 — same
 *  degrade-gracefully rule as everything else here. */
export async function isManagerFlagOf(employeeId: string): Promise<boolean> {
  try {
    const rows = (await db.execute(sql`
      SELECT is_manager FROM employees WHERE id = ${employeeId} LIMIT 1
    `)) as unknown as Array<{ is_manager: boolean }>;
    return rows[0]?.is_manager ?? false;
  } catch {
    return false;
  }
}

/** Returns `false` when the database has no 0253 — the caller stays refused
 *  rather than silently no-op'ing a promote/demote. */
export async function setIsManager(employeeId: string, value: boolean): Promise<boolean> {
  try {
    await db.execute(sql`
      UPDATE employees SET is_manager = ${value} WHERE id = ${employeeId}
    `);
    return true;
  } catch {
    return false;
  }
}
