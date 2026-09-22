import "server-only";
import { and, asc, count, eq, gt, inArray, isNotNull, isNull, lt, ne, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees } from "@/db/schema";
import { decryptSecret } from "@/lib/accounts/crypto";
import { accessTokenFromRefresh } from "@/lib/google/calendar";
import { DUMMY_MODE } from "@/lib/db/dummy-dir";
import { collectRecordEntries, type ExportSubject } from "./collect";
import { dummyDriveClient } from "./drive-dummy";
import { googleDriveClient } from "./drive-google";
import { hrRecordsDriveItems, hrRecordsDriveSettings } from "./schema";
import { readDriveSettingsRow } from "./settings";
import { isScheduledRunDue } from "./schedule";
import { syncChunk, type SyncDeps } from "./sync-core";
import { DriveAuthError, emptySummary, type DriveClient, type RunSummary } from "./types";

/**
 * The Drive save wired to the real database, storage and Google. The rules
 * live in ./sync-core.ts; this file is locking, progress and plumbing.
 *
 * ONE SAVE AT A TIME. `lock_until` is claimed with a conditional UPDATE, so the
 * nightly cron and a "Save to Drive now" click can never write the same folder
 * concurrently. The lock is extended after every person and expires on its own
 * if the function running it is killed.
 *
 * RESUMABLE. A save that runs out of its time budget leaves `run_cursor` at the
 * last person finished; the next call — the next click, or the next night's
 * cron — continues from there.
 */

const LOCK_UNTIL = sql`now() + interval '6 minutes'`;

export type SyncRunResult =
  | { status: "not-connected" }
  | { status: "busy" }
  | { status: "error"; error: string; summary: RunSummary | null }
  | { status: "partial"; summary: RunSummary }
  | { status: "done"; summary: RunSummary };

const PERSON_COLS = {
  id: employees.id,
  name: employees.name,
  email: employees.email,
  isActive: employees.isActive,
  personalEmail: employees.personalEmail,
  officialEmail: employees.officialEmail,
} as const;

/** Everyone except candidate guest accounts — current AND former employees. */
const IN_SCOPE = ne(employees.accountType, "candidate");

async function driveFor(refreshTokenEnc: string): Promise<DriveClient> {
  if (DUMMY_MODE) return dummyDriveClient();
  let accessToken: string;
  try {
    accessToken = await accessTokenFromRefresh(decryptSecret(refreshTokenEnc));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/invalid_grant|invalid_client|unauthorized_client/i.test(message)) {
      throw new DriveAuthError(
        "The Google Drive connection has expired or was removed in the Google account. Reconnect it on the HR Records Backup page.",
      );
    }
    throw err;
  }
  return googleDriveClient(accessToken);
}

const settingsRow = eq(hrRecordsDriveSettings.id, 1);
/** Writes from a running save only land while the account is still connected. */
const stillConnected = and(settingsRow, isNotNull(hrRecordsDriveSettings.refreshTokenEnc));

export async function runDriveSync(opts: { trigger: RunSummary["trigger"]; budgetMs: number }): Promise<SyncRunResult> {
  const startedAt = Date.now();

  const [locked] = await db
    .update(hrRecordsDriveSettings)
    .set({ lockUntil: LOCK_UNTIL })
    .where(
      and(
        stillConnected,
        or(isNull(hrRecordsDriveSettings.lockUntil), lt(hrRecordsDriveSettings.lockUntil, sql`now()`)),
      ),
    )
    .returning();
  if (!locked) {
    const row = await readDriveSettingsRow();
    return row.refreshTokenEnc ? { status: "busy" } : { status: "not-connected" };
  }

  let summary: RunSummary | null = locked.lastRunSummary ?? null;
  try {
    const drive = await driveFor(locked.refreshTokenEnc!);

    let cursor = locked.runCursor;
    if (cursor === null || !summary) {
      summary = emptySummary(opts.trigger, Date.now());
      const [total] = await db.select({ n: count() }).from(employees).where(IN_SCOPE);
      summary.peopleTotal = Number(total?.n ?? 0);
      cursor = "";
      await db
        .update(hrRecordsDriveSettings)
        .set({ runCursor: "", lastRunStartedAt: new Date(), lastRunSummary: summary, lastError: null, updatedAt: new Date() })
        .where(stillConnected);
    }

    const subjects = new Map<string, ExportSubject>();
    const deps: SyncDeps = {
      drive,
      listPeople: async (afterId) => {
        const rows = await db
          .select(PERSON_COLS)
          .from(employees)
          .where(afterId ? and(IN_SCOPE, gt(employees.id, afterId)) : IN_SCOPE)
          .orderBy(asc(employees.id));
        for (const r of rows) subjects.set(r.id, r);
        return rows;
      },
      collect: (person) => collectRecordEntries(subjects.get(person.id) ?? { ...person, personalEmail: null, officialEmail: null }),
      ledgerGet: async (keys) => {
        if (keys.length === 0) return new Map();
        const rows = await db.select().from(hrRecordsDriveItems).where(inArray(hrRecordsDriveItems.key, keys));
        return new Map(rows.map((r) => [r.key, { key: r.key, driveId: r.driveId, version: r.version, name: r.name }]));
      },
      ledgerPut: async (item, employeeId) => {
        const values = { driveId: item.driveId, version: item.version, name: item.name, employeeId, updatedAt: new Date() };
        await db
          .insert(hrRecordsDriveItems)
          .values({ key: item.key, ...values })
          .onConflictDoUpdate({ target: hrRecordsDriveItems.key, set: values });
      },
      saveProgress: async (nextCursor, progress) => {
        await db
          .update(hrRecordsDriveSettings)
          .set({ runCursor: nextCursor, lastRunSummary: progress, lockUntil: LOCK_UNTIL, updatedAt: new Date() })
          .where(stillConnected);
      },
      now: () => Date.now(),
    };

    const res = await syncChunk(deps, { cursor: cursor || null, summary, deadline: startedAt + opts.budgetMs });
    summary = res.summary;
    await db
      .update(hrRecordsDriveSettings)
      .set(
        res.done
          ? { runCursor: null, lastCompletedAt: new Date(), lastRunSummary: res.summary, lockUntil: null, updatedAt: new Date() }
          : { runCursor: res.cursor ?? cursor, lastRunSummary: res.summary, lockUntil: null, updatedAt: new Date() },
      )
      .where(stillConnected);
    return { status: res.done ? "done" : "partial", summary: res.summary };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[hr-records-drive] save stopped:", message);
    // run_cursor is left alone, so the next attempt resumes rather than restarts.
    await db
      .update(hrRecordsDriveSettings)
      .set({ lockUntil: null, lastError: message.slice(0, 500), updatedAt: new Date() })
      .where(settingsRow);
    return { status: "error", error: message, summary };
  }
}

/**
 * The nightly cron's entry point. Does nothing unless the schedule is on and
 * either a save is due or one is part-way through (it then continues it).
 */
export async function runScheduledDriveSync(
  maxMs: number,
): Promise<{ ran: false; reason: string } | { ran: true; result: SyncRunResult }> {
  const row = await readDriveSettingsRow();
  if (!row.refreshTokenEnc) return { ran: false, reason: "not-connected" };
  if (!row.scheduleEnabled) return { ran: false, reason: "schedule-off" };
  const due = isScheduledRunDue(
    { enabled: true, intervalMonths: row.intervalMonths, dayOfMonth: row.dayOfMonth, lastCompletedAt: row.lastCompletedAt },
    new Date(),
  );
  if (row.runCursor === null && !due) return { ran: false, reason: "not-due" };
  const result = await runDriveSync({ trigger: "schedule", budgetMs: maxMs });
  return { ran: true, result };
}
