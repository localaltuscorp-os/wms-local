import { notFound, redirect } from "next/navigation";
import { and, eq, gte, lte } from "drizzle-orm";
import { DashboardHeader } from "@/components/layout/header";
import { PageShell } from "@/components/layout/page-shell";
import { db } from "@/lib/db";
import { weeklyGoals } from "@/db/schema";
import { requireGoalsAccess } from "@/lib/goals/access";
import { goalsCascadeEnabled, goalsCanvasOn } from "@/lib/goals/flag";
import { getYearBoard, getAssignedGoals } from "@/lib/goals/queries";
import { fyStartYearOf } from "@/lib/goals/types";
// bug #23 — the canonical FY (Apr–Mar) week number, in lockstep with
// canvas-data.ts + the canvas stage (the local Jan-1 copy is deleted).
import { weekNoOf } from "@/lib/goals/fy-calendar";
import type { GoalNode } from "@/lib/goals/types";
import { toGoalDTO, type GoalDTO } from "@/components/goals/cascade/util";
import { CascadeWorkspace, type WeeklyDTO } from "@/components/goals/cascade/cascade-workspace";
import { resolveGoalsView } from "./view";

export const dynamic = "force-dynamic";

/** Flatten a goal tree back to every node (children ignored by toGoalDTO). */
function collect(nodes: GoalNode[]): GoalNode[] {
  const out: GoalNode[] = [];
  const walk = (ns: GoalNode[]) => ns.forEach((n) => (out.push(n), walk(n.children)));
  walk(nodes);
  return out;
}

export default async function GoalsCascadePage({
  searchParams,
}: {
  searchParams: Promise<{ emp?: string; fy?: string }>;
}) {
  const { me, isAdmin } = await requireGoalsAccess();
  if (!goalsCascadeEnabled()) notFound();

  // The canvas is RETIRED as the UI — behind the flag the four LEVEL PAGES
  // (weekly-goals board design) are the module, so old /goals/cascade links
  // land on the Yearly board. Flag OFF keeps the legacy CascadeWorkspace
  // below byte-for-byte (production unchanged).
  if (goalsCanvasOn()) redirect("/goals/yearly");

  const sp = await searchParams;
  const view = await resolveGoalsView(me, isAdmin, sp.emp);
  const fy = sp.fy && /^\d{4}$/.test(sp.fy) ? Number(sp.fy) : fyStartYearOf(new Date());

  const [board, wrows, assigned] = await Promise.all([
    getYearBoard(view.viewedEmployeeId, fy),
    db
      .select({
        id: weeklyGoals.id,
        weekStart: weeklyGoals.weekStart,
        monthGoalId: weeklyGoals.monthGoalId,
        subject: weeklyGoals.subject,
        targetDone: weeklyGoals.targetDone,
        area: weeklyGoals.area,
        uom: weeklyGoals.uom,
        pctDone: weeklyGoals.pctDone,
        acceptPct: weeklyGoals.acceptPct,
        position: weeklyGoals.position,
        carriedFromId: weeklyGoals.carriedFromId,
        // Numeric cascade mirrors — required for Month→Week rollup/contribution
        // math to run client-side (design §3.1 blocker fix; same FY-range query,
        // just wider columns — no extra round-trip).
        targetQty: weeklyGoals.targetQty,
        actualQty: weeklyGoals.actualQty,
        targetAmount: weeklyGoals.targetAmount,
        actualAmount: weeklyGoals.actualAmount,
        weight: weeklyGoals.weight,
        adopted: weeklyGoals.adopted,
        // Ritual stamps (Phase 6, design §2.2/§2.6) — same FY-range query, two
        // more columns; power the canvas "committed / awaiting Monday approval"
        // chips. DISPLAY ONLY — the punch gates keep reading these columns
        // server-side via the predicates.
        committedAt: weeklyGoals.committedAt,
        approvedByManagerAt: weeklyGoals.approvedByManagerAt,
      })
      .from(weeklyGoals)
      .where(
        and(
          eq(weeklyGoals.employeeId, view.viewedEmployeeId),
          eq(weeklyGoals.archived, false),
          gte(weeklyGoals.weekStart, `${fy}-04-01`),
          lte(weeklyGoals.weekStart, `${fy + 1}-03-31`),
        ),
      ),
    getAssignedGoals(view.viewedEmployeeId, fy),
  ]);

  const goals: GoalDTO[] = [...collect(board.years), ...collect(board.standalone)].map(toGoalDTO);

  const weekly: WeeklyDTO[] = wrows.map((w) => ({
    id: w.id,
    weekStart: w.weekStart,
    monthKey: w.weekStart.slice(0, 7),
    weekNo: weekNoOf(w.weekStart),
    title: (w.targetDone?.trim() || w.subject?.trim() || "Weekly goal") as string,
    area: w.area,
    uom: w.uom,
    pctDone: w.pctDone,
    acceptPct: w.acceptPct,
    position: w.position,
    cascade: w.monthGoalId != null,
    spillover: w.carriedFromId != null,
    targetQty: w.targetQty,
    actualQty: w.actualQty,
    targetAmount: w.targetAmount,
    actualAmount: w.actualAmount,
    weight: w.weight,
    adopted: w.adopted,
    monthGoalId: w.monthGoalId,
    committed: w.committedAt != null,
    approved: w.approvedByManagerAt != null,
  }));

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <PageShell width="full" py={false} className="pt-6 pb-16 max-md:pt-5">
        <CascadeWorkspace
          goals={goals}
          weekly={weekly}
          assigned={assigned}
          fyStartYear={fy}
          viewedEmployeeId={view.viewedEmployeeId}
          viewedName={view.viewedName}
          roster={view.roster}
          canWrite={view.canWrite}
        />
      </PageShell>
    </>
  );
}
