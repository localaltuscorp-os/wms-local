import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { devicePushTokens } from "@/db/schema";
import { authenticateMobileRequest, MOBILE_CORS } from "@/lib/auth/mobile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MOBILE_CORS });
}

/**
 * POST /api/mobile/register-push — the native app registers its FCM token so the
 * server can send it push. Upsert on the token: the device now belongs to the
 * signed-in employee (re-login on a shared phone reassigns it).
 * Body: { token, platform? }.
 */
export async function POST(req: Request) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  }
  const me = auth.employee;

  const body = (await req.json().catch(() => null)) as { token?: string; platform?: string } | null;
  const token = body?.token?.trim();
  if (!token) {
    return NextResponse.json({ error: "token is required" }, { status: 400, headers: MOBILE_CORS });
  }
  const platform = body?.platform === "ios" ? "ios" : "android";

  await db
    .insert(devicePushTokens)
    .values({ employeeId: me.id, token, platform })
    .onConflictDoUpdate({
      target: devicePushTokens.token,
      set: { employeeId: me.id, platform, updatedAt: new Date() },
    });

  return NextResponse.json({ ok: true }, { headers: MOBILE_CORS });
}

/** DELETE /api/mobile/register-push — unregister on sign-out. Body: { token }. */
export async function DELETE(req: Request) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  }
  const body = (await req.json().catch(() => null)) as { token?: string } | null;
  const token = body?.token?.trim();
  if (token) {
    await db.delete(devicePushTokens).where(eq(devicePushTokens.token, token)).catch(() => {});
  }
  return NextResponse.json({ ok: true }, { headers: MOBILE_CORS });
}
