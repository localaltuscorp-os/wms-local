import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import {
  AVATARS_BUCKET,
  getSupabaseAdmin,
} from "@/lib/supabase/admin";
import { revalidateTag } from "next/cache";
import { CACHE_TAGS, PROFILE_CACHE_TAGS } from "@/lib/cache-tags";

export const runtime = "nodejs";

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
/**
 * 1 MB (2026-09-05, egress). The client re-encodes to a 256px square WebP
 * before posting — see downscaleForAvatar in components/profile/identity/
 * avatar-and-name.tsx — which lands around 15-25 KB, so this cap sits ~50x
 * above the normal path and only ever bites the client's fallback (a browser
 * where the canvas re-encode failed and the original went up raw). It is a
 * backstop against storing a multi-megabyte original we would then pay to
 * serve on every render, not the mechanism that makes avatars small.
 */
const MAX_BYTES = 1 * 1024 * 1024;

/**
 * Avatar upload — multipart POST. The client center-crops and re-encodes to a
 * 256px WebP before posting; we re-validate server-side (MIME, size) because
 * the client is a convenience, not the guarantee.
 *
 * The blob is stored at `avatars/<employeeId>/<random>.<ext>` and the
 * employee row keeps the durable PATH, pointing avatarUrl at /api/avatar/<id>,
 * which signs on demand. Persisting a signed URL here — as this once did —
 * meant every avatar broke permanently when its TTL ran out.
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
      { ok: false, error: "Image must be 1MB or smaller — try a smaller photo" },
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

  // Store the PATH and point the avatar at our own route, which signs on
  // demand. Persisting the signed URL itself — as this did — meant every
  // avatar broke permanently once its 7-day TTL ran out.
  try {
    await db
      .update(employees)
      .set({ avatarPath: path, avatarUrl: `/api/avatar/${me.id}` })
      .where(eq(employees.id, me.id));
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `DB: ${(err as Error).message}` },
      { status: 500 },
    );
  }

  revalidateTag(PROFILE_CACHE_TAGS.profile(me.id), "default");
  revalidateTag(CACHE_TAGS.employees, "default");

  return NextResponse.json({ ok: true, url: `/api/avatar/${me.id}` });
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
      .set({ avatarUrl: null, avatarPath: null })
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

  revalidateTag(PROFILE_CACHE_TAGS.profile(me.id), "default");
  revalidateTag(CACHE_TAGS.employees, "default");

  return NextResponse.json({ ok: true });
}
