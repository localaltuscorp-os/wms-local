import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import {
  AVATARS_BUCKET,
  AVATAR_SIGNED_URL_TTL_SECONDS,
  getSupabaseAdmin,
} from "@/lib/supabase/admin";
import { updateTag } from "next/cache";
import { CACHE_TAGS, PROFILE_CACHE_TAGS } from "@/lib/cache-tags";

export const runtime = "nodejs";

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 2 * 1024 * 1024; // 2MB

/**
 * Avatar upload — multipart POST. The client uploads the cropped square
 * blob (handled by react-easy-crop). We re-validate server-side: MIME,
 * size, and reject anything else. The uploaded blob is stored at
 * `avatars/<employeeId>/<random>.<ext>` and we generate a 7-day signed
 * URL stored as the employee's avatarUrl.
 *
 * On each profile read we'll refresh the signed URL transparently when
 * it's within 24h of expiry (handled in lib/profile/queries.ts at a
 * later step — for v1 we just stamp it on upload and refresh manually).
 *
 * Returns: { ok: true, url } | { ok: false, error }
 */
export async function POST(req: Request) {
  const me = await requireUser();

  const ct = req.headers.get("content-type") ?? "";
  if (!ct.startsWith("multipart/form-data")) {
    return NextResponse.json(
      { ok: false, error: "Expected multipart/form-data" },
      { status: 400 },
    );
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof Blob)) {
    return NextResponse.json(
      { ok: false, error: "Missing 'file' field" },
      { status: 400 },
    );
  }

  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json(
      { ok: false, error: "Only JPEG, PNG, or WebP images are accepted" },
      { status: 415 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { ok: false, error: "Image must be 2MB or smaller" },
      { status: 413 },
    );
  }

  const ext =
    file.type === "image/jpeg"
      ? "jpg"
      : file.type === "image/png"
        ? "png"
        : "webp";
  const random = crypto.randomUUID().replace(/-/g, "");
  const path = `${me.id}/${random}.${ext}`;

  const admin = getSupabaseAdmin();
  const arrayBuffer = await file.arrayBuffer();
  const buffer = new Uint8Array(arrayBuffer);

  const { error: upErr } = await admin.storage
    .from(AVATARS_BUCKET)
    .upload(path, buffer, {
      contentType: file.type,
      upsert: false,
    });
  if (upErr) {
    return NextResponse.json(
      { ok: false, error: `Storage: ${upErr.message}` },
      { status: 500 },
    );
  }

  const { data: signed, error: signErr } = await admin.storage
    .from(AVATARS_BUCKET)
    .createSignedUrl(path, AVATAR_SIGNED_URL_TTL_SECONDS);
  if (signErr || !signed?.signedUrl) {
    return NextResponse.json(
      { ok: false, error: `Sign URL: ${signErr?.message ?? "unknown"}` },
      { status: 500 },
    );
  }

  try {
    await db
      .update(employees)
      .set({ avatarUrl: signed.signedUrl })
      .where(eq(employees.id, me.id));
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `DB: ${(err as Error).message}` },
      { status: 500 },
    );
  }

  updateTag(PROFILE_CACHE_TAGS.profile(me.id));
  updateTag(CACHE_TAGS.employees);

  return NextResponse.json({ ok: true, url: signed.signedUrl });
}

/**
 * DELETE — clears the avatar back to initials. Removes the latest stored
 * object (best-effort) and nulls out avatarUrl.
 */
export async function DELETE() {
  const me = await requireUser();

  try {
    await db
      .update(employees)
      .set({ avatarUrl: null })
      .where(eq(employees.id, me.id));
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `DB: ${(err as Error).message}` },
      { status: 500 },
    );
  }

  // Best-effort cleanup of the user's avatar folder. Failure here is
  // non-fatal — the row is already updated.
  try {
    const admin = getSupabaseAdmin();
    const { data: list } = await admin.storage
      .from(AVATARS_BUCKET)
      .list(me.id);
    const paths = (list ?? []).map((f) => `${me.id}/${f.name}`);
    if (paths.length > 0) {
      await admin.storage.from(AVATARS_BUCKET).remove(paths);
    }
  } catch {
    // ignore
  }

  updateTag(PROFILE_CACHE_TAGS.profile(me.id));
  updateTag(CACHE_TAGS.employees);

  return NextResponse.json({ ok: true });
}
