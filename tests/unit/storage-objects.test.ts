import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("server-only", () => ({}));

/**
 * DUMMY-MODE OBJECT STORAGE — the disk backend behind lib/storage/objects.ts.
 *
 * The bug these cover: dummy mode swapped the database for PGlite but left
 * uploads pointed at the live Supabase project, so attaching a file to a plan
 * row failed with the remote service's own "signature verification failed" in
 * an app that is supposed to need nothing remote.
 *
 * Supabase is mocked to a client that THROWS. That is the assertion that
 * matters most here: if a code path ever reaches the network in dummy mode,
 * these fail loudly rather than quietly passing on a stubbed success.
 */
vi.mock("@/lib/supabase/admin", () => ({
  DOCUMENTS_BUCKET: "documents",
  getSupabaseAdmin: () => {
    throw new Error("dummy mode must never reach Supabase");
  },
}));

let dir: string;
/** Re-imported per test, because DUMMY_MODE and the root are read at load. */
let objects: typeof import("@/lib/storage/objects");

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "wms-storage-"));
  vi.resetModules();
  vi.stubEnv("DUMMY_MODE", "true");
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("DUMMY_STORAGE_DIR", dir);
  objects = await import("@/lib/storage/objects");
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(dir, { recursive: true, force: true });
});

describe("putObject / readDummyObject", () => {
  it("round-trips bytes at the path the database row stores", async () => {
    const path = "project-node-attachments/node-1/file.xlsx";
    const body = Buffer.from("sheet-bytes");

    const put = await objects.putObject("documents", path, body, "application/vnd.ms-excel");
    expect(put).toEqual({ ok: true });

    // On disk as <root>/<bucket>/<path> — one storage_path addressing both
    // backends is the whole contract.
    expect(await readFile(join(dir, "documents", path))).toEqual(body);
    expect(await objects.readDummyObject("documents", path)).toEqual(body);
  });

  it("refuses a second write to the same key, like upsert:false", async () => {
    const path = "documents/a.txt";
    expect(await objects.putObject("documents", path, Buffer.from("one"), "text/plain")).toEqual({
      ok: true,
    });
    const second = await objects.putObject("documents", path, Buffer.from("two"), "text/plain");
    expect(second.ok).toBe(false);
    // The first write stands — a collision must never silently overwrite.
    expect(await objects.readDummyObject("documents", path)).toEqual(Buffer.from("one"));
  });

  it("returns null for an object that was never written", async () => {
    expect(await objects.readDummyObject("documents", "nope.pdf")).toBeNull();
  });
});

describe("path traversal", () => {
  it("refuses a key that climbs out of the storage root", async () => {
    for (const bad of ["../escape.txt", "a/../../escape.txt"]) {
      expect(objects.resolveDummyObjectPath("documents", bad)).toBeNull();
      const put = await objects.putObject("documents", bad, Buffer.from("x"), "text/plain");
      expect(put.ok).toBe(false);
      expect(await objects.readDummyObject("documents", bad)).toBeNull();
    }
  });

  it("refuses a key that leaves its BUCKET, even staying inside the root", async () => {
    // The regression: confining only to the storage root let this out of
    // `documents/` and into the root beside it — sandboxed, but no longer the
    // object the caller named.
    expect(objects.resolveDummyObjectPath("documents", "../avatars/steal.png")).toBeNull();
    const put = await objects.putObject(
      "documents",
      "../avatars/steal.png",
      Buffer.from("x"),
      "image/png",
    );
    expect(put.ok).toBe(false);
  });

  it("refuses a bucket name that is a path of its own", () => {
    for (const bad of ["..", ".", "a/b", "../documents"]) {
      expect(objects.resolveDummyObjectPath(bad, "f.txt")).toBeNull();
    }
  });

  it("allows an ordinary nested key", () => {
    expect(objects.resolveDummyObjectPath("documents", "a/b/c.pdf")).not.toBeNull();
  });
});

describe("createSignedObjectUrl", () => {
  it("points at the dev-only route and encodes each segment", async () => {
    const url = await objects.createSignedObjectUrl("documents", "dir/q&a report.pdf", 60);
    expect(url).toBe("/api/dummy-storage/documents/dir/q%26a%20report.pdf");
    // "/" stayed a separator rather than being encoded away with the rest.
    expect(url!.split("/").slice(1)).toEqual([
      "api",
      "dummy-storage",
      "documents",
      "dir",
      "q%26a%20report.pdf",
    ]);
  });
});

describe("removeObjects", () => {
  it("deletes what it wrote and tolerates what is already gone", async () => {
    await objects.putObject("documents", "gone.txt", Buffer.from("x"), "text/plain");
    await objects.removeObjects("documents", ["gone.txt", "never-existed.txt"]);
    expect(await objects.readDummyObject("documents", "gone.txt")).toBeNull();
  });

  it("does nothing at all for an empty list", async () => {
    await expect(objects.removeObjects("documents", [])).resolves.toBeUndefined();
  });
});
