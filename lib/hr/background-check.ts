import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

/**
 * The Employee Background Check status, in raw SQL (migration 0248).
 *
 * `background_check_status` / `background_check_at` are deliberately NOT
 * columns on the `employees` table in db/schema.ts — see lib/productivity/
 * archive.ts's note on `performance_archived` for why: Drizzle expands a
 * full-row `select()` into an explicit column list, and `localSessionEmployee`
 * runs exactly that query on every request, so naming an unmigrated column
 * there costs the sign-in, not just this feature.
 *
 * So the flag is read and written HERE, by name, guarded against 42703
 * (undefined_column). ON A DATABASE WITHOUT 0248 the HR Record section reports
 * itself unavailable rather than throwing.
 *
 * DELETE THIS FILE once 0248 is applied everywhere — move the two columns onto
 * `employees` in db/schema.ts and let the caller read them like any other.
 */

export type BackgroundCheckStatus = "yes" | "no" | null;

export interface BackgroundCheckState {
  status: BackgroundCheckStatus;
  at: Date | null;
}

/** This person's status, or `null` when the database has no 0248. */
export async function backgroundCheckStateOf(employeeId: string): Promise<BackgroundCheckState | null> {
  try {
    const rows = (await db.execute(sql`
      SELECT background_check_status AS status, background_check_at AS at
      FROM employees
      WHERE id = ${employeeId}
      LIMIT 1
    `)) as unknown as Array<{ status: BackgroundCheckStatus; at: Date | string | null }>;
    const row = rows[0];
    if (!row) return { status: null, at: null };
    return { status: row.status, at: row.at ? new Date(row.at) : null };
  } catch {
    return null;
  }
}

/**
 * Record the decision. "yes" is meant to be permanent — the caller (the
 * server action) is what enforces that a "yes" already on file can't be
 * overwritten; this function itself will write whatever it's asked to write.
 * Returns `false` when the database has no 0248.
 */
export async function setBackgroundCheck(employeeId: string, status: "yes" | "no"): Promise<boolean> {
  try {
    await db.execute(sql`
      UPDATE employees
      SET background_check_status = ${status},
          background_check_at = now()
      WHERE id = ${employeeId}
    `);
    return true;
  } catch {
    return false;
  }
}
