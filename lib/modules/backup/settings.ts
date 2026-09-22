import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { decryptSecret } from "@/lib/accounts/crypto";
import { accessTokenFromRefresh } from "@/lib/google/calendar";
import { googleDriveClient } from "@/lib/hr/records-export/drive-google";
import { DriveAuthError, type DriveClient } from "@/lib/hr/records-export/types";
import { moduleBackupModules, moduleBackupSettings, type ModuleBackupSettingsRow } from "./schema";

/**
 * The one Google account the module backup may connect to, and the Drive client
 * built from the stored token.
 *
 * SEPARATE FROM THE HR RECORDS ACCOUNT ON PURPOSE (21 Sep). The per-person HR
 * backup writes to hr.altuscorp@gmail.com; this writes wherever
 * MODULE_BACKUP_DRIVE_ACCOUNT points — local.altuscorp@gmail.com while testing,
 * support@unleashed.in in production. The two connections are independent.
 *
 * The REST client itself is shared with the HR backup rather than copied:
 * one Drive implementation, two callers.
 */
export const MODULE_BACKUP_DRIVE_ACCOUNT = (
  process.env.MODULE_BACKUP_DRIVE_ACCOUNT || "local.altuscorp@gmail.com"
)
  .trim()
  .toLowerCase();

/** The folder the app creates in that Drive; everything lands inside it. */
export const MODULE_BACKUP_ROOT_FOLDER =
  process.env.MODULE_BACKUP_ROOT_FOLDER?.trim() || "Altus Module Backups";

export async function readSettings(): Promise<ModuleBackupSettingsRow> {
  const read = () =>
    db.select().from(moduleBackupSettings).where(eq(moduleBackupSettings.id, 1)).limit(1);
  const [row] = await read();
  if (row) return row;
  // The migration seeds this row; this only covers a database built without it.
  await db.insert(moduleBackupSettings).values({ id: 1 }).onConflictDoNothing();
  const [created] = await read();
  if (!created) {
    throw new Error("Module backup settings are missing — has migration 0244 been applied?");
  }
  return created;
}

export async function markConnected(args: {
  email: string;
  refreshTokenEnc: string;
  byId: string;
}): Promise<void> {
  await db
    .update(moduleBackupSettings)
    .set({
      accountEmail: args.email,
      refreshTokenEnc: args.refreshTokenEnc,
      connectedById: args.byId,
      connectedAt: new Date(),
      // A different account means a different Drive: the old root folder id
      // points at a folder this token cannot see, so forget it.
      rootFolderId: null,
      lastError: null,
      updatedAt: new Date(),
    })
    .where(eq(moduleBackupSettings.id, 1));
}

export async function disconnect(): Promise<void> {
  await db
    .update(moduleBackupSettings)
    .set({
      accountEmail: null,
      refreshTokenEnc: null,
      connectedById: null,
      connectedAt: null,
      rootFolderId: null,
      updatedAt: new Date(),
    })
    .where(eq(moduleBackupSettings.id, 1));
}

/**
 * A Drive client for the connected account, or a DriveAuthError explaining that
 * somebody has to reconnect. Callers treat that error as "stop and tell them",
 * never as "try again": a revoked token does not heal by retrying.
 */
export async function driveClient(): Promise<DriveClient> {
  const row = await readSettings();
  if (!row.refreshTokenEnc) {
    throw new DriveAuthError(
      `Google Drive is not connected. Connect ${MODULE_BACKUP_DRIVE_ACCOUNT} on the Module Backups page.`,
    );
  }
  let accessToken: string;
  try {
    accessToken = await accessTokenFromRefresh(decryptSecret(row.refreshTokenEnc));
  } catch (err) {
    throw new DriveAuthError(
      `Google refused the stored connection (${(err as Error).message.slice(0, 120)}). Reconnect ${MODULE_BACKUP_DRIVE_ACCOUNT} on the Module Backups page.`,
    );
  }
  return googleDriveClient(accessToken);
}

/** The per-module row, created on first sight so callers never handle "missing". */
export async function moduleState(moduleId: string) {
  const read = () =>
    db.select().from(moduleBackupModules).where(eq(moduleBackupModules.moduleId, moduleId)).limit(1);
  const [row] = await read();
  if (row) return row;
  await db.insert(moduleBackupModules).values({ moduleId }).onConflictDoNothing();
  const [created] = await read();
  if (!created) throw new Error(`Could not create the backup row for module ${moduleId}`);
  return created;
}

/**
 * Move the watermark forward after a successful run. Everything up to `through`
 * is now in Drive, so the next run starts there.
 */
export async function markExported(args: {
  moduleId: string;
  through: Date;
  wasFull: boolean;
}): Promise<void> {
  await db
    .update(moduleBackupModules)
    .set({
      exportedThrough: args.through,
      lastRunAt: new Date(),
      ...(args.wasFull ? { lastFullAt: new Date() } : {}),
      updatedAt: new Date(),
    })
    .where(eq(moduleBackupModules.moduleId, args.moduleId));
}

export async function recordSettingsError(message: string | null): Promise<void> {
  await db
    .update(moduleBackupSettings)
    .set({ lastError: message?.slice(0, 500) ?? null, updatedAt: sql`now()` })
    .where(eq(moduleBackupSettings.id, 1));
}
