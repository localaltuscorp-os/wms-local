"use server";

import { randomUUID } from "node:crypto";
import { requireUser } from "@/lib/auth/current";
import { isHrStaff } from "@/lib/hr/access";
import { rateLimitOrError } from "@/lib/rate-limit";
import { getSupabaseAdmin, DOCUMENTS_BUCKET } from "@/lib/supabase/admin";
import type { BroadcastAttachment } from "@/app/(app)/hr/communications/actions-types";

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024; // 20 MB

/**
 * Upload one broadcast attachment to the private `documents` bucket and return
 * its stored descriptor ({path,name,mime,size}) for `broadcasts.attachments`.
 * HR-staff only. Mirrors the work-session / letter-image upload pattern:
 * service-role client, app-gated (no storage RLS), best-effort cleanup on error.
 */
export async function uploadBroadcastAttachment(
  fd: FormData,
): Promise<Result<{ attachment: BroadcastAttachment }>> {
  const me = await requireUser();
  if (!(await isHrStaff(me))) {
    return { ok: false, error: "Communications is HR-staff only." };
  }
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const file = fd.get("file");
  if (!(file instanceof File)) return { ok: false, error: "No file provided." };
  if (file.size === 0) return { ok: false, error: "That file is empty." };
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return { ok: false, error: "File too large (max 20 MB)." };
  }

  const cleanName = (file.name || "attachment").replace(/[\r\n"]/g, "").slice(0, 180) || "attachment";
  const ext = (cleanName.split(".").pop() ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const mime = (file.type || "application/octet-stream").toLowerCase();
  const path = `communications/broadcasts/${randomUUID()}${ext ? `.${ext}` : ""}`;

  const buf = Buffer.from(await file.arrayBuffer());
  const admin = getSupabaseAdmin();
  const { error } = await admin.storage
    .from(DOCUMENTS_BUCKET)
    .upload(path, buf, { contentType: mime, upsert: false });
  if (error) return { ok: false, error: `Upload failed: ${error.message}` };

  return {
    ok: true,
    attachment: { path, name: cleanName, mime, size: file.size },
  };
}
