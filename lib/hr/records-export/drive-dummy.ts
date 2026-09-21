import "server-only";
import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { join, posix, resolve, sep } from "node:path";
import { DUMMY_MODE, DUMMY_STORAGE_DIR } from "@/lib/db/dummy-dir";
import type { DriveClient } from "./types";

/**
 * DUMMY MODE's "Google Drive": a folder on disk, so the whole save — schedule,
 * progress, skip/overwrite, folder layout — can be exercised locally with no
 * Google account. Open `.dummy-storage/_google-drive/HR Records` to see what
 * the real save would have produced.
 *
 * Ids are paths relative to that folder. Refuses to exist outside dummy mode,
 * which lib/db/dummy-dir.ts already makes impossible in a production build.
 */
export const DUMMY_DRIVE_DIR = join(DUMMY_STORAGE_DIR, "_google-drive");

function abs(id: string): string {
  const root = resolve(DUMMY_DRIVE_DIR);
  const full = resolve(join(root, id));
  if (full !== root && !full.startsWith(root + sep)) throw new Error("Invalid dummy Drive path.");
  return full;
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export function dummyDriveClient(): DriveClient {
  if (!DUMMY_MODE) throw new Error("The on-disk Drive is only available in dummy mode.");
  return {
    async ensureFolder({ name, parentId, knownId }) {
      const id = posix.join(parentId ?? "", name);
      if (knownId && knownId !== id && (await exists(abs(knownId))) && !(await exists(abs(id)))) {
        await mkdir(abs(parentId ?? ""), { recursive: true });
        await rename(abs(knownId), abs(id)); // a rename, like Drive's
      }
      await mkdir(abs(id), { recursive: true });
      return id;
    },
    async putFile({ name, parentId, data, knownId }) {
      const id = posix.join(parentId, name);
      if (knownId && knownId !== id) await rm(abs(knownId), { force: true });
      await mkdir(abs(parentId), { recursive: true });
      await writeFile(abs(id), data);
      return id;
    },
  };
}
