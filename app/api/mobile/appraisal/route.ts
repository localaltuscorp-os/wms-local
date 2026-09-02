import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { db, employees } from "@/lib/db";
import { authenticateMobileRequest, MOBILE_CORS } from "@/lib/auth/mobile";
import { appraisalEnabled } from "@/lib/pms/appraisal-flag";
import {
  isAppraisalAdmin,
  appraisalScopeFor,
  isManagerEmployee,
} from "@/lib/pms/appraisal/access";
import { loadCycles, loadLatestCycle, loadRoster } from "@/lib/pms/appraisal/queries";
import { loadAppraisalConfig } from "@/lib/pms/appraisal/config";
import type { AppraisalCycle } from "@/db/schema";
import type { ScoredDimension } from "@/lib/pms/appraisal/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MOBILE_CORS });
}

const cycleMeta = (c: AppraisalCycle) => ({
  id: c.id,
  period: c.period,
  label: c.label,
  status: c.status,
});

/** Dimension roll-up for the roster card (no items — the detail route carries
 *  the per-item breakdown). Mirrors the pills the web /appraisal card renders. */
const dimSummary = (d: ScoredDimension) => ({
  dimension: d.dimension,
  label: d.label,
  weight: d.weight,
  pct: d.pct,
  earnedPoints: d.earnedPoints,
  maxPoints: d.maxPoints,
  isAuto: d.isAuto,
});

/**
 * GET /api/mobile/appraisal[?cycleId=…] — the signed-in user's Appraisal roster
 * for a cycle (defaults to the latest via loadLatestCycle). Scope mirrors the web
 * /appraisal page EXACTLY (appraisalScopeFor → admin sees every active employee;
 * a manager sees self + full downline; a plain employee sees only themselves), so
 * a normal user's `roster` is the single row carrying their own scorecard, a
 * manager's is their downline, and an admin's is the whole org. Each row's
 * scorecard is computed by the shared engine (loadRoster → computeScorecard).
 * Returns the `cycles` list for the picker and the resolved `config` (weights /
 * rating terms) so the app can render bands without hardcoding them.
 */
export async function GET(req: Request) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  }
  const me = auth.employee;
  if (!appraisalEnabled()) {
    return NextResponse.json({ error: "appraisal-disabled" }, { status: 403, headers: MOBILE_CORS });
  }

  const url = new URL(req.url);
  const cycleId = url.searchParams.get("cycleId");

  const cycles = await loadCycles();
  const current =
    (cycleId ? cycles.find((c) => c.id === cycleId) : undefined) ??
    (await loadLatestCycle()) ??
    null;

  const config = await loadAppraisalConfig();

  // Roster scope — identical to the web page: admin → everyone, else self+downline.
  const scope = await appraisalScopeFor(me);
  const rows = await db
    .select({
      id: employees.id,
      name: employees.name,
      avatarUrl: employees.avatarUrl,
      department: employees.department,
    })
    .from(employees)
    .where(and(eq(employees.isActive, true)))
    .orderBy(asc(employees.name));
  const people = scope.all ? rows : rows.filter((r) => new Set(scope.ids).has(r.id));

  const [roster, viewerIsManager] = await Promise.all([
    current ? loadRoster(current.id, people) : Promise.resolve([]),
    isManagerEmployee(me.id),
  ]);

  return NextResponse.json(
    {
      cycle: current ? cycleMeta(current) : null,
      cycles: cycles.map(cycleMeta),
      config,
      viewer: {
        id: me.id,
        name: me.name,
        isAdmin: isAppraisalAdmin(me),
        isManager: viewerIsManager,
      },
      roster: roster.map((r) => ({
        employee: r.employee,
        isManager: r.isManager,
        itemCount: r.itemCount,
        scorecard: {
          finalPct: r.scorecard.finalPct,
          earnedTotal: r.scorecard.earnedTotal,
          weightPresent: r.scorecard.weightPresent,
          ratingTerm: r.scorecard.ratingTerm,
          isManager: r.scorecard.isManager,
          dimensions: r.scorecard.dimensions.map(dimSummary),
        },
      })),
    },
    { headers: MOBILE_CORS },
  );
}
