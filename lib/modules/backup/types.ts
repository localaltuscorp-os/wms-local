import type { WorkspaceId } from "@/lib/workspaces";

/**
 * MODULE BACKUP — the shapes shared by the Export button, the nightly save and
 * the registry of what each module contains.
 *
 * Deliberately separate from lib/hr/records-export (the per-PERSON HR backup):
 * a different Google account, a different folder, a different permission list.
 * The only thing the two share is the Drive REST client and the OAuth helpers.
 *
 *   per-person HR backup   "everything about Rutvisha"     hr.altuscorp@gmail.com
 *   module backup (this)   "everything in Attendance"      MODULE_BACKUP_DRIVE_ACCOUNT
 */

/** One sheet inside a module's workbook. */
export interface Dataset {
  /** Tab name as a person reads it. Excel caps sheet names at 31 characters. */
  readonly tab: string;
  /** Stable id used in the run cursor, so a resumed run knows where it stopped. */
  readonly key: string;
  /**
   * Rows for this tab. `since` is null on a full export, else the cut-off of the
   * last successful run: return only rows created or changed after it.
   */
  rows(args: { since: Date | null }): Promise<DatasetRows>;
  /**
   * How "changed since last run" is decided, which decides what an incremental
   * export can promise:
   *   "updated"  the table records edits — new AND edited rows are picked up
   *   "created"  no edit timestamp — only NEW rows; an edit to an old row is
   *              invisible until the next full export
   *   "snapshot" no timestamps at all — exported in full every time (keep these
   *              small; a snapshot of a large table every night is waste)
   */
  readonly changes: "updated" | "created" | "snapshot";
}

export interface DatasetRows {
  /** Column headers, in order. */
  readonly columns: readonly string[];
  /** One array per row, matching `columns`. Values are written as-is. */
  readonly rows: readonly (readonly CellValue[])[];
  /**
   * Files belonging to these rows. The workbook links to each one, and the save
   * copies it into the run's folder next to the workbook.
   */
  readonly files?: readonly ExportFile[];
}

export type CellValue = string | number | boolean | Date | null;

/** A stored file (scan, PDF, image) referenced by a row. */
export interface ExportFile {
  /** Supabase Storage bucket. */
  readonly bucket: string;
  /** Path inside the bucket. */
  readonly path: string;
  /** File name inside the run folder; duplicates are suffixed. */
  readonly name: string;
}

export interface ModuleBackup {
  readonly id: WorkspaceId;
  /** Folder name in Drive, and the heading on the page. */
  readonly label: string;
  readonly datasets: readonly Dataset[];
}

/**
 * Where a run got to. Saved after every chunk, because one invocation has five
 * minutes and a first full export of a large module does not fit in five
 * minutes. A resumed run continues from here rather than starting again.
 */
export interface RunCursor {
  /** Index into the module's datasets. */
  dataset: number;
  /** Files already copied for the current dataset. */
  filesDone: number;
  /** Drive folder id for this run, created once. */
  folderId?: string;
}

export interface RunCounts {
  /** Rows written, per tab. */
  rows: Record<string, number>;
  files: number;
  /** Files that could not be read from storage; the run still finishes. */
  skippedFiles: number;
}

export type RunKind = "full" | "incremental" | "manual";
export type RunStatus = "pending" | "running" | "done" | "failed";

/** Thrown when Google refuses the stored token: the account must reconnect. */
export class ModuleDriveAuthError extends Error {}
