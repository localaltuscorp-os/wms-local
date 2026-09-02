import { NextResponse } from "next/server";
import { inArray, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { workSessionShots } from "@/db/schema";
import { getSupabaseAdmin, DOCUMENTS_BUCKET } from "@/lib/supabase/admin";

/**
 * Work-session screenshot RETENTION cron. Screen-share proof frames (migration
 * 0178, project-remote worker type) accumulate fast — one every 10 minutes per
 * active session — so this purges the IMAGES older than the retention window
 * from both Supabase storage and the `work_session_shots` table.
 *
 * What it keeps: the `work_sessions` rows themselves and each session's
 * `screenshot_count` tally (the historical record of how many frames were
 * captured) — only the heavy image blobs + their shot rows are deleted.
 *
 * Always runs (no feature flag): retention must enforce whenever shots exist;
 * with no shots it is a clean no-op.
 *
 * Retention window: env `WORK_SESSION_SHOT_RETENTION_DAYS` (default 7).
 * Auth: `Authorization: Bearer <CRON_SECRET>` (Vercel Cron sets this).
 * Scheduled daily in vercel.json.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const DEFAULT_RETENTION_DAYS = 7;
const BATCH = 500; // storage.remove + delete in chunks

async function handle(request: Request): Promise<NextResponse> {
  // Constant-shape rejection — never reveal whether CRON_SECRET is set.
  const expected = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  if (!expected || header !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const days = Number(process.env.WORK_SESSION_SHOT_RETENTION_DAYS ?? DEFAULT_RETENTION_DAYS);
  const retentionDays = Number.isFinite(days) && days > 0 ? days : DEFAULT_RETENTION_DAYS;
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  try {
    const admin = getSupabaseAdmin();
    let deletedShots = 0;
    let removedBlobs = 0;

    // Loop in batches until nothing older than the cutoff remains.
    for (;;) {
      const stale = await db
        .select({ id: workSessionShots.id, path: workSessionShots.path })
        .from(workSessionShots)
        .where(lt(workSessionShots.takenAt, cutoff))
        .limit(BATCH);
      if (stale.length === 0) break;

      // 1) delete the storage blobs (best-effort — a missing object is fine).
      const paths = stale.map((s) => s.path);
      const { error } = await admin.storage.from(DOCUMENTS_BUCKET).remove(paths);
      if (!error) removedBlobs += paths.length;

      // 2) delete the DB rows for this batch.
      const ids = stale.map((s) => s.id);
      await db.delete(workSessionShots).where(inArray(workSessionShots.id, ids));
      deletedShots += ids.length;

      if (stale.length < BATCH) break;
    }

    return NextResponse.json({ ok: true, retentionDays, deletedShots, removedBlobs });
  } catch (err) {
    console.error("[cron/work-session-cleanup] failed", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export async function GET(request: Request): Promise<NextResponse> {
  return handle(request);
}
export async function POST(request: Request): Promise<NextResponse> {
  return handle(request);
}
