import { backupStorageToDrive } from "./drive";
import { backupDatabaseToSheet } from "./sheets";

/**
 * The full nightly backup: all DB tables → the Google Sheet, all Storage files
 * → the Shared Drive folder. Shared by the manual script, the cron route, and
 * the admin "Back up now" button. Target IDs come from env (set in Vercel) with
 * the provisioned defaults.
 */
export const BACKUP_SHEET_ID =
  process.env.BACKUP_SHEET_ID ?? "1xU_9Kjjrv7GRXYAjpnhLj0b0t_N60dBBCojqb-U0Xps";
export const BACKUP_DRIVE_FOLDER_ID =
  process.env.BACKUP_DRIVE_FOLDER_ID ?? "0ALJFA5WVkWSJUk9PVA";

export interface BackupSummary {
  sheet: { tables: number; rows: number };
  files: { uploaded: number; skipped: number; total: number };
}

export async function runFullBackup(): Promise<BackupSummary> {
  const sheet = await backupDatabaseToSheet(BACKUP_SHEET_ID);
  const files = await backupStorageToDrive(BACKUP_DRIVE_FOLDER_ID);
  return { sheet, files };
}
