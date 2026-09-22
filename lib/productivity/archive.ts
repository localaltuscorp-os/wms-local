import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

/**
 * The Team Performance archive flag, in raw SQL (migration 0232).
 *
 * WHY THIS FILE EXISTS AT ALL. `performance_archived` / `performance_archived_at`
 * are deliberately NOT columns on the `employees` table in db/schema.ts. Drizzle
 * expands a full-row `select()` into an explicit list of every column it knows
 * about, and `localSessionEmployee` (lib/auth/local-session.ts) runs exactly
 * that query to resolve the signed-in user on every single request. On a
 * database where 0232 has not been applied, naming the columns in the schema
 * therefore does not cost you an archive button — it costs you the login, and
 * every page with it.
 *
 * So the flag is read and written HERE, by name, in statements that mention
 * nothing else, each one guarded against 42703 (undefined_column). This is the
 * same shape `loadPlanMeta` / `loadPlanExtras` (lib/queries/project-plan.ts)
 * use for 0204 and 0213, and the reason `project_nodes.status` is absent from
 * `projectNodes` for the same reason.
 *
 * ON A DATABASE WITHOUT 0232 every function below reports "no archive": the
 * board lists everyone and draws no Archive button, the Archive section is
 * empty, and the action says so plainly instead of throwing. Nothing else about
 * Team Performance changes.
 *
 * DELETE THIS FILE once 0232 is applied everywhere — move the two columns onto
 * `employees` in db/schema.ts and let the callers read them like any other.
 */

/** A row on the board, filed away, with when it happened. */
export interface ArchivedPerformanceRow {
  id: string;
  archivedAt: Date | null;
}

/**
 * Everyone currently off the board.
 *
 * `null` — NOT an empty array — when the database has no 0232. The two answers
 * are different questions ("nobody is archived" vs "this database cannot archive
 * anybody") and every caller needs to tell them apart: one hides rows, the other
 * hides the feature.
 */
export async function archivedPerformanceIds(): Promise<Set<string> | null> {
  try {
    const rows = (await db.execute(sql`
      SELECT id FROM employees WHERE performance_archived = true
    `)) as unknown as Array<{ id: string }>;
    return new Set(rows.map((r) => r.id));
  } catch {
    return null;
  }
}

/** Does this database have the archive at all? See the note above. */
export async function performanceArchiveAvailable(): Promise<boolean> {
  return (await archivedPerformanceIds()) !== null;
}

/**
 * The archived rows themselves, with what the Archive's table shows: who they
 * are, where they sat, and when the row was put away. Empty on a database
 * without 0232.
 *
 * Scoped by the ids the Archive resolved for the half being read, so the same
 * `?emp=` filter that narrows every other section narrows this one.
 */
export async function archivedPerformanceRows(
  ids: string[],
  limit: number,
): Promise<
  Array<{
    id: string;
    name: string;
    department: string | null;
    managerName: string | null;
    archivedAt: Date | null;
  }>
> {
  if (ids.length === 0) return [];
  try {
    const rows = (await db.execute(sql`
      SELECT e.id,
             e.name,
             COALESCE(d.name, e.department) AS department,
             m.name                         AS manager_name,
             e.performance_archived_at      AS archived_at
      FROM employees e
      LEFT JOIN employees   m ON m.id = e.manager_id
      LEFT JOIN departments d ON d.id = e.department_id
      WHERE e.performance_archived = true
        AND e.id IN ${sql.raw(`(${ids.map((id) => `'${uuid(id)}'`).join(", ")})`)}
      ORDER BY e.performance_archived_at DESC NULLS LAST, e.name
      LIMIT ${limit}
    `)) as unknown as Array<{
      id: string;
      name: string;
      department: string | null;
      manager_name: string | null;
      archived_at: Date | string | null;
    }>;
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      department: r.department,
      managerName: r.manager_name,
      archivedAt: r.archived_at ? new Date(r.archived_at) : null,
    }));
  } catch {
    return [];
  }
}

/** How many of `ids` are off the board. Zero where 0232 is not applied. */
export async function archivedPerformanceCount(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const found = await archivedPerformanceIds();
  if (!found) return 0;
  return ids.reduce((n, id) => (found.has(id) ? n + 1 : n), 0);
}

/**
 * Whether this one person is on the board, and their name for the message.
 * `null` when the database has no 0232; `undefined` when there is no such
 * employee.
 */
export async function performanceArchiveStateOf(
  employeeId: string,
): Promise<{ name: string; archived: boolean } | null | undefined> {
  try {
    const rows = (await db.execute(sql`
      SELECT name, performance_archived AS archived
      FROM employees
      WHERE id = ${employeeId}
      LIMIT 1
    `)) as unknown as Array<{ name: string; archived: boolean }>;
    const row = rows[0];
    return row ? { name: row.name, archived: Boolean(row.archived) } : undefined;
  } catch {
    return null;
  }
}

/** Put the row away. `false` when the database has no 0232. */
export async function setPerformanceArchived(
  employeeId: string,
  archived: boolean,
): Promise<boolean> {
  try {
    await db.execute(sql`
      UPDATE employees
      SET performance_archived = ${archived},
          performance_archived_at = ${archived ? sql`now()` : sql`NULL`}
      WHERE id = ${employeeId}
    `);
    return true;
  } catch {
    return false;
  }
}

/**
 * The id list above is interpolated into the statement rather than bound,
 * because `IN` over a parameter list is the one place this file cannot use a
 * placeholder without building the list by hand anyway. Every id is checked
 * against the UUID shape first and anything else throws — the values come from
 * the Archive's own scope query, never from a request, and this keeps it that
 * way even if that ever changes.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uuid(v: string): string {
  if (!UUID.test(v)) throw new Error("not an employee id");
  return v;
}
