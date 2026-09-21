/**
 * HR Records export — the shapes shared by the ZIP download, the Drive save and
 * the settings screen. Client-safe: no server imports.
 */

/** The sub-folders every person's record is split into. Order = display order. */
export type RecordFolder = "Forms" | "Documents" | "Letters";
export const RECORD_FOLDERS: readonly RecordFolder[] = ["Forms", "Documents", "Letters"];

/**
 * One file in a person's record.
 *
 * `key` is stable for the life of the source row (a submission id, a storage
 * field …) so the Drive save can recognise the same file next month. `version`
 * changes whenever the bytes would — an updated_at, a new storage path — and is
 * what decides between "skip" and "overwrite". `load` is lazy on purpose: the
 * monthly save skips most files without ever downloading or rendering them.
 */
export interface RecordEntry {
  key: string;
  folder: RecordFolder;
  name: string;
  mime: string;
  version: string;
  load: () => Promise<Uint8Array | null>;
}

export interface PersonRef {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
}

/** The two Drive operations the save needs. Google in production, disk in dummy mode. */
export interface DriveClient {
  /** Return a live folder id: `knownId` if it still exists (renamed if needed), else a new folder. */
  ensureFolder(args: { name: string; parentId: string | null; knownId: string | null }): Promise<string>;
  /** Overwrite `knownId` in place if it still exists, else create the file. Returns its id. */
  putFile(args: {
    name: string;
    parentId: string;
    data: Uint8Array;
    mime: string;
    knownId: string | null;
  }): Promise<string>;
}

/**
 * The connection itself is broken (token revoked, account disconnected). Every
 * further file would fail the same way, so a pass stops instead of recording
 * the same failure once per file.
 */
export class DriveAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DriveAuthError";
  }
}

export interface LedgerItem {
  key: string;
  driveId: string;
  version: string | null;
  name: string | null;
}

export interface SyncFailure {
  person: string;
  file: string;
  error: string;
}

export interface RunSummary {
  trigger: "manual" | "schedule";
  startedAt: string;
  finishedAt: string | null;
  peopleTotal: number;
  peopleDone: number;
  /** People who had at least one file — everyone else gets no folder. */
  peopleWithFiles: number;
  uploaded: number;
  updated: number;
  unchanged: number;
  failed: number;
  /** The first few failures, verbatim. `failed` is the true count. */
  failures: SyncFailure[];
}

export const MAX_RECORDED_FAILURES = 25;

export function emptySummary(trigger: RunSummary["trigger"], nowMs: number): RunSummary {
  return {
    trigger,
    startedAt: new Date(nowMs).toISOString(),
    finishedAt: null,
    peopleTotal: 0,
    peopleDone: 0,
    peopleWithFiles: 0,
    uploaded: 0,
    updated: 0,
    unchanged: 0,
    failed: 0,
    failures: [],
  };
}
