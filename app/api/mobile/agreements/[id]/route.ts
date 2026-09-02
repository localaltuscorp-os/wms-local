import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { agreements } from "@/db/schema";
import { authenticateMobileRequest, MOBILE_CORS } from "@/lib/auth/mobile";
import { rateLimitOrError } from "@/lib/rate-limit";
import { agreementsEnabled } from "@/lib/agreements/flag";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MOBILE_CORS });
}

const ActionSchema = z.object({ action: z.enum(["send", "delete"]) }).strict();
const UUID = z.string().uuid();

/**
 * POST /api/mobile/agreements/[id] — admin lifecycle action on one agreement,
 * the mobile twin of the web `sendAgreement` / `deleteAgreement`. Body:
 * { action: "send" | "delete" }.
 *
 *   • send   → flips a draft (or re-sends a sent) letter to status 'sent',
 *              stamping sentAt (immutable once signed).
 *   • delete → removes the agreement outright (housekeeping).
 *
 * Admins only (me.isAdmin — mirrors requireAgreementsAdmin). Gated by
 * agreementsEnabled() → 403 when the module is off.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  }
  const me = auth.employee;
  if (!agreementsEnabled()) {
    return NextResponse.json({ error: "agreements-unavailable" }, { status: 403, headers: MOBILE_CORS });
  }
  if (!me.isAdmin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403, headers: MOBILE_CORS });
  }
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return NextResponse.json({ error: limited.error }, { status: 429, headers: MOBILE_CORS });

  const { id } = await ctx.params;
  if (!UUID.safeParse(id).success) {
    return NextResponse.json({ error: "Invalid agreement." }, { status: 400, headers: MOBILE_CORS });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400, headers: MOBILE_CORS });
  }
  const parsed = ActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid" }, { status: 400, headers: MOBILE_CORS });
  }

  try {
    if (parsed.data.action === "send") {
      // Only a draft or already-sent agreement can be (re)sent (verbatim guard).
      const sent = await db
        .update(agreements)
        .set({ status: "sent", sentAt: new Date(), updatedAt: new Date() })
        .where(and(eq(agreements.id, id), inArray(agreements.status, ["draft", "sent"])))
        .returning({ id: agreements.id });
      if (sent.length === 0) {
        return NextResponse.json({ error: "Only a draft or already-sent agreement can be sent." }, { status: 409, headers: MOBILE_CORS });
      }
      return NextResponse.json({ ok: true, id: sent[0]!.id }, { headers: MOBILE_CORS });
    }

    const removed = await db
      .delete(agreements)
      .where(eq(agreements.id, id))
      .returning({ id: agreements.id });
    if (removed.length === 0) {
      return NextResponse.json({ error: "That agreement no longer exists." }, { status: 404, headers: MOBILE_CORS });
    }
    return NextResponse.json({ ok: true }, { headers: MOBILE_CORS });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500, headers: MOBILE_CORS },
    );
  }
}
