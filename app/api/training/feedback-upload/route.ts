import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/current";
import { getSupabaseAdmin, DOCUMENTS_BUCKET } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const MAX_BYTES = 25 * 1024 * 1024;
const AUDIO = new Set(["audio/webm", "audio/mpeg", "audio/mp4", "audio/ogg", "audio/wav", "audio/x-m4a"]);
const IMAGE = new Set(["image/jpeg", "image/png", "image/webp", "image/heic"]);

/** POST /api/training/feedback-upload — voice note (audio) or picture (image). */
export async function POST(req: Request) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
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
    return NextResponse.json({ ok: false, error: "File exceeds 25MB." }, { status: 413 });
  }
  // Explicit allow-list only — the old `startsWith("image/")` fallback admitted
  // image/svg+xml, which renders script inline from the storage origin.
  const isAudio = AUDIO.has(file.type) || file.type.startsWith("audio/");
  const isImage = IMAGE.has(file.type);
  if (!isAudio && !isImage) {
    return NextResponse.json({ ok: false, error: "Only audio or image files are accepted." }, { status: 415 });
  }
  const ext = (file.name.split(".").pop() ?? "bin").replace(/[^a-z0-9]/gi, "").slice(0, 8) || "bin";
  const path = `training/feedback/${crypto.randomUUID()}.${ext}`;
  const admin = getSupabaseAdmin();
  const buffer = new Uint8Array(await file.arrayBuffer());
  const { error } = await admin.storage.from(DOCUMENTS_BUCKET).upload(path, buffer, { contentType: file.type || "application/octet-stream", upsert: false });
  if (error) return NextResponse.json({ ok: false, error: `Upload failed: ${error.message}` }, { status: 500 });
  return NextResponse.json({ ok: true, path, kind: isAudio ? "voice" : "picture" });
}
