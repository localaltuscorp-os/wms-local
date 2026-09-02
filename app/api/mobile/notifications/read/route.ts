import { NextResponse } from "next/server";
import { authenticateMobileRequest, MOBILE_CORS } from "@/lib/auth/mobile";
import { markRead, markAllRead } from "@/lib/queries/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MOBILE_CORS });
}

/**
 * POST /api/mobile/notifications/read — mark one notification read (body { id })
 * or all of the caller's unread (body {} / { all: true }).
 */
export async function POST(req: Request) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  const me = auth.employee;

  const body = (await req.json().catch(() => ({}))) as { id?: string; all?: boolean } | null;
  if (body?.id) {
    await markRead(body.id, me.id);
  } else {
    await markAllRead(me.id);
  }
  return NextResponse.json({ ok: true }, { headers: MOBILE_CORS });
}
