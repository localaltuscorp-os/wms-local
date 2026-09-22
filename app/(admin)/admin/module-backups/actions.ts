"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/current";
import { canManageModuleBackups } from "@/lib/modules/backup/access";
import { moduleBackupGrants, moduleBackupModules, moduleBackupSettings } from "@/lib/modules/backup/schema";
import { moduleBackup } from "@/lib/modules/backup/registry";
import { disconnectModuleDrive, MODULE_BACKUPS_PATH } from "@/lib/modules/backup/oauth";
import { runChunk, startRun, unfinishedRuns } from "@/lib/modules/backup/run";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

const NOT_ALLOWED = "Only a super-admin can change the module backups.";

/**
 * Everything the Module Backups page can change.
 *
 * Authorisation is checked HERE, against the REAL signed-in person:
 * `requireUser()` returns the effective identity under temporary access, and
 * borrowing someone's account must not borrow the authority to hand out an
 * export of every module.
 */
async function manager() {
  const me = await requireUser();
  if (!canManageModuleBackups(me)) return null;
  return me;
}

export async function setScheduleEnabled(enabled: boolean): Promise<ActionResult> {
  const me = await manager();
  if (!me) return { ok: false, error: NOT_ALLOWED };
  await db
    .update(moduleBackupSettings)
    .set({ scheduleEnabled: enabled, updatedAt: new Date() })
    .where(eq(moduleBackupSettings.id, 1));
  revalidatePath(MODULE_BACKUPS_PATH);
  return { ok: true, message: enabled ? "Nightly save is on." : "Nightly save is off." };
}

export async function setRunHour(hourIst: number): Promise<ActionResult> {
  const me = await manager();
  if (!me) return { ok: false, error: NOT_ALLOWED };
  if (!Number.isInteger(hourIst) || hourIst < 0 || hourIst > 23) {
    return { ok: false, error: "Pick an hour between 0 and 23." };
  }
  await db
    .update(moduleBackupSettings)
    .set({ runHourIst: hourIst, updatedAt: new Date() })
    .where(eq(moduleBackupSettings.id, 1));
  revalidatePath(MODULE_BACKUPS_PATH);
  return {
    ok: true,
    // Said plainly, because the cron entry in vercel.json is what actually
    // wakes the job: moving this hour alone does not move that.
    message: `Saved. The run starts at ${String(hourIst).padStart(2, "0")}:00 IST once the schedule in vercel.json matches.`,
  };
}

export async function setModuleEnabled(moduleId: string, enabled: boolean): Promise<ActionResult> {
  const me = await manager();
  if (!me) return { ok: false, error: NOT_ALLOWED };
  if (!moduleBackup(moduleId)) return { ok: false, error: "Unknown module." };
  await db
    .insert(moduleBackupModules)
    .values({ moduleId, enabled })
    .onConflictDoUpdate({
      target: moduleBackupModules.moduleId,
      set: { enabled, updatedAt: new Date() },
    });
  revalidatePath(MODULE_BACKUPS_PATH);
  return { ok: true };
}

export async function grantModuleExport(moduleId: string, employeeId: string): Promise<ActionResult> {
  const me = await manager();
  if (!me) return { ok: false, error: NOT_ALLOWED };
  if (!moduleBackup(moduleId)) return { ok: false, error: "Unknown module." };
  await db
    .insert(moduleBackupGrants)
    .values({ moduleId, employeeId, grantedById: me.id })
    .onConflictDoNothing();
  revalidatePath(MODULE_BACKUPS_PATH);
  return { ok: true };
}

export async function revokeModuleExport(moduleId: string, employeeId: string): Promise<ActionResult> {
  const me = await manager();
  if (!me) return { ok: false, error: NOT_ALLOWED };
  await db
    .delete(moduleBackupGrants)
    .where(
      and(eq(moduleBackupGrants.moduleId, moduleId), eq(moduleBackupGrants.employeeId, employeeId)),
    );
  revalidatePath(MODULE_BACKUPS_PATH);
  return { ok: true };
}

export async function disconnectDrive(): Promise<ActionResult> {
  const me = await manager();
  if (!me) return { ok: false, error: NOT_ALLOWED };
  await disconnectModuleDrive();
  revalidatePath(MODULE_BACKUPS_PATH);
  return { ok: true, message: "Disconnected. The nightly save cannot run until it is connected again." };
}

/**
 * "Save now" — start a run and do the first chunk here, so the person sees
 * something happen. A run too big for one request keeps its place and the
 * nightly job (or "Continue") carries it on.
 */
export async function runModuleNow(moduleId: string, full: boolean): Promise<ActionResult> {
  const me = await manager();
  if (!me) return { ok: false, error: NOT_ALLOWED };
  const def = moduleBackup(moduleId);
  if (!def) return { ok: false, error: "Unknown module." };
  try {
    const run = await startRun({
      moduleId,
      kind: full ? "full" : "incremental",
      requestedById: me.id,
    });
    const result = await runChunk(run, Date.now() + 120_000);
    revalidatePath(MODULE_BACKUPS_PATH);
    return {
      ok: true,
      message: result.done
        ? `${def.label} saved to Drive (${result.counts.files} file${result.counts.files === 1 ? "" : "s"}).`
        : `${def.label} is part-way through; the nightly run will finish it, or press Continue.`,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "The save failed." };
  }
}

/** Carry on whatever is unfinished, for as long as one request allows. */
export async function continueRuns(): Promise<ActionResult> {
  const me = await manager();
  if (!me) return { ok: false, error: NOT_ALLOWED };
  const deadline = Date.now() + 120_000;
  let finished = 0;
  let carried = 0;
  try {
    for (const run of await unfinishedRuns()) {
      if (Date.now() > deadline - 20_000) break;
      const result = await runChunk(run, deadline);
      if (result.done) finished++;
      else carried++;
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not continue." };
  }
  revalidatePath(MODULE_BACKUPS_PATH);
  if (finished === 0 && carried === 0) return { ok: true, message: "Nothing is waiting." };
  return {
    ok: true,
    message: `${finished} finished, ${carried} still going.`,
  };
}
