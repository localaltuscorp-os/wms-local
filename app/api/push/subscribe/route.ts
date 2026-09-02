import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { pushSubscriptions } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";

/**
 * M4 Commit 3c — Web Push subscribe / unsubscribe.
 *
 * POST  upserts the (userId, endpoint) pair returned by the browser's
 *       PushManager.subscribe(...) call.  Keyed on `endpoint` because a
 *       single physical device can re-subscribe with a fresh endpoint
 *       (different VAPID key, different browser profile etc.) and we
 *       want each endpoint tracked separately.
 * DELETE removes a specific endpoint owned by the signed-in user.  Used
 *        by /profile's "turn off" toggle and by the SW when the browser
 *        invalidates a subscription server-side.
 *
 * Auth — both verbs go through `requireUser`, which redirects when no
 * session is present.  The handler is `runtime = "nodejs"` so we have
 * full Drizzle access (the edge runtime can't use pg).
 */

export const runtime = "nodejs";

const SubSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

export async function POST(req: Request) {
  const me = await requireUser();
  const json = (await req.json().catch(() => ({}))) as unknown;
  const parsed = SubSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid body" },
      { status: 400 },
    );
  }
  await db
    .insert(pushSubscriptions)
    .values({
      userId: me.id,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
      userAgent: req.headers.get("user-agent"),
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { userId: me.id, lastSeenAt: new Date() },
    });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const me = await requireUser();
  const json = (await req.json().catch(() => ({}))) as { endpoint?: unknown };
  const endpoint = typeof json?.endpoint === "string" ? json.endpoint : null;
  if (!endpoint) {
    return NextResponse.json(
      { ok: false, error: "endpoint required" },
      { status: 400 },
    );
  }
  await db
    .delete(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.endpoint, endpoint),
        eq(pushSubscriptions.userId, me.id),
      ),
    );
  return NextResponse.json({ ok: true });
}
