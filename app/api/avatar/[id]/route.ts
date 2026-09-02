import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { getSupabaseAdmin, AVATARS_BUCKET } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * AVATAR — redirects to a freshly signed URL for one employee's picture.
 *
 * `employees.avatar_url` used to hold the signed URL itself, with a 7-day TTL.
 * A signed URL is a temporary credential: storing one meant every avatar broke
 * permanently a week after upload, answering 400 JSON where an image was asked
 * for, which the browser then blocked outright (ERR_BLOCKED_BY_ORB).
 *
 * So the durable PATH is stored and the URL is signed here, per request. The
 * signature only has to outlive the redirect that follows it, hence the short
 * TTL; the browser caches the image itself, not this hop.
 *
 * Auth is required — the bucket is private, and this route must not become a
 * way to read staff photos without a session.
 */
const SIGN_TTL_SECONDS = 60 * 10;

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await ctx.params;

  const [row] = await db
    .select({ path: employees.avatarPath })
    .from(employees)
    .where(eq(employees.id, id))
    .limit(1);

  if (!row?.path) return new NextResponse("No avatar", { status: 404 });

  const { data, error } = await getSupabaseAdmin()
    .storage.from(AVATARS_BUCKET)
    .createSignedUrl(row.path, SIGN_TTL_SECONDS);

  if (error || !data?.signedUrl) return new NextResponse("No avatar", { status: 404 });

  // 302, not 307: this is a redirect to a DIFFERENT, short-lived URL each time,
  // and must never be cached as if it were the image.
  return NextResponse.redirect(data.signedUrl, {
    status: 302,
    headers: { "Cache-Control": "private, max-age=0, must-revalidate" },
  });
}
