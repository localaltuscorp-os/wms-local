import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { jdAttachments } from "@/db/schema";
import { getCurrentEmployee } from "@/lib/auth/current";
import { DOCUMENTS_BUCKET } from "@/lib/supabase/admin";
import { createSignedObjectUrl } from "@/lib/storage/objects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/jd/attachments/<id> — open one SOP file on a job description.
 *
 * Redirects to a freshly signed, short-lived URL, so the durable PATH is what
 * is stored and a link copied out of the page goes stale rather than becoming
 * a permanent door into the private bucket. Anyone signed in may open it: the
 * JD Bank is readable by every employee (actions.ts), and so are its SOPs.
 * In dummy mode the signed URL is the dev-only /api/dummy-storage route.
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const me = await getCurrentEmployee();
  if (!me) return NextResponse.redirect(new URL("/login", request.url));

  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Unknown file." }, { status: 400 });

  const [row] = await db
    .select({ path: jdAttachments.storagePath })
    .from(jdAttachments)
    .where(eq(jdAttachments.id, id))
    .limit(1);
  if (!row) return NextResponse.json({ error: "That file is no longer attached." }, { status: 404 });

  const url = await createSignedObjectUrl(DOCUMENTS_BUCKET, row.path, 60 * 10).catch(() => null);
  if (!url) return NextResponse.json({ error: "Could not prepare the file." }, { status: 500 });

  // 302: the target is a short-lived URL that will change — never a permanent mapping.
  return NextResponse.redirect(new URL(url, request.url), { status: 302, headers: { "Cache-Control": "private, no-store" } });
}
