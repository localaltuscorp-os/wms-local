import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { encryptSecret } from "@/lib/accounts/crypto";
import { isGoogleConfigured } from "@/lib/google/calendar";
import { DUMMY_MODE } from "@/lib/db/dummy-dir";
import { hrRecordsDriveItems, hrRecordsDriveSettings, type HrRecordsDriveSettingsRow } from "./schema";
import { clampDay, clampInterval, nextScheduledRun } from "./schedule";
import type { DriveStatus } from "./status";

/**
 * The one Google account the save may connect to. Enforced when connecting, so
 * an admin who happens to be signed in to their own Gmail cannot quietly point
 * every employee's Aadhaar scan at a personal Drive.
 */
export const HR_RECORDS_DRIVE_ACCOUNT = (process.env.HR_RECORDS_DRIVE_ACCOUNT || "hr.altuscorp@gmail.com")
  .trim()
  .toLowerCase();

export async function readDriveSettingsRow(): Promise<HrRecordsDriveSettingsRow> {
  const read = () => db.select().from(hrRecordsDriveSettings).where(eq(hrRecordsDriveSettings.id, 1)).limit(1);
  const [row] = await read();
  if (row) return row;
  // The migration seeds the row; this only covers a database built without it.
  await db.insert(hrRecordsDriveSettings).values({ id: 1 }).onConflictDoNothing();
  const [created] = await read();
  if (!created) throw new Error("HR records Drive settings are missing — has migration 0225 been applied?");
  return created;
}

export function toDriveStatus(row: HrRecordsDriveSettingsRow, now = new Date()): DriveStatus {
  const connected = Boolean(row.refreshTokenEnc);
  const next = connected
    ? nextScheduledRun(
        {
          enabled: row.scheduleEnabled,
          intervalMonths: row.intervalMonths,
          dayOfMonth: row.dayOfMonth,
          lastCompletedAt: row.lastCompletedAt,
        },
        now,
      )
    : null;
  return {
    expectedAccount: HR_RECORDS_DRIVE_ACCOUNT,
    connected,
    accountEmail: row.accountEmail,
    connectedAt: row.connectedAt?.toISOString() ?? null,
    googleConfigured: DUMMY_MODE || isGoogleConfigured(),
    dummyMode: DUMMY_MODE,
    dummyDriveFolder: DUMMY_MODE ? ".dummy-storage/_google-drive/HR Records" : null,
    scheduleEnabled: row.scheduleEnabled,
    intervalMonths: row.intervalMonths,
    dayOfMonth: row.dayOfMonth,
    nextRunAt: next?.toISOString() ?? null,
    lastCompletedAt: row.lastCompletedAt?.toISOString() ?? null,
    lastRunStartedAt: row.lastRunStartedAt?.toISOString() ?? null,
    inProgress: row.runCursor !== null,
    lastRunSummary: row.lastRunSummary ?? null,
    lastError: row.lastError,
  };
}

export async function getDriveStatus(): Promise<DriveStatus> {
  return toDriveStatus(await readDriveSettingsRow());
}

/**
 * Store a new connection. Connecting a DIFFERENT account forgets what was
 * uploaded (those Drive ids belong to the old account); reconnecting the SAME
 * account keeps it, so the next save updates the existing folders instead of
 * creating a second copy of everything.
 */
export async function markDriveConnected(input: { email: string; refreshToken: string; byId: string }): Promise<void> {
  const row = await readDriveSettingsRow();
  const switching = (row.accountEmail ?? "") !== input.email;
  if (switching) await db.delete(hrRecordsDriveItems);
  await db
    .update(hrRecordsDriveSettings)
    .set({
      accountEmail: input.email,
      refreshTokenEnc: encryptSecret(input.refreshToken),
      connectedAt: new Date(),
      connectedById: input.byId,
      lastError: null,
      lockUntil: null,
      ...(switching ? { runCursor: null, lastRunSummary: null, lastCompletedAt: null, lastRunStartedAt: null } : {}),
      updatedAt: new Date(),
    })
    .where(eq(hrRecordsDriveSettings.id, 1));
}

/**
 * Forget the token. What was uploaded is remembered, so reconnecting the same
 * account later picks up where it left off. The token is NOT revoked at Google:
 * a revoke withdraws the account's whole grant to this OAuth client, which
 * would also disconnect that account's Google Calendar sync if it has one.
 */
export async function disconnectDrive(): Promise<void> {
  await db
    .update(hrRecordsDriveSettings)
    .set({ refreshTokenEnc: null, connectedAt: null, connectedById: null, runCursor: null, lockUntil: null, lastError: null, updatedAt: new Date() })
    .where(eq(hrRecordsDriveSettings.id, 1));
}

export async function saveDriveSchedule(input: { enabled: boolean; intervalMonths: unknown; dayOfMonth: unknown }): Promise<void> {
  await readDriveSettingsRow();
  await db
    .update(hrRecordsDriveSettings)
    .set({
      scheduleEnabled: Boolean(input.enabled),
      intervalMonths: clampInterval(input.intervalMonths),
      dayOfMonth: clampDay(input.dayOfMonth),
      updatedAt: new Date(),
    })
    .where(eq(hrRecordsDriveSettings.id, 1));
}
