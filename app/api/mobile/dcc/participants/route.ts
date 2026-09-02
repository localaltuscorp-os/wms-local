import { NextResponse } from "next/server";
import { authenticateMobileRequest, MOBILE_CORS } from "@/lib/auth/mobile";
import { rateLimitOrError } from "@/lib/rate-limit";
import { writeParticipantEntries } from "@/lib/dcc/write";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MOBILE_CORS });
}

/**
 * POST /api/mobile/dcc/participants — set (or clear) the SAME status for every
 * participant of a participant-list KPI ("All Done" / "All NA" / "Clear").
 * Body: { itemId, date, status? }.
 */
export async function POST(req: Request) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  const me = auth.employee;

  const limited = rateLimitOrError(me.id, "write");
  if (limited) return NextResponse.json({ error: limited.error }, { status: 429, headers: MOBILE_CORS });

  const body = (await req.json().catch(() => null)) as { itemId?: string; date?: string; status?: string | null } | null;
  if (!body || typeof body.itemId !== "string" || typeof body.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
    return NextResponse.json({ error: "itemId and date are required" }, { status: 400, headers: MOBILE_CORS });
  }
  const status = typeof body.status === "string" && body.status.trim() ? body.status.trim() : null;

  const res = await writeParticipantEntries({ id: me.id, email: me.email }, { itemId: body.itemId, date: body.date, status });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400, headers: MOBILE_CORS });
  return NextResponse.json({ ok: true }, { headers: MOBILE_CORS });
}
