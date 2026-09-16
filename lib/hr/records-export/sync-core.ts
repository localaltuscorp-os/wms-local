import { personFolderName } from "./names";
import {
  DriveAuthError,
  MAX_RECORDED_FAILURES,
  RECORD_FOLDERS,
  type DriveClient,
  type LedgerItem,
  type PersonRef,
  type RecordEntry,
  type RecordFolder,
  type RunSummary,
} from "./types";

/**
 * The Drive save, with every side effect injected — so the rules that decide
 * what gets uploaded are unit-tested without Google or a database
 * (tests/unit/hr-records-sync.test.ts). lib/hr/records-export/sync.ts wires
 * the real dependencies.
 *
 * Layout in Drive:  HR Records / <Name (email)> / Forms | Documents | Letters
 *
 * THE RULES
 *   · A file is uploaded when it is new, overwritten IN PLACE when its version
 *     or name changed, and skipped when neither did. Nothing is duplicated.
 *   · If someone deleted or trashed a folder in Drive, it is recreated and
 *     everything that belonged in it is uploaded again — "skip" is only safe
 *     while the folder the file was put in still exists.
 *   · Files are never deleted from Drive. This is a records archive: a letter
 *     archived in the app stays in the HR folder.
 *   · People with nothing on file get no folder.
 *   · One broken file is recorded and the save moves on. A broken CONNECTION
 *     (DriveAuthError) stops the pass, since every file after it would fail too.
 *   · Progress is saved after every person, so a pass that runs out of time
 *     resumes from the next person rather than starting over.
 */

export const ROOT_FOLDER_NAME = "HR Records";
export const ROOT_KEY = "folder:root";

export interface SyncDeps {
  drive: DriveClient;
  /** Everyone to save, in a stable order, strictly after `afterId` (null = from the start). */
  listPeople(afterId: string | null): Promise<PersonRef[]>;
  collect(person: PersonRef): Promise<RecordEntry[]>;
  ledgerGet(keys: string[]): Promise<Map<string, LedgerItem>>;
  ledgerPut(item: LedgerItem, employeeId: string | null): Promise<void>;
  saveProgress(cursor: string, summary: RunSummary): Promise<void>;
  now(): number;
}

export interface ChunkResult {
  done: boolean;
  /** The last person finished — where the next chunk resumes. Null when done. */
  cursor: string | null;
  summary: RunSummary;
}

function errorText(err: unknown): string {
  const m = err instanceof Error ? err.message : String(err);
  return m.length > 300 ? `${m.slice(0, 297)}…` : m;
}

function recordFailure(summary: RunSummary, person: string, file: string, err: unknown): void {
  summary.failed += 1;
  if (summary.failures.length < MAX_RECORDED_FAILURES) {
    summary.failures.push({ person, file, error: errorText(err) });
  }
}

interface TrackedFolder {
  id: string;
  /** True when the folder is new in Drive — its contents must all be (re)uploaded. */
  recreated: boolean;
}

async function ensureTrackedFolder(
  deps: SyncDeps,
  key: string,
  name: string,
  parentId: string | null,
  prev: LedgerItem | undefined,
  employeeId: string | null,
  parentRecreated: boolean,
): Promise<TrackedFolder> {
  const knownId = parentRecreated ? null : (prev?.driveId ?? null);
  const id = await deps.drive.ensureFolder({ name, parentId, knownId });
  if (!prev || id !== prev.driveId || prev.name !== name) {
    await deps.ledgerPut({ key, driveId: id, version: null, name }, employeeId);
  }
  return { id, recreated: !prev || id !== prev.driveId };
}

async function syncPerson(
  deps: SyncDeps,
  person: PersonRef,
  root: TrackedFolder,
  summary: RunSummary,
): Promise<void> {
  const entries = await deps.collect(person);
  if (entries.length === 0) return;
  summary.peopleWithFiles += 1;

  const personKey = `folder:${person.id}`;
  const folderKey = (f: RecordFolder) => `folder:${person.id}/${f}`;
  const fileKey = (e: RecordEntry) => `file:${person.id}/${e.key}`;
  const used = RECORD_FOLDERS.filter((f) => entries.some((e) => e.folder === f));

  const ledger = await deps.ledgerGet([personKey, ...used.map(folderKey), ...entries.map(fileKey)]);

  const personFolder = await ensureTrackedFolder(
    deps,
    personKey,
    personFolderName(person.name, person.email),
    root.id,
    ledger.get(personKey),
    person.id,
    root.recreated,
  );

  const folders = new Map<RecordFolder, TrackedFolder>();
  for (const f of used) {
    folders.set(
      f,
      await ensureTrackedFolder(deps, folderKey(f), f, personFolder.id, ledger.get(folderKey(f)), person.id, personFolder.recreated),
    );
  }

  for (const entry of entries) {
    const key = fileKey(entry);
    const prev = ledger.get(key);
    const folder = folders.get(entry.folder)!;
    // The ledger remembers "Folder/name", so a file whose folder changes is
    // moved in Drive rather than skipped as unchanged.
    const placed = `${entry.folder}/${entry.name}`;
    if (prev && !folder.recreated && prev.version === entry.version && prev.name === placed) {
      summary.unchanged += 1;
      continue;
    }
    try {
      const data = await entry.load();
      if (!data) throw new Error("The file is no longer in storage.");
      const driveId = await deps.drive.putFile({
        name: entry.name,
        parentId: folder.id,
        data,
        mime: entry.mime,
        // Always offer the old id. The client checks it still exists — a file
        // inside a deleted folder does not — and otherwise overwrites it and
        // moves it here, which is what stops a folder change leaving a copy behind.
        knownId: prev?.driveId ?? null,
      });
      await deps.ledgerPut({ key, driveId, version: entry.version, name: placed }, person.id);
      if (prev) summary.updated += 1;
      else summary.uploaded += 1;
    } catch (err) {
      if (err instanceof DriveAuthError) throw err;
      // Not written to the ledger, so the next save tries this file again.
      recordFailure(summary, person.name, `${entry.folder}/${entry.name}`, err);
    }
  }
}

/** Save people until done or until `deadline` (epoch ms) passes. */
export async function syncChunk(
  deps: SyncDeps,
  input: { cursor: string | null; summary: RunSummary; deadline: number },
): Promise<ChunkResult> {
  const summary: RunSummary = { ...input.summary, failures: [...input.summary.failures] };

  const rootPrev = (await deps.ledgerGet([ROOT_KEY])).get(ROOT_KEY);
  const root = await ensureTrackedFolder(deps, ROOT_KEY, ROOT_FOLDER_NAME, null, rootPrev, null, false);

  const people = await deps.listPeople(input.cursor);
  let cursor = input.cursor;
  for (const person of people) {
    if (deps.now() >= input.deadline) return { done: false, cursor, summary };
    try {
      await syncPerson(deps, person, root, summary);
    } catch (err) {
      if (err instanceof DriveAuthError) throw err;
      recordFailure(summary, person.name, "(whole record)", err);
    }
    summary.peopleDone += 1;
    cursor = person.id;
    await deps.saveProgress(cursor, summary);
  }
  return { done: true, cursor: null, summary: { ...summary, finishedAt: new Date(deps.now()).toISOString() } };
}
