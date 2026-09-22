import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { DriveAuthError } from "@/lib/hr/records-export/types";
import { moduleBackupModules } from "@/lib/modules/backup/schema";
import { BACKUP_MODULE_IDS } from "@/lib/modules/backup/registry";
import { readSettings, recordSettingsError } from "@/lib/modules/backup/settings";
import { runChunk, startRun, unfinishedRuns } from "@/lib/modules/backup/run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * THE NIGHTLY MODULE BACKUP — every module into Google Drive at 03:00 IST.
 *
 * Scheduled in vercel.json at 21:30 UTC. Asked for on 21 Sep: "there will be a
 * cron job which will be storing data every day 3 am".
 *
 * ── WHY THIS ROUTE CALLS ITSELF ────────────────────────────────────────────
 * An invocation has five minutes; the first export of fifteen modules will not
 * fit. Rather than a second schedule (the project is already carrying 42 cron
 * entries), an invocation that runs out of time starts the next one and
 * returns. Each link in that chain does real work and saves its place, so the
 * worst a failure costs is one chunk — the next night, or a press of "Continue"
 * on the page, picks it up from the database.
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>`, which Vercel Cron sets, and
 * which a self-call repeats. Same check as the other 42 crons.
 */

/** Leave this much of the budget to start the next link and answer. */
const HANDOVER_MS = 30_000;

function authorised(req: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false; // fail closed: an unset secret is not "open to all"
  return req.headers.get("authorization") === `Bearer ${expected}`;
}

export async function GET(req: Request) {
  if (!authorised(req)) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }

  const started = Date.now();
  const deadline = started + (maxDuration - 20) * 1000;
  const settings = await readSettings();
  if (!settings.scheduleEnabled) {
    return NextResponse.json({ skipped: "schedule is switched off" });
  }
  if (!settings.refreshTokenEnc) {
    return NextResponse.json({ skipped: "Google Drive is not connected" }, { status: 200 });
  }

  const done: string[] = [];
  const carried: string[] = [];
  let handedOver = false;

  try {
    // 1. Anything left unfinished from an earlier run comes first: a half-done
    //    export is worth more than a newly started one.
    for (const run of await unfinishedRuns()) {
      if (Date.now() > deadline - HANDOVER_MS) break;
      const result = await runChunk(run, deadline);
      (result.done ? done : carried).push(result.moduleId);
    }

    // 2. Then every module that has not been exported since yesterday.
    for (const moduleId of BACKUP_MODULE_IDS) {
      if (Date.now() > deadline - HANDOVER_MS) break;
      const [state] = await db
        .select()
        .from(moduleBackupModules)
        .where(eq(moduleBackupModules.moduleId, moduleId))
        .limit(1);
      if (state && state.enabled === false) continue;
      if (state?.lastRunAt && Date.now() - state.lastRunAt.getTime() < 20 * 60 * 60 * 1000) {
        continue; // already saved today
      }
      const run = await startRun({ moduleId, kind: "incremental" });
      const result = await runChunk(run, deadline);
      (result.done ? done : carried).push(result.moduleId);
    }

    // 3. Out of time with work left? Start the next link and let it carry on.
    if (carried.length > 0 || (await unfinishedRuns(1)).length > 0) {
      handedOver = await handOver(req);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (err instanceof DriveAuthError) await recordSettingsError(message);
    console.error("[cron/module-backup]", message);
    return NextResponse.json({ error: message, done, carried }, { status: 500 });
  }

  return NextResponse.json({
    done,
    carried,
    handedOver,
    tookMs: Date.now() - started,
  });
}

/** Fire the next invocation without waiting for it. */
async function handOver(req: Request): Promise<boolean> {
  const url = new URL(req.url);
  try {
    // No await on the body: this only needs to reach Vercel, not to finish.
    void fetch(url.toString(), {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    }).catch(() => {});
    return true;
  } catch {
    return false;
  }
}
