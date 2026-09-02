import { sql } from "drizzle-orm";
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

  const rows = (await db.execute(
    sql`SELECT * FROM ${ident} ORDER BY 1${pageArm}`,
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
  const [row] = (await db.execute(
    sql`SELECT count(*)::int AS n FROM ${ident}`,
  )) as unknown as Array<{ n: number }>;
  return row?.n ?? 0;
}
