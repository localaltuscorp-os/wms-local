import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { requireUser } from "@/lib/auth/current";
import { accessFor } from "@/lib/auth/workspace-access";
import { canAccessWorkspace } from "@/lib/workspaces";
import { getSupabaseAdmin, DOCUMENTS_BUCKET } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * POST /api/hr/management-assessment/upload — multipart upload for the
 * Management Assessment workspace: a voice recording (kind=audio) or an
 * attachment (kind=attachment: image / video / pdf / doc). Runs as an API route,
 * not a server action, because server-action bodies cap at ~1MB while videos and
 * long recordings can be much larger. Stored under
 * management-assessment/<kind>/<uuid>.<ext> in the private documents bucket;
 * returns the storage path so the client can persist it via
 * saveManagementAssessment. HR-workspace members only.
 */

const MAX_BYTES = 50 * 1024 * 1024; // 50MB — plenty for a round of audio/video/images
const ALLOWED_KINDS = new Set(["audio", "attachment"]);

export async function POST(req: Request) {
  let me;
  try {
    me = await requireUser();
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!canAccessWorkspace("hr", await accessFor(me))) {
    return NextResponse.json({ ok: false, error: "HR access required" }, { status: 403 });
  }

  const ct = req.headers.get("content-type") ?? "";
  if (!ct.startsWith("multipart/form-data")) {
    return NextResponse.json({ ok: false, error: "Expected multipart/form-data" }, { status: 400 });
  }

  const form = await req.formData();
  const file = form.get("file");
  const kind = String(form.get("kind") ?? "attachment");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ ok: false, error: "Pick a file." }, { status: 400 });
  }
  if (!ALLOWED_KINDS.has(kind)) {
    return NextResponse.json({ ok: false, error: "Invalid upload kind." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: "File exceeds 50MB." }, { status: 413 });
  }
  // Deny executables + inline-renderable types (html/svg) that could run script
  // from the signed-URL storage origin (this route had no type guard at all).
  if (
    /\.(exe|com|cmd|bat|msi|scr|pif|vbs|js|mjs|cjs|jar|sh|bash|app|dmg|ps1|psm1|reg|hta|cpl|html?|xhtml|svgz?)$/i.test(file.name) ||
    ["text/html", "application/xhtml+xml", "image/svg+xml"].includes(file.type)
  ) {
    return NextResponse.json({ ok: false, error: "This file type is not allowed." }, { status: 415 });
  }

  const ext = (file.name.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8);
  const path = `management-assessment/${kind}/${randomUUID()}.${ext || "bin"}`;

  const buffer = new Uint8Array(await file.arrayBuffer());
  const admin = getSupabaseAdmin();
  const { error } = await admin.storage
    .from(DOCUMENTS_BUCKET)
    .upload(path, buffer, { contentType: file.type || "application/octet-stream", upsert: false });
  if (error) {
    return NextResponse.json({ ok: false, error: `Upload failed: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    path,
    name: file.name.slice(0, 255),
    mime: file.type || "application/octet-stream",
    size: file.size,
  });
}
