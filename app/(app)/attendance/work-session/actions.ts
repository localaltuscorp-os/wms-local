"use server";

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { workSessions, workSessionShots } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import { asWorkerType } from "@/lib/attendance/worker-type";
import { getSupabaseAdmin, DOCUMENTS_BUCKET } from "@/lib/supabase/admin";

type ActionResult<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

const NOT_PROJECT_ERROR = "Work sessions are only for project / remote staff.";

/**
 * Start a screen-share capture session. Requires the signed-in caller to be a
 * `project_remote` worker. One `open` row is inserted; the client then streams
 * periodic screenshots to it via `addWorkSessionShot` and closes it with
 * `endWorkSession`.
 */
export async function startWorkSession(): Promise<ActionResult<{ sessionId: string }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  if (asWorkerType(me.workerType) !== "project_remote") {
    return { ok: false, error: NOT_PROJECT_ERROR };
  }

  try {
    const [row] = await db
      .insert(workSessions)
      .values({
        employeeId: me.id,
        startedAt: new Date(),
        source: "capture",
        status: "open",
      })
      .returning({ id: workSessions.id });
    if (!row) return { ok: false, error: "Could not start the session." };
    return { ok: true, sessionId: row.id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Could not start: ${msg.slice(0, 200)}` };
  }
}

/**
 * Upload one screen-share frame (a JPEG data-URL or bare base64 string) for an
 * OPEN session the caller owns, record it as a `work_session_shots` row and bump
 * the session's `screenshot_count`. Rejects sessions that aren't the caller's or
 * aren't open.
 */
export async function addWorkSessionShot(
  sessionId: string,
  imageBase64: string,
): Promise<ActionResult> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  if (!sessionId || typeof imageBase64 !== "string" || imageBase64.length === 0) {
    return { ok: false, error: "Nothing to save." };
  }

  // Own + open guard.
  const session = await db.query.workSessions.findFirst({
    where: and(eq(workSessions.id, sessionId), eq(workSessions.employeeId, me.id)),
  });
  if (!session) return { ok: false, error: "Session not found." };
  if (session.status !== "open") return { ok: false, error: "This session is already closed." };

  // Accept both a full data-URL ("data:image/jpeg;base64,AAAA…") and a raw
  // base64 payload; strip the prefix before decoding.
  const base64 = imageBase64.includes(",") ? imageBase64.slice(imageBase64.indexOf(",") + 1) : imageBase64;
  let buf: Buffer;
  try {
    buf = Buffer.from(base64, "base64");
  } catch {
    return { ok: false, error: "Bad image data." };
  }
  if (buf.length === 0) return { ok: false, error: "Empty image." };
  if (buf.length > 15 * 1024 * 1024) return { ok: false, error: "Screenshot exceeds 15 MB." };

  const takenAt = new Date();
  const path = `attendance/work-session/${me.id}/${sessionId}/${takenAt.getTime()}.jpg`;

  const admin = getSupabaseAdmin();
  const { error: upErr } = await admin.storage
    .from(DOCUMENTS_BUCKET)
    .upload(path, buf, { contentType: "image/jpeg", upsert: false });
  if (upErr) return { ok: false, error: `Screenshot upload failed: ${upErr.message}` };

  try {
    await db.insert(workSessionShots).values({ sessionId, path, takenAt });
    await db
      .update(workSessions)
      .set({
        screenshotCount: sql`${workSessions.screenshotCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(workSessions.id, sessionId));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await admin.storage.from(DOCUMENTS_BUCKET).remove([path]).catch(() => {});
    return { ok: false, error: `Could not save: ${msg.slice(0, 200)}` };
  }
  return { ok: true };
}

/**
 * Close an OPEN session the caller owns: stamp `ended_at` now, flip status to
 * `closed` and record the elapsed wall-clock minutes. Idempotent-ish — a session
 * that isn't the caller's open one is refused rather than silently rewritten.
 */
export async function endWorkSession(sessionId: string): Promise<ActionResult> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  if (!sessionId) return { ok: false, error: "Session not found." };

  const session = await db.query.workSessions.findFirst({
    where: and(eq(workSessions.id, sessionId), eq(workSessions.employeeId, me.id)),
  });
  if (!session) return { ok: false, error: "Session not found." };
  if (session.status !== "open") return { ok: true };

  const endedAt = new Date();
  const totalMinutes = Math.max(0, (endedAt.getTime() - session.startedAt.getTime()) / 60000);

  try {
    await db
      .update(workSessions)
      .set({
        endedAt,
        status: "closed",
        totalMinutes: totalMinutes.toFixed(2),
        updatedAt: new Date(),
      })
      .where(eq(workSessions.id, sessionId));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Could not close: ${msg.slice(0, 200)}` };
  }
  return { ok: true };
}
