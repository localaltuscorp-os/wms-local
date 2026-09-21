import "server-only";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { getObjectBytes } from "@/lib/storage/objects";
import { DriveAuthError, type DriveClient } from "@/lib/hr/records-export/types";
import { moduleBackupRuns, type ModuleBackupRunRow } from "./schema";
import {
  MODULE_BACKUP_ROOT_FOLDER,
  driveClient,
  markExported,
  moduleState,
  readSettings,
  recordSettingsError,
} from "./settings";
import { moduleBackup } from "./registry";
import { buildWorkbook, type SheetInput } from "./workbook";
import { folderNameFor, uniqueFileName } from "./names";
import type { DatasetRows, RunCounts, RunCursor, RunKind } from "./types";
import { moduleBackupSettings } from "./schema";

/**
 * ONE EXPORT, POSSIBLY ACROSS SEVERAL INVOCATIONS.
 *
 * A serverless invocation gets five minutes and the first full export of a
 * large module will not fit. So a run is a row, not a function call: it records
 * the window it covers and how far it got, every chunk saves its place, and the
 * next invocation carries on. A timeout or a deploy mid-export costs one chunk,
 * not the whole thing.
 *
 * WHAT IS RE-DONE ON RESUME, AND WHY. The cursor counts FILES, not rows: rows
 * are re-queried from the database each chunk (cheap, and `until` is fixed when
 * the run starts so the answer cannot drift), while copying files to Drive is
 * the slow part and is never repeated. The workbook is written in the chunk
 * that finishes the last dataset.
 */

/** Stop starting new work this many ms before the invocation's limit. */
const SAFETY_MS = 45_000;
/** How long a chunk may hold the run. A stuck chunk frees it after this. */
const LOCK_MS = 6 * 60_000;

export interface ChunkResult {
  runId: string;
  moduleId: string;
  done: boolean;
  counts: RunCounts;
  folderName: string | null;
}

function emptyCounts(): RunCounts {
  return { rows: {}, files: 0, skippedFiles: 0 };
}

/**
 * Create a run, or return the one already in flight for this module — two
 * exports of the same module at once would write the same folder twice.
 */
export async function startRun(args: {
  moduleId: string;
  kind: RunKind;
  requestedById?: string | null;
}): Promise<ModuleBackupRunRow> {
  const live = await inFlightRun(args.moduleId);
  if (live) return live;

  const state = await moduleState(args.moduleId);
  const since = args.kind === "full" ? null : state.exportedThrough;
  const [row] = await db
    .insert(moduleBackupRuns)
    .values({
      moduleId: args.moduleId,
      kind: since ? args.kind : "full",
      // Fixed now: rows written while this run works belong to the NEXT run,
      // rather than being half-caught by this one.
      until: new Date(),
      since,
      requestedById: args.requestedById ?? null,
      counts: emptyCounts(),
      cursor: { dataset: 0, filesDone: 0 },
    })
    .returning();
  if (!row) throw new Error("Could not start the export");
  return row;
}

export async function inFlightRun(moduleId: string): Promise<ModuleBackupRunRow | null> {
  const [row] = await db
    .select()
    .from(moduleBackupRuns)
    .where(
      and(
        eq(moduleBackupRuns.moduleId, moduleId),
        inArray(moduleBackupRuns.status, ["pending", "running"]),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Runs waiting to be carried on, oldest first. */
export async function unfinishedRuns(limit = 10): Promise<ModuleBackupRunRow[]> {
  return db
    .select()
    .from(moduleBackupRuns)
    .where(
      and(
        inArray(moduleBackupRuns.status, ["pending", "running"]),
        or(isNull(moduleBackupRuns.lockUntil), sql`${moduleBackupRuns.lockUntil} < now()`),
      ),
    )
    .orderBy(moduleBackupRuns.startedAt)
    .limit(limit);
}

/** Take the run, if nobody else holds it. Returns false when someone does. */
async function claim(runId: string): Promise<boolean> {
  const [row] = await db
    .update(moduleBackupRuns)
    .set({ status: "running", lockUntil: new Date(Date.now() + LOCK_MS) })
    .where(
      and(
        eq(moduleBackupRuns.id, runId),
        inArray(moduleBackupRuns.status, ["pending", "running"]),
        or(isNull(moduleBackupRuns.lockUntil), sql`${moduleBackupRuns.lockUntil} < now()`),
      ),
    )
    .returning({ id: moduleBackupRuns.id });
  return !!row;
}

async function fail(runId: string, err: unknown): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  await db
    .update(moduleBackupRuns)
    .set({ status: "failed", error: message.slice(0, 500), finishedAt: new Date(), lockUntil: null })
    .where(eq(moduleBackupRuns.id, runId));
  if (err instanceof DriveAuthError) await recordSettingsError(message);
}

export { folderNameFor };

/**
 * Do as much of `run` as fits before `deadline`, then save the place.
 * `done: false` means "call me again"; the caller decides how.
 */
export async function runChunk(run: ModuleBackupRunRow, deadline: number): Promise<ChunkResult> {
  const def = moduleBackup(run.moduleId);
  if (!def) {
    await fail(run.id, new Error(`No export is defined for module ${run.moduleId}`));
    return { runId: run.id, moduleId: run.moduleId, done: true, counts: emptyCounts(), folderName: null };
  }
  if (!(await claim(run.id))) {
    // Someone else is on it. Not an error: the other invocation will finish it.
    return { runId: run.id, moduleId: run.moduleId, done: false, counts: run.counts ?? emptyCounts(), folderName: run.folderName };
  }

  const cursor: RunCursor = run.cursor ?? { dataset: 0, filesDone: 0 };
  const counts: RunCounts = run.counts ?? emptyCounts();
  const since = run.since;
  const folderName = run.folderName ?? folderNameFor(run.until);

  try {
    const drive = await driveClient();
    const settings = await readSettings();

    // Root → module → this run's dated folder. `drive.file` scope cannot see a
    // folder made by hand, so the app creates (and remembers) its own.
    const rootId = await drive.ensureFolder({
      name: MODULE_BACKUP_ROOT_FOLDER,
      parentId: null,
      knownId: settings.rootFolderId,
    });
    if (rootId !== settings.rootFolderId) {
      await db
        .update(moduleBackupSettings)
        .set({ rootFolderId: rootId, updatedAt: new Date() })
        .where(eq(moduleBackupSettings.id, 1));
    }
    const moduleFolderId = await drive.ensureFolder({ name: def.label, parentId: rootId, knownId: null });
    const runFolderId =
      cursor.folderId ??
      (await drive.ensureFolder({ name: folderName, parentId: moduleFolderId, knownId: null }));
    cursor.folderId = runFolderId;

    const sheets: SheetInput[] = [];
    const usedNames = new Set<string>();

    for (let i = 0; i < def.datasets.length; i++) {
      const dataset = def.datasets[i]!;
      // A "snapshot" dataset has no timestamps to filter on, so it is exported
      // whole every time — see Dataset.changes.
      const data: DatasetRows = await dataset.rows({
        since: dataset.changes === "snapshot" ? null : since,
      });
      counts.rows[dataset.tab] = data.rows.length;

      const files = data.files ?? [];
      const names = files.map((f) => uniqueFileName(f.name, usedNames));

      // Files already copied in an earlier chunk are skipped, never re-uploaded.
      const startAt = i < cursor.dataset ? files.length : i === cursor.dataset ? cursor.filesDone : 0;
      for (let f = startAt; f < files.length; f++) {
        if (Date.now() > deadline - SAFETY_MS) {
          cursor.dataset = i;
          cursor.filesDone = f;
          await saveProgress(run.id, cursor, counts, folderName);
          return { runId: run.id, moduleId: run.moduleId, done: false, counts, folderName };
        }
        const file = files[f]!;
        const bytes = await getObjectBytes(file.bucket, file.path).catch(() => null);
        if (!bytes) {
          // A row pointing at a file that is no longer in storage must not stop
          // the export; it is counted and the workbook still lists the row.
          counts.skippedFiles++;
          continue;
        }
        await drive.putFile({
          name: names[f]!,
          parentId: runFolderId,
          data: bytes,
          mime: mimeFor(names[f]!),
          knownId: null,
        });
        counts.files++;
      }

      sheets.push({ tab: dataset.tab, data, fileNames: names });
      cursor.dataset = i + 1;
      cursor.filesDone = 0;
    }

    const xlsx = await buildWorkbook({
      moduleLabel: def.label,
      since,
      until: run.until,
      sheets,
    });
    await drive.putFile({
      name: `${def.label} ${folderName}.xlsx`,
      parentId: runFolderId,
      data: xlsx,
      mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      knownId: null,
    });

    await db
      .update(moduleBackupRuns)
      .set({
        status: "done",
        counts,
        cursor,
        folderName,
        finishedAt: new Date(),
        lockUntil: null,
        error: null,
      })
      .where(eq(moduleBackupRuns.id, run.id));

    // Only a scheduled run moves the watermark. A manual export is a copy
    // somebody asked for; it must not make the next nightly run skip those rows.
    if (run.kind !== "manual") {
      await markExported({ moduleId: run.moduleId, through: run.until, wasFull: !since });
    }
    await recordSettingsError(null);
    return { runId: run.id, moduleId: run.moduleId, done: true, counts, folderName };
  } catch (err) {
    await fail(run.id, err);
    throw err;
  }
}

async function saveProgress(
  runId: string,
  cursor: RunCursor,
  counts: RunCounts,
  folderName: string,
): Promise<void> {
  await db
    .update(moduleBackupRuns)
    .set({ cursor, counts, folderName, status: "pending", lockUntil: null })
    .where(eq(moduleBackupRuns.id, runId));
}

const MIME: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  csv: "text/csv",
  txt: "text/plain",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  zip: "application/zip",
};

export function mimeFor(name: string): string {
  const ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
  return MIME[ext] ?? "application/octet-stream";
}

/** For the Drive client type to stay honest about what this module needs. */
export type { DriveClient };
