import { NextResponse } from "next/server";
import { authenticateMobileRequest, MOBILE_CORS } from "@/lib/auth/mobile";
import { accessFor } from "@/lib/auth/workspace-access";
import { canAccessWorkspace } from "@/lib/workspaces";
import { dashboardMetrics, listAmbassadors } from "@/lib/queries/ambassadors";
import { STAGE_LABELS, type Stage } from "@/lib/ambassadors/stages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MOBILE_CORS });
}

/**
 * GET /api/mobile/ambassadors — the Sales "Partner Intelligence" surface for
 * the signed-in user: the same executive roll-up the web `/ambassadors` page
 * shows (KPI tiles + referral-pipeline funnel), plus the full partner registry
 * with each ambassador's referral / conversion / revenue / commission rollups
 * (score-ranked, the web dashboard's leaderboard ordering).
 *
 * Reuses the exact web query functions (`dashboardMetrics`, `listAmbassadors`)
 * so the phone and the web page can never diverge on a number. Read-only;
 * ambassadors are created / edited on the web, so there is no mobile commit.
 * Additive — no existing web route is touched.
 */
export async function GET(req: Request) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  }
  const me = auth.employee;
  // AUTHZ: the Ambassadors ("Partner Intelligence") surface is the Sales
  // workspace. This mobile route was auth-only, leaking every partner's revenue,
  // pending/paid commissions and the executive KPI roll-up to ANY employee.
  if (!canAccessWorkspace("sales", await accessFor(me))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403, headers: MOBILE_CORS });
  }

  const [metrics, ambassadors] = await Promise.all([dashboardMetrics(), listAmbassadors()]);

  const funnel = metrics.funnel.map((f) => ({
    stage: f.stage,
    label: STAGE_LABELS[f.stage as Stage] ?? f.stage,
    count: f.count,
  }));

  const rows = ambassadors.map((a) => ({
    id: a.id,
    name: a.name,
    company: a.company ?? null,
    photoUrl: a.photoUrl ?? null,
    tier: a.tier ?? null,
    status: a.status,
    partnerScore: a.partnerScore ?? null,
    referrals: a.referrals,
    converted: a.converted,
    revenue: a.revenue,
    commissionPending: a.commissionPending,
    commissionPaid: a.commissionPaid,
  }));

  return NextResponse.json(
    {
      ownerName: me.name,
      metrics: {
        activeAmbassadors: metrics.activeAmbassadors,
        totalReferrals: metrics.totalReferrals,
        convertedReferrals: metrics.convertedReferrals,
        conversionRate: metrics.conversionRate,
        revenue: metrics.revenue,
        commissionPending: metrics.commissionPending,
        commissionPaid: metrics.commissionPaid,
      },
      funnel,
      ambassadors: rows,
    },
    { headers: MOBILE_CORS },
  );
}
