"use server";

/**
 * Task Time Intelligence — camera monitoring Server Actions. Transparent + super-
 * admin-viewable only: the employee explicitly consents once, sees a persistent
 * indicator while a session is live, and their browser prompts + shows a camera
 * indicator on every capture. Nothing is hidden. Snapshots land in the PRIVATE
 * documents bucket and are surfaced only to super-admins via short-TTL signed URLs.
 */
import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { taskWorkSessions, taskWorkSnapshots, taskTimeConsent } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import { getSupabaseAdmin, DOCUMENTS_BUCKET } from "@/lib/supabase/admin";
import { workCameraEnabled, CAMERA_POLICY_VERSION } from "@/lib/tasks/time/flags";

type Ok = { ok: true };
type Err = { ok: false; error: string };
type Result<T> = ({ ok: true } & T) | Err;

/** Record this employee's consent to camera monitoring during work sessions. */
export async function giveCameraConsent(): Promise<Ok | Err> {
  const me = await requireUser();
  await db
    .insert(taskTimeConsent)
    .values({ employeeId: me.id, consentedAt: new Date(), policyVersion: CAMERA_POLICY_VERSION })
    .onConflictDoUpdate({
      target: taskTimeConsent.employeeId,
      set: { consentedAt: new Date(), policyVersion: CAMERA_POLICY_VERSION },
    });
  return { ok: true };
}

/** Revoke consent — future sessions capture nothing until re-consented. */
export async function revokeCameraConsent(): Promise<Ok | Err> {
  const me = await requireUser();
  await db.delete(taskTimeConsent).where(eq(taskTimeConsent.employeeId, me.id));
  return { ok: true };
}

/**
 * Upload one snapshot for a live session. The caller must be the session's doer,
 * the session must still be live, and camera monitoring must be enabled + the
 * employee consented. Images only, ≤ 4 MB.
 */
export async function uploadWorkSnapshot(fd: FormData): Promise<Result<{ path: string }>> {
  if (!workCameraEnabled()) return { ok: false, error: "Camera monitoring is disabled." };
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, error: limited.error };

  const sessionId = String(fd.get("sessionId") ?? "");
  const file = fd.get("file");
  if (!(file instanceof File)) return { ok: false, error: "No image provided." };
  if (file.size > 4 * 1024 * 1024) return { ok: false, error: "Image too large (max 4 MB)." };
  if (!file.type.startsWith("image/")) return { ok: false, error: "Not an image." };

  // Consent + ownership + liveness gate.
  const [consent] = await db
    .select({ employeeId: taskTimeConsent.employeeId })
    .from(taskTimeConsent)
    .where(eq(taskTimeConsent.employeeId, me.id))
    .limit(1);
  if (!consent) return { ok: false, error: "No monitoring consent on file." };

  const [session] = await db
    .select({ id: taskWorkSessions.id, taskId: taskWorkSessions.taskId, doerId: taskWorkSessions.doerId })
    .from(taskWorkSessions)
    .where(and(eq(taskWorkSessions.id, sessionId), isNull(taskWorkSessions.endedAt)))
    .limit(1);
  if (!session) return { ok: false, error: "No live session." };
  if (session.doerId !== me.id) return { ok: false, error: "Not your session." };

  const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `work-monitoring/${session.taskId}/${sessionId}/${randomUUID()}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());
  const admin = getSupabaseAdmin();
  const { error } = await admin.storage
    .from(DOCUMENTS_BUCKET)
    .upload(path, buf, { contentType: file.type || "image/jpeg", upsert: false });
  if (error) return { ok: false, error: `Upload failed: ${error.message}` };

  await db.insert(taskWorkSnapshots).values({
    sessionId,
    taskId: session.taskId,
    doerId: me.id,
    storagePath: path,
    capturedAt: new Date(),
  });
  return { ok: true, path };
}
