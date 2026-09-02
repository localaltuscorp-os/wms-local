import "server-only";

/**
 * Read side for the two task-detail extras: the per-task Checklist and the
 * per-task Attachments. Both are surfaced on the task detail page. Attachment
 * URLs are short-TTL signed URLs from the private documents bucket, so a link
 * is only usable for a few minutes after the page renders.
 */
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { taskChecklistItems, taskAttachments, employees } from "@/db/schema";
import { getSupabaseAdmin, DOCUMENTS_BUCKET } from "@/lib/supabase/admin";

const SIGN_TTL_SECONDS = 60 * 30; // 30 minutes

export interface ChecklistItemView {
  id: string;
  label: string;
  done: boolean;
  sortOrder: number;
}

export async function getTaskChecklist(taskId: string): Promise<ChecklistItemView[]> {
  const rows = await db
    .select({
      id: taskChecklistItems.id,
      label: taskChecklistItems.label,
      done: taskChecklistItems.done,
      sortOrder: taskChecklistItems.sortOrder,
    })
    .from(taskChecklistItems)
    .where(eq(taskChecklistItems.taskId, taskId))
    .orderBy(asc(taskChecklistItems.sortOrder), asc(taskChecklistItems.createdAt));

  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    done: r.done,
    sortOrder: r.sortOrder,
  }));
}

export interface AttachmentView {
  id: string;
  fileName: string;
  mime: string | null;
  sizeBytes: number | null;
  url: string | null;
  uploadedByName: string | null;
  createdAt: string;
}

export async function getTaskAttachments(taskId: string): Promise<AttachmentView[]> {
  const rows = await db
    .select({
      id: taskAttachments.id,
      fileName: taskAttachments.fileName,
      mime: taskAttachments.mime,
      sizeBytes: taskAttachments.sizeBytes,
      storagePath: taskAttachments.storagePath,
      createdAt: taskAttachments.createdAt,
      uploadedByName: employees.name,
    })
    .from(taskAttachments)
    .leftJoin(employees, eq(taskAttachments.uploadedById, employees.id))
    .where(eq(taskAttachments.taskId, taskId))
    .orderBy(asc(taskAttachments.createdAt));

  if (rows.length === 0) return [];

  const admin = getSupabaseAdmin();
  const out: AttachmentView[] = [];
  for (const r of rows) {
    const { data } = await admin.storage
      .from(DOCUMENTS_BUCKET)
      .createSignedUrl(r.storagePath, SIGN_TTL_SECONDS);
    out.push({
      id: r.id,
      fileName: r.fileName,
      mime: r.mime,
      sizeBytes: r.sizeBytes,
      url: data?.signedUrl ?? null,
      uploadedByName: r.uploadedByName ?? null,
      createdAt: r.createdAt.toISOString(),
    });
  }
  return out;
}
