"use server";

import { randomUUID } from "node:crypto";
import { requireUser } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import { DOCUMENTS_BUCKET } from "@/lib/supabase/admin";
import { putObject } from "@/lib/storage/objects";
import type { BroadcastAttachment } from "@/app/(app)/hr/communications/actions-types";

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

/** Files (PDFs, spreadsheets…) — the download-it-later kind. */
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024; // 20 MB
/** Images + video play INSIDE the broadcast, so they get their own ceiling. */
const MAX_MEDIA_BYTES = 60 * 1024 * 1024; // 60 MB

/**
 * Upload one broadcast attachment (a file, an image or a video) and return its
 * stored descriptor ({path,name,mime,size}) for `broadcasts.attachments`.
 *
 * Open to every employee — anyone may send a broadcast (lib/ecos/permissions.ts)
 * and a broadcast you cannot put a picture in is not the feature that was asked
 * for. Still rate-limited and still size-capped.
 *
 * Goes through lib/storage/objects rather than calling Supabase directly: that
 * module is the one seam that answers from disk under DUMMY_MODE. Calling
 * `getSupabaseAdmin()` here (as this did) meant every broadcast upload failed
 * with "signature verification failed" on a dummy database — the one setup with
 * no Supabase project at all.
 */
export async function uploadBroadcastAttachment(
  fd: FormData,
): Promise<Result<{ attachment: BroadcastAttachment }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const file = fd.get("file");
  if (!(file instanceof File)) return { ok: false, error: "No file provided." };
  if (file.size === 0) return { ok: false, error: "That file is empty." };

  const mime = (file.type || "application/octet-stream").toLowerCase();
  const isMedia = mime.startsWith("image/") || mime.startsWith("video/");
  const cap = isMedia ? MAX_MEDIA_BYTES : MAX_ATTACHMENT_BYTES;
  if (file.size > cap) {
    return {
      ok: false,
      error: `That ${isMedia ? "image / video" : "file"} is too large (max ${Math.round(cap / (1024 * 1024))} MB).`,
    };
  }

  const cleanName = (file.name || "attachment").replace(/[\r\n"]/g, "").slice(0, 180) || "attachment";
  const ext = (cleanName.split(".").pop() ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `communications/broadcasts/${randomUUID()}${ext ? `.${ext}` : ""}`;

  const buf = Buffer.from(await file.arrayBuffer());
  const res = await putObject(DOCUMENTS_BUCKET, path, buf, mime);
  if (!res.ok) return { ok: false, error: `Upload failed: ${res.error}` };

  return {
    ok: true,
    attachment: { path, name: cleanName, mime, size: file.size },
  };
}
