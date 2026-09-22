import "server-only";
import { getTableColumns, gt, or, sql, type SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import { DOCUMENTS_BUCKET } from "@/lib/supabase/admin";
import { isSecretColumn } from "./names";
import type { CellValue, Dataset, DatasetRows, ExportFile } from "./types";

/**
 * ONE DRIZZLE TABLE → ONE TAB.
 *
 * The export covers ~150 tables. Hand-writing a query per tab would be 150
 * chances to leak a column, and 150 places to fix when a table gains one. So a
 * tab is DECLARED — table, which timestamp means "changed", which columns hold
 * file paths — and this builds the query, the rows and the file list from the
 * table's own definition. A new column appears in the export automatically; a
 * new SECRET column does not, because of the deny-list below.
 */

export interface FileColumn {
  /** Column holding the storage path. */
  readonly path: string;
  /** Column holding a display name, if any. */
  readonly name?: string;
  /** Defaults to the documents bucket. */
  readonly bucket?: string;
}

export interface TableTabSpec {
  readonly tab: string;
  readonly key: string;
  readonly table: PgTable;
  /**
   * The column that says when a row last changed. `updatedAt` catches edits as
   * well as new rows; a created-only column catches new rows only; omitting it
   * makes the tab a snapshot, exported whole every time.
   *
   * The inventory found plenty of tables with no edit stamp — `employees`,
   * `leave_requests`, every audit log — so this is per tab, not assumed.
   */
  readonly changedAt?: string;
  /** A second column to consider, e.g. createdAt when updatedAt can be null. */
  readonly alsoChangedAt?: string;
  /** Extra columns to leave out, beyond the secrets that are always dropped. */
  readonly omit?: readonly string[];
  /** Columns holding storage paths; their files are copied beside the workbook. */
  readonly files?: readonly FileColumn[];
  /** Hard cap, newest first. Guards the per-employee-per-day tables. */
  readonly maxRows?: number;
}

/** Default ceiling per tab. Big tables are the reason the run is incremental. */
const DEFAULT_MAX_ROWS = 50_000;

function cell(value: unknown): CellValue {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "string") {
    return value;
  }
  // jsonb and arrays: one column of JSON beats losing the data. The inventory
  // lists the blobs worth flattening properly later (form fields, poll results).
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export { isSecretColumn };

export function tableTab(spec: TableTabSpec): Dataset {
  const columns = getTableColumns(spec.table);
  const omit = new Set(spec.omit ?? []);
  const names = Object.keys(columns).filter((key) => {
    const column = columns[key]!;
    return !omit.has(key) && !isSecretColumn(column.name) && !isSecretColumn(key);
  });

  const changes: Dataset["changes"] = !spec.changedAt
    ? "snapshot"
    : /updated/i.test(spec.changedAt)
      ? "updated"
      : "created";

  return {
    tab: spec.tab,
    key: spec.key,
    changes,
    async rows({ since }): Promise<DatasetRows> {
      const selection: Record<string, unknown> = {};
      for (const key of names) selection[key] = columns[key]!;

      let where: SQL | undefined;
      if (since && spec.changedAt) {
        const primary = columns[spec.changedAt];
        const secondary = spec.alsoChangedAt ? columns[spec.alsoChangedAt] : undefined;
        if (primary) {
          where = secondary
            ? or(gt(primary, since), gt(secondary, since))
            : gt(primary, since);
        }
      }

      const order = spec.changedAt && columns[spec.changedAt] ? columns[spec.changedAt] : undefined;
      const query = db
        .select(selection as never)
        .from(spec.table)
        .limit(spec.maxRows ?? DEFAULT_MAX_ROWS);
      const rows = (await (where
        ? order
          ? query.where(where).orderBy(sql`${order} desc`)
          : query.where(where)
        : order
          ? query.orderBy(sql`${order} desc`)
          : query)) as Record<string, unknown>[];

      const files: ExportFile[] = [];
      for (const row of rows) {
        for (const fileColumn of spec.files ?? []) {
          const path = row[fileColumn.path];
          if (typeof path !== "string" || !path.trim()) continue;
          const named = fileColumn.name ? row[fileColumn.name] : null;
          const fallback = path.slice(path.lastIndexOf("/") + 1);
          files.push({
            bucket: fileColumn.bucket ?? DOCUMENTS_BUCKET,
            path,
            name: typeof named === "string" && named.trim() ? named : fallback,
          });
        }
      }

      return {
        columns: names,
        rows: rows.map((row) => names.map((key) => cell(row[key]))),
        files,
      };
    },
  };
}
