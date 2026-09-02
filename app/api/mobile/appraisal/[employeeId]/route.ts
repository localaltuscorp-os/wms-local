import { NextResponse } from "next/server";
import { authenticateMobileRequest, MOBILE_CORS } from "@/lib/auth/mobile";
import { appraisalEnabled } from "@/lib/pms/appraisal-flag";
import {
  isAppraisalAdmin,
  canViewAppraisal,
  canManagerScore,
} from "@/lib/pms/appraisal/access";
import { loadEmployeeCard, loadLatestCycle } from "@/lib/pms/appraisal/queries";
import type { ScoredItem, ScoredDimension } from "@/lib/pms/appraisal/engine";
import type { AppraisalAttachment } from "@/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MOBILE_CORS });
}

const num = (v: string | number | null | undefined): number | null => {
  if (v == null) return null;
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : null;
};
const iso = (d: Date | string | null): string | null => {
  if (!d) return null;
  return d instanceof Date ? d.toISOString() : String(d);
};

/** One scored item → the app payload (mirrors the web scorecard's mapItem: the
 *  three stage scores/notes, the winning fraction/points/stage, and any
 *  attachments so the app can request signed URLs later). */
function mapItem(it: ScoredItem, attachments: AppraisalAttachment[]) {
  const s = it.score;
  return {
    id: it.id,
    dimension: it.dimension,
    area: it.area,
    title: it.title,
    measure: it.measure,
    isTechnical: it.isTechnical,
    isManagerOnly: it.isManagerOnly,
    isAuto: it.isAuto,
    subWeight: num(it.subWeight) ?? 0,
    fraction: it.fraction,
    maxPoints: it.maxPoints,
    earnedPoints: it.earnedPoints,
    stage: it.stage,
    status: it.status,
    actualValue: it.actualValue,
    evidence: it.evidence,
    adminApproved: it.adminApproved,
    adminRemarks: it.adminRemarks,
    self: { score: num(s?.selfScore ?? null), note: s?.selfJustification ?? null, at: iso(s?.selfSubmittedAt ?? null) },
    manager: { score: num(s?.managerScore ?? null), note: s?.managerExplanation ?? null, at: iso(s?.managerSubmittedAt ?? null) },
    management: { score: num(s?.managementScore ?? null), note: s?.managementExplanation ?? null, at: iso(s?.managementSubmittedAt ?? null) },
    meta: it.meta,
    attachments: attachments.map((a) => ({ id: a.id, fileName: a.fileName, stage: a.stage })),
  };
}

const mapDimension = (d: ScoredDimension, attachments: Map<string, AppraisalAttachment[]>) => ({
  dimension: d.dimension,
  label: d.label,
  weight: d.weight,
  pct: d.pct,
  earnedPoints: d.earnedPoints,
  maxPoints: d.maxPoints,
  isAuto: d.isAuto,
  items: d.items.map((it) => mapItem(it, attachments.get(it.id) ?? [])),
});

/**
 * GET /api/mobile/appraisal/:employeeId[?cycleId=…] — one person's full scorecard
 * detail (dimensions → items → the self/manager/management scores) for a cycle
 * (defaults to the latest). Authorized via canViewAppraisal (self, a manager over
 * the target, or an admin); everyone else gets 403. Reuses loadEmployeeCard so
 * the numbers are the exact ones the web /appraisal/[employeeId] page renders,
 * and returns `caps` (isAdmin/isSelf/canManager + cycleStatus) so the app shows
 * only the score controls the viewer may use.
 */
export async function GET(req: Request, ctx: { params: Promise<{ employeeId: string }> }) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  }
  const me = auth.employee;
  if (!appraisalEnabled()) {
    return NextResponse.json({ error: "appraisal-disabled" }, { status: 403, headers: MOBILE_CORS });
  }

  const { employeeId } = await ctx.params;
  if (!(await canViewAppraisal(me, employeeId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403, headers: MOBILE_CORS });
  }

  const url = new URL(req.url);
  const cycleId = url.searchParams.get("cycleId") || (await loadLatestCycle())?.id;
  if (!cycleId) {
    return NextResponse.json({ error: "no-cycle" }, { status: 404, headers: MOBILE_CORS });
  }

  const card = await loadEmployeeCard(cycleId, employeeId);
  if (!card) {
    return NextResponse.json({ error: "not-found" }, { status: 404, headers: MOBILE_CORS });
  }

  const caps = {
    isAdmin: isAppraisalAdmin(me),
    isSelf: me.id === employeeId,
    canManager: await canManagerScore(me, employeeId),
    cycleStatus: card.cycle.status,
  };

  return NextResponse.json(
    {
      employee: card.employee,
      cycle: { id: card.cycle.id, period: card.cycle.period, label: card.cycle.label, status: card.cycle.status },
      config: card.config,
      isManager: card.isManager,
      culture: card.culture,
      caps,
      scorecard: {
        finalPct: card.scorecard.finalPct,
        earnedTotal: card.scorecard.earnedTotal,
        weightPresent: card.scorecard.weightPresent,
        ratingTerm: card.scorecard.ratingTerm,
        isManager: card.scorecard.isManager,
        dimensions: card.scorecard.dimensions.map((d) => mapDimension(d, card.attachments)),
      },
    },
    { headers: MOBILE_CORS },
  );
}
