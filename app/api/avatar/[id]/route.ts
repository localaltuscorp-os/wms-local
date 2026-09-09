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
 * So the durable PATH is stored and the URL is signed here, per request.
 *
 * CACHING (2026-09-05, egress) — this used to sign for 10 minutes and answer
 * `max-age=0, must-revalidate`, on the theory that "the browser caches the
 * image itself, not this hop". It cannot. Every call to createSignedUrl mints a
 * NEW `?token=`, so each revalidation handed the browser a URL it had never
 * seen, missing the HTTP cache by construction and re-downloading the full
 * image from Storage. With this route feeding ~50 components (rosters,
 * sidebars, dashboards) and the realtime LiveIndicator re-rendering all of them
 * on every task change, one avatar was being pulled out of Supabase hundreds of
 * times a day. That was the single largest line in a 6.27 GB/5 GB overage.
 *
 * The fix is to let the REDIRECT be cached, which keeps the target URL stable
 * and lets the image behind it finally cache too. Two rules bind the numbers:
 *
 *   max-age < TTL  — a cached redirect must never outlive the signature it
 *                    points at, or it sends the browser to a dead 400. Half
 *                    the TTL leaves a wide margin for clock skew.
 *   private        — the signed URL is a bearer credential for a private
 *                    bucket; it must not be stored in any shared/CDN cache.
 *
 * Auth is still required — the bucket is private, and this route must not
 * become a way to read staff photos without a session.
 */
const SIGN_TTL_SECONDS = 60 * 60; // 1 hour
const REDIRECT_MAX_AGE = SIGN_TTL_SECONDS / 2; // 30 min — always < the TTL

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

  // 302, not 307/308: the target is a short-lived URL that WILL change, so this
  // must never be remembered as a permanent mapping. It is cacheable for a
  // bounded window (see above), not immutable.
  return NextResponse.redirect(data.signedUrl, {
    status: 302,
    headers: { "Cache-Control": `private, max-age=${REDIRECT_MAX_AGE}` },
  });
}
