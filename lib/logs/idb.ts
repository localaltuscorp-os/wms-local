/**
 * TINY INDEXEDDB BUFFER for client activity events.
 *
 * The activity tracker writes events here first and flushes them in batches to
 * `/api/logs/ingest`. Rows are deleted only after the server confirms them
 * (2xx), so a crash, a logout or an offline stretch never silently discards
 * unsent activity. No dependency — raw IndexedDB, promise-wrapped.
 *
 * CLIENT-ONLY. Imported by the tracker, never by server code.
 */

const DB_NAME = "wms-activity";
const STORE = "activity";

export interface PendingEvent {
  /** Auto-increment key assigned by IndexedDB; used to delete after ack. */
  id?: number;
  /** Server-side dedupe key (unique in activity_logs). */
  clientEventId: string;
  type: string;
  route: string;
  /** ISO timestamp the event actually happened, preserved through the buffer. */
  occurredAt: string;
  resourceType?: string | null;
  resourceId?: string | null;
  resourceName?: string | null;
  query?: string | null;
  /** Milliseconds spent on the PREVIOUS page, attached to the new page's visit. */
  estimatedMs?: number | null;
  metadata?: Record<string, unknown> | null;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

/** Buffer one event. */
export function idbPut(event: PendingEvent): Promise<number> {
  return withStore<IDBValidKey>("readwrite", (store) => store.add(event)).then((k) =>
    typeof k === "number" ? k : 0,
  );
}

/** Read the whole buffer, oldest first. */
export function idbAll(): Promise<PendingEvent[]> {
  return withStore<PendingEvent[]>("readonly", (store) => store.getAll()).then((rows) =>
    rows.sort((a, b) => (a.id ?? 0) - (b.id ?? 0)),
  );
}

/** Delete the acknowledged rows by their IndexedDB key. */
export function idbDeleteMany(ids: number[]): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        const store = tx.objectStore(STORE);
        for (const id of ids) store.delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      }),
  );
}

/** Number of buffered rows — used to avoid a full read just to count. */
export function idbCount(): Promise<number> {
  return withStore<number>("readonly", (store) => store.count());
}
