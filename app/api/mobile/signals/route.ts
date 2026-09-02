import { NextResponse } from "next/server";
import { authenticateMobileRequest, MOBILE_CORS } from "@/lib/auth/mobile";
import { listRecognitions, listPromotionSignals } from "@/lib/queries/pms-signals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MOBILE_CORS });
}

/**
 * GET /api/mobile/signals — the signed-in user's OWN performance signals feed
 * (the personal, owner-scoped slice of the web admin `/pms/signals` release
 * console): the recognition the score engine has suggested/released for them
 * and any promotion signals flagged against them. Nothing here is a decision
 * surface — the app only *shows* the human-released consequences that concern
 * the viewer.
 *
 * Reuses the web read layer verbatim (`listRecognitions` / `listPromotionSignals`,
 * both `withRetry`-wrapped) and filters to `employeeId === me.id` server-side.
 * The pms_recognition / pms_promotion_signal tables are sparse admin-released
 * rows, so the full read + in-route filter stays cheap and this endpoint never
 * reaches across into the admin org-wide totals. Every timestamp arrives already
 * ISO-stringified by the query layer, so no date is reconstructed here.
 *
 * Matches the mobile route style (see app/api/mobile/dcc/route.ts). Additive —
 * the web `/pms/signals` page is untouched.
 */
export async function GET(req: Request) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  }
  const me = auth.employee;

  const [allRecognitions, allPromotions] = await Promise.all([
    listRecognitions(),
    listPromotionSignals(),
  ]);

  const recognitions = allRecognitions.filter((r) => r.employeeId === me.id);
  const promotions = allPromotions.filter((p) => p.employeeId === me.id);

  const recognitionsReleased = recognitions.filter((r) => r.status === "released").length;
  const promotionFlagged = promotions.filter((p) => p.status === "flagged").length;

  return NextResponse.json(
    {
      ownerName: me.name,
      summary: {
        recognitionsReceived: recognitions.length,
        recognitionsReleased,
        promotionSignals: promotions.length,
        promotionFlagged,
      },
      recognitions: recognitions.map((r) => ({
        id: r.id,
        kind: r.kind,
        period: r.period,
        reason: r.reason,
        scoreSnapshot: r.scoreSnapshot,
        status: r.status,
        releasedByName: r.releasedByName,
        releasedAt: r.releasedAt,
        createdAt: r.createdAt,
      })),
      promotions: promotions.map((p) => ({
        id: p.id,
        scoreSnapshot: p.scoreSnapshot,
        eligibleSince: p.eligibleSince,
        rationale: p.rationale,
        status: p.status,
        decidedByName: p.decidedByName,
        decidedAt: p.decidedAt,
        createdAt: p.createdAt,
      })),
    },
    { headers: MOBILE_CORS },
  );
}
