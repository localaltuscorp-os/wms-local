"use server";

/**
 * Server Actions for per-task Attachments. Files land in the PRIVATE documents
 * bucket under `task-attachments/<taskId>/`; the read side (task-detail-extras)
 * hands out short-TTL signed URLs. Every mutation is authed + rate-limited and
 * revalidates the owning task's detail page.
 */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { taskAttachments, tasks } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import { getSupabaseAdmin, DOCUMENTS_BUCKET } from "@/lib/supabase/admin";
import { canEditTaskFields } from "@/lib/auth/task-permissions";
import { validateUpload } from "@/lib/hr/upload";

type Result = { ok: true } | { ok: false; error: string };

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * AUTHZ: attachment mutations trusted a client taskId/attachment-id with only
 * `requireUser()` — any employee could plant files on, or DELETE files from,
 * ANYONE's task (IDOR). Gate on whether the caller may edit the owning task.
 */
async function mayEditTask(taskId: string, me: { id: string; isAdmin: boolean }): Promise<boolean> {
  if (!UUID_RE.test(taskId)) return false;
  const [t] = await db
    .select({
      createdById: tasks.createdById,
      initiatorId: tasks.initiatorId,
      doerId: tasks.doerId,
      status: tasks.status,
    })
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);
  if (!t) return false;
  return canEditTaskFields({ employee: { id: me.id, isAdmin: me.isAdmin }, task: t });
}

/** Upload a file to a task. FormData carries `taskId` + `file`. */
export async function uploadTaskAttachment(fd: FormData): Promise<Result> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, error: limited.error };

  const taskId = String(fd.get("taskId") ?? "");
  if (!UUID_RE.test(taskId)) return { ok: false, error: "Missing task." };
  if (!(await mayEditTask(taskId, me))) return { ok: false, error: "You don't have access to this task." };

  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "No file provided." };
  if (file.size > MAX_BYTES) return { ok: false, error: "File too large (max 20 MB)." };
  // Deny-list dangerous types (html/svg/executables) — the same guard HR uploads
  // use — so an uploaded .svg/.html can't be served inline for stored XSS.
  const typeCheck = validateUpload(file);
  if (!typeCheck.ok) return typeCheck;

  const ext = (file.name.split(".").pop() ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `task-attachments/${taskId}/${randomUUID()}${ext ? `.${ext}` : ""}`;
  const buf = Buffer.from(await file.arrayBuffer());

  const admin = getSupabaseAdmin();
  const { error } = await admin.storage
    .from(DOCUMENTS_BUCKET)
    .upload(path, buf, { contentType: file.type || "application/octet-stream", upsert: false });
  if (error) return { ok: false, error: `Upload failed: ${error.message}` };

  await db.insert(taskAttachments).values({
    taskId,
    storagePath: path,
    fileName: file.name || "file",
    mime: file.type || null,
    sizeBytes: file.size,
    uploadedById: me.id,
  });

  revalidatePath(`/tasks/${taskId}`);
  return { ok: true };
}

/** Delete an attachment: best-effort remove from the bucket, then drop the row. */
export async function deleteTaskAttachment(id: string): Promise<Result> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, error: limited.error };

  const [row] = await db
    .select({ taskId: taskAttachments.taskId, storagePath: taskAttachments.storagePath })
    .from(taskAttachments)
    .where(eq(taskAttachments.id, id))
    .limit(1);
  if (!row) return { ok: false, error: "Attachment not found." };
  if (!(await mayEditTask(row.taskId, me)))
    return { ok: false, error: "You don't have access to this task." };

  const admin = getSupabaseAdmin();
  // Best-effort — a missing object shouldn't block removing the row.
  await admin.storage.from(DOCUMENTS_BUCKET).remove([row.storagePath]);

  await db.delete(taskAttachments).where(eq(taskAttachments.id, id));

  revalidatePath(`/tasks/${row.taskId}`);
  return { ok: true };
}
