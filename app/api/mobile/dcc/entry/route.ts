import { NextResponse } from "next/server";
import { authenticateMobileRequest, MOBILE_CORS } from "@/lib/auth/mobile";
import { rateLimitOrError } from "@/lib/rate-limit";
import { writeDccEntry } from "@/lib/dcc/write";
import { parseAmount } from "@/lib/accounts/amounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MOBILE_CORS });
}

/**
 * POST /api/mobile/dcc/entry — fill (or clear) one KPI slot from the app.
 * Body: { itemId, date, status?, value?, note?, subjectId? }. Empty status+value
 * +note clears the slot. Reuses the exact web write core (owner-or-super gate +
 * COALESCE-sentinel upsert). subjectId targets one participant's row.
 */
export async function POST(req: Request) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  const me = auth.employee;

  const limited = rateLimitOrError(me.id, "write");
  if (limited) return NextResponse.json({ error: limited.error }, { status: 429, headers: MOBILE_CORS });

  const body = (await req.json().catch(() => null)) as
    | { itemId?: string; date?: string; status?: string | null; value?: unknown; note?: string | null; subjectId?: string | null }
    | null;
  if (!body || typeof body.itemId !== "string" || typeof body.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
    return NextResponse.json({ error: "itemId and date are required" }, { status: 400, headers: MOBILE_CORS });
  }
  const status = typeof body.status === "string" && body.status.trim() ? body.status.trim() : null;
  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim() : null;
  const amt = parseAmount(typeof body.value === "string" || typeof body.value === "number" ? body.value : null);
  const value = amt === null ? null : String(amt);
  const subjectId = typeof body.subjectId === "string" ? body.subjectId : null;

  const res = await writeDccEntry({ id: me.id, email: me.email }, { itemId: body.itemId, date: body.date, status, value, note, subjectId });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400, headers: MOBILE_CORS });
  return NextResponse.json({ ok: true }, { headers: MOBILE_CORS });
}
