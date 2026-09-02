import { sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";

/**
 * Database export for the nightly Google backup. Enumerates every base table in
 * the `public` schema and dumps each to a header row + value rows, so the backup
 * auto-covers new tables without code changes. The Sheets writer turns each
 * `TableDump` into a tab (sharded when it exceeds Google's per-sheet limits).
 *
 * Read-only. Values are stringified for cells; null → "" with a sentinel-free
 * convention (empty cell = NULL on restore). Ordered by primary key / first
 * column for stable, diff-friendly output across nightly runs.
 */
export interface TableDump {
  table: string;
  headers: string[];
  rows: string[][];
  rowCount: number;
}

/** All base tables in `public`, excluding Drizzle's migration bookkeeping. */
export async function listBackupTables(): Promise<string[]> {
  const rows = (await db.execute(sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      AND table_name NOT LIKE '\\_\\_drizzle%'
    ORDER BY table_name
  `)) as unknown as Array<{ table_name: string }>;
  return rows.map((r) => r.table_name);
}

/** Cell-safe string for any SQL value. Objects/arrays (json, text[]) → JSON. */
function cell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/**
 * SYSTEM-ACCOUNT EXCLUSION (Sir, 2026-08) — the nightly backup mirrors every
 * table into a Google Sheet other people can open, so a row hidden inside the
 * app would still show up there, once per night, for years.
 *
 * `employees` is filtered on account_type directly; every other table is
 * filtered on whichever actor/subject columns it actually has, discovered from
 * information_schema rather than hardcoded, so a new table inherits this.
 * Compared as ::text so a column of an unexpected type can never throw.
 *
 * MUST be applied identically in dumpTable AND countRows — the shard maths
 * divides the count into pages, so a mismatch would silently drop real rows.
 */
const SYSTEM_REF_COLUMNS = [
  "actor_id",
  "employee_id",
  "doer_id",
  "initiator_id",
  "created_by_id",
  "target_employee_id",
] as const;

const SYSTEM_IDS = sql`SELECT id::text FROM employees WHERE account_type = 'system'`;

async function systemExclusion(table: string): Promise<SQL> {
  if (table === "employees") {
    return sql` WHERE account_type IS DISTINCT FROM 'system'`;
  }
  const cols = await columnNames(table);
  const refs = SYSTEM_REF_COLUMNS.filter((c) => cols.includes(c));
  if (refs.length === 0) return sql``;
  let clause: SQL = sql``;
  refs.forEach((c, i) => {
    const col = sql.raw(`"${c}"`);
    const arm = sql`(${col} IS NULL OR ${col}::text NOT IN (${SYSTEM_IDS}))`;
    clause = i === 0 ? sql` WHERE ${arm}` : sql`${clause} AND ${arm}`;
  });
  return clause;
}

/** Dump one table to headers + stringified rows. `limit`/`offset` page large
 *  tables for sharding; omit for a full dump. */
export async function dumpTable(
  table: string,
  opts: { limit?: number; offset?: number } = {},
): Promise<TableDump> {
  // `table` comes only from listBackupTables() (information_schema), never user
  // input, so identifier interpolation here is safe; still quote it.
  const ident = sql.raw(`"${table.replace(/"/g, '""')}"`);
  const pageArm =
    opts.limit != null
      ? sql` LIMIT ${opts.limit} OFFSET ${opts.offset ?? 0}`
      : sql``;

  const notSystem = await systemExclusion(table);
  const rows = (await db.execute(
    sql`SELECT * FROM ${ident}${notSystem} ORDER BY 1${pageArm}`,
  )) as unknown as Array<Record<string, unknown>>;

  const headers = rows.length > 0 ? Object.keys(rows[0]!) : await columnNames(table);
  const body = rows.map((r) => headers.map((h) => cell(r[h])));
  return { table, headers, rows: body, rowCount: body.length };
}

/** Column names in ordinal order — used so an empty table still gets a header row. */
async function columnNames(table: string): Promise<string[]> {
  const rows = (await db.execute(sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${table}
    ORDER BY ordinal_position
  `)) as unknown as Array<{ column_name: string }>;
  return rows.map((r) => r.column_name);
}

/** Row count for a table (cheap; used to decide sharding before dumping). */
export async function countRows(table: string): Promise<number> {
  const ident = sql.raw(`"${table.replace(/"/g, '""')}"`);
  const notSystem = await systemExclusion(table);
  const [row] = (await db.execute(
    sql`SELECT count(*)::int AS n FROM ${ident}${notSystem}`,
  )) as unknown as Array<{ n: number }>;
  return row?.n ?? 0;
}
