import { NextResponse } from "next/server";
import { authenticateMobileRequest, MOBILE_CORS } from "@/lib/auth/mobile";
import { rateLimitOrError } from "@/lib/rate-limit";
import { getSupabaseAdmin, DOCUMENTS_BUCKET, AVATARS_BUCKET, AVATAR_SIGNED_URL_TTL_SECONDS } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MOBILE_CORS });
}

/**
 * POST /api/mobile/storage/sign — mint a short-lived signed URL for Supabase
 * Storage so the app uploads/downloads media DIRECTLY (no proxying through the
 * backend), while authorization stays here (mobile Bearer → service-role admin
 * client), identical to the web's app-code Storage gate. Body:
 *   { bucket: "avatars"|"documents", path, mode: "upload"|"download", contentType? }
 */
export async function POST(req: Request) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  const me = auth.employee;

  const limited = rateLimitOrError(me.id, "write");
  if (limited) return NextResponse.json({ error: limited.error }, { status: 429, headers: MOBILE_CORS });

  const body = (await req.json().catch(() => null)) as { bucket?: string; path?: string; mode?: string; contentType?: string } | null;
  if (!body || typeof body.path !== "string" || !body.path.trim()) {
    return NextResponse.json({ error: "path is required" }, { status: 400, headers: MOBILE_CORS });
  }
  // Only the two private buckets are addressable, and only under the caller's
  // own prefix (<employeeId>/…) so one user can't sign another's objects.
  const bucket = body.bucket === DOCUMENTS_BUCKET ? DOCUMENTS_BUCKET : AVATARS_BUCKET;
  const path = body.path.replace(/^\/+/, "");
  if (!path.startsWith(`${me.id}/`)) {
    return NextResponse.json({ error: "path must be under your own folder" }, { status: 403, headers: MOBILE_CORS });
  }

  const admin = getSupabaseAdmin();
  try {
    if (body.mode === "upload") {
      const { data, error } = await admin.storage.from(bucket).createSignedUploadUrl(path);
      if (error || !data) return NextResponse.json({ error: error?.message ?? "sign failed" }, { status: 400, headers: MOBILE_CORS });
      return NextResponse.json({ ok: true, url: data.signedUrl, token: data.token, path }, { headers: MOBILE_CORS });
    }
    const { data, error } = await admin.storage.from(bucket).createSignedUrl(path, AVATAR_SIGNED_URL_TTL_SECONDS);
    if (error || !data) return NextResponse.json({ error: error?.message ?? "sign failed" }, { status: 400, headers: MOBILE_CORS });
    return NextResponse.json({ ok: true, url: data.signedUrl, path }, { headers: MOBILE_CORS });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500, headers: MOBILE_CORS });
  }
}
