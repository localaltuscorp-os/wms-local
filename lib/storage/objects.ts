import "server-only";

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { DUMMY_MODE, DUMMY_STORAGE_DIR } from "@/lib/db/dummy-dir";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Object storage, with ONE seam for dummy mode.
 *
 * Every upload in this app goes to a private Supabase Storage bucket and comes
 * back as a short-lived signed URL. That is right in production and wrong in
 * DUMMY_MODE, whose whole promise is an app that runs with no Supabase and no
 * Firebase (lib/db/dummy-dir.ts): the database was swapped for PGlite but
 * storage was not, so every upload still called the live project and came back
 * "Upload failed: signature verification failed" — the remote service rejecting
 * a JWT, surfaced verbatim to someone who was told they needed nothing remote.
 *
 * So the three storage verbs live here, and dummy mode answers them from disk.
 * Callers do not branch: they say put / sign / remove, and the mode decides.
 *
 * THE PATH IS THE CONTRACT. `storage_path` in the database addresses the object
 * in either backend — the same string is a key in the bucket and a relative
 * path under DUMMY_STORAGE_DIR. Nothing about a row has to know which backend
 * wrote it, so a dummy database and a real one hold the same shape of row.
 *
 * DUMMY IS NOT A SECOND IMPLEMENTATION OF SUPABASE. There is no ACL, no expiry
 * enforcement and no quota; a "signed" URL is just a dev-only route that reads
 * the file. It exists so the real screens work offline, not to be a storage
 * service — which is also why it is unreachable outside development.
 */

/** Fixed prefix of the dev-only route that serves dummy objects. */
export const DUMMY_OBJECT_ROUTE = "/api/dummy-storage";

/**
 * Resolve `<bucket>/<path>` under the dummy root, refusing anything that climbs
 * out of it.
 *
 * `storage_path` is built from ids the app generates, so this is not the day's
 * likely attack — but it is the one function that turns a database string into
 * a filesystem path, and the check costs a comparison. Returns null rather than
 * throwing so both the writer and the reader can treat it as "no such object".
 */
export function resolveDummyObjectPath(bucket: string, path: string): string | null {
  // The bucket is a single directory name, never a path — "." and ".." are the
  // two values that would otherwise make the confinement below meaningless by
  // moving the directory it confines things to.
  if (!/^[A-Za-z0-9._-]+$/.test(bucket) || bucket === "." || bucket === "..") return null;

  // Confined to the BUCKET, not merely to the storage root. Checking the root
  // alone let "../escape.txt" out of `documents/` and into the root beside it —
  // still inside the sandbox, but no longer the object the caller named, which
  // is exactly the confusion a traversal check exists to prevent.
  const bucketRoot = resolve(join(DUMMY_STORAGE_DIR, bucket));
  const full = resolve(join(bucketRoot, path));
  return full.startsWith(bucketRoot + sep) ? full : null;
}

/** Store bytes at `path` in `bucket`. */
export async function putObject(
  bucket: string,
  path: string,
  body: Buffer,
  contentType: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (DUMMY_MODE) {
    const full = resolveDummyObjectPath(bucket, path);
    if (!full) return { ok: false, error: "Invalid storage path." };
    try {
      await mkdir(dirname(full), { recursive: true });
      // `wx` — fail if it exists, matching Supabase's `upsert: false`. Every
      // caller mints a UUID for the key, so a collision is a bug worth hearing
      // about rather than an overwrite to wave through.
      await writeFile(full, body, { flag: "wx" });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  const { error } = await getSupabaseAdmin()
    .storage.from(bucket)
    .upload(path, body, { contentType, upsert: false });
  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * A URL the browser can fetch the object from, or null when there is none.
 *
 * In dummy mode the TTL is accepted and ignored: the route it points at is
 * dev-only and reads straight off disk, so there is nothing for an expiry to
 * protect. Callers keep passing one because in production it is real.
 */
export async function createSignedObjectUrl(
  bucket: string,
  path: string,
  ttlSeconds: number,
): Promise<string | null> {
  if (DUMMY_MODE) {
    // Each segment encoded separately — a file named "q&a.pdf" must not have
    // its own name read as a query string, and "/" must stay a separator.
    const encoded = path.split("/").map(encodeURIComponent).join("/");
    return `${DUMMY_OBJECT_ROUTE}/${encodeURIComponent(bucket)}/${encoded}`;
  }
  const { data } = await getSupabaseAdmin()
    .storage.from(bucket)
    .createSignedUrl(path, ttlSeconds);
  return data?.signedUrl ?? null;
}

/** Delete objects. Best-effort by design — the database row is the record. */
export async function removeObjects(bucket: string, paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  if (DUMMY_MODE) {
    await Promise.all(
      paths.map(async (p) => {
        const full = resolveDummyObjectPath(bucket, p);
        if (full) await rm(full, { force: true });
      }),
    );
    return;
  }
  await getSupabaseAdmin().storage.from(bucket).remove(paths);
}

/** Read one dummy object back. Only the dev-only serving route calls this. */
export async function readDummyObject(
  bucket: string,
  path: string,
): Promise<Buffer | null> {
  const full = resolveDummyObjectPath(bucket, path);
  if (!full) return null;
  try {
    return await readFile(full);
  } catch {
    return null;
  }
}
