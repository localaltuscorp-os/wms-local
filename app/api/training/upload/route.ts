import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { isManager } from "@/lib/queries/training";
import { getSupabaseAdmin, DOCUMENTS_BUCKET } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const MAX_BYTES = 100 * 1024 * 1024; // 100MB — bigger videos should use a URL
const MIME_TO_TYPE: Record<string, "video" | "pdf" | "xls"> = {
  "video/mp4": "video",
  "video/webm": "video",
  "video/quicktime": "video",
  "video/x-matroska": "video",
  "application/pdf": "pdf",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xls",
};
const SAFE_EXT = /\.(mp4|webm|mov|mkv|pdf|xls|xlsx)$/i;

/**
 * POST /api/training/upload — multipart upload of a training material file
 * (short video / PDF / xls). Managers/admins only. Stored under
 * `training/<uuid>/<safe-name>` in the documents bucket; returns the storage
 * path + detected type so the material form can save them. Large videos should
 * use the video-URL field instead.
 */
export async function POST(req: Request) {
  let me;
  try {
    me = await requireUser();
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const allowed = me.isAdmin || isSuperAdmin(me.email) || (await isManager(me.id));
  if (!allowed) {
    return NextResponse.json({ ok: false, error: "Managers only" }, { status: 403 });
  }

  const ct = req.headers.get("content-type") ?? "";
  if (!ct.startsWith("multipart/form-data")) {
    return NextResponse.json({ ok: false, error: "Expected multipart/form-data" }, { status: 400 });
  }
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ ok: false, error: "Pick a file." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { ok: false, error: "File exceeds 100MB — use a video URL for large videos." },
      { status: 413 },
    );
  }
  const fileType = MIME_TO_TYPE[file.type];
  if (!fileType || !SAFE_EXT.test(file.name)) {
    return NextResponse.json(
      { ok: false, error: "Only MP4/WebM/MOV video, PDF, or XLS/XLSX are accepted." },
      { status: 415 },
    );
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "file";
  const path = `training/${crypto.randomUUID()}/${safeName}`;
  const admin = getSupabaseAdmin();
  const buffer = new Uint8Array(await file.arrayBuffer());

  const { error } = await admin.storage
    .from(DOCUMENTS_BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: false });
  if (error) {
    return NextResponse.json({ ok: false, error: `Upload failed: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, path, fileName: file.name.slice(0, 255), fileType });
}
