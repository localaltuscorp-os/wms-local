import "server-only";

/**
 * Super-admin-only read of a task's camera snapshots, as short-TTL signed URLs
 * from the private documents bucket. Callers MUST gate on super-admin before
 * invoking this (the loader does).
 */
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { taskWorkSnapshots } from "@/db/schema";
import { getSupabaseAdmin, DOCUMENTS_BUCKET } from "@/lib/supabase/admin";

export interface SnapshotView {
  id: string;
  sessionId: string;
  capturedAt: string;
  url: string | null;
}

const SIGN_TTL_SECONDS = 60 * 30; // 30 minutes

export async function getTaskSnapshots(taskId: string): Promise<SnapshotView[]> {
  const rows = await db
    .select({
      id: taskWorkSnapshots.id,
      sessionId: taskWorkSnapshots.sessionId,
      capturedAt: taskWorkSnapshots.capturedAt,
      storagePath: taskWorkSnapshots.storagePath,
    })
    .from(taskWorkSnapshots)
    .where(eq(taskWorkSnapshots.taskId, taskId))
    .orderBy(asc(taskWorkSnapshots.capturedAt));
  if (rows.length === 0) return [];

  const admin = getSupabaseAdmin();
  const out: SnapshotView[] = [];
  for (const r of rows) {
    const { data } = await admin.storage.from(DOCUMENTS_BUCKET).createSignedUrl(r.storagePath, SIGN_TTL_SECONDS);
    out.push({
      id: r.id,
      sessionId: r.sessionId,
      capturedAt: r.capturedAt.toISOString(),
      url: data?.signedUrl ?? null,
    });
  }
  return out;
}
