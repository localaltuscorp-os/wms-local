import "server-only";
import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { weeklyGoals } from "@/db/schema";
import { requireGoalsAccess } from "@/lib/goals/access";
import { satCommitGateOn, monApproveGateOn } from "@/lib/goals/flag";
import { getYearBoard, getAssignedGoals } from "@/lib/goals/queries";
import { fyStartYearOf } from "@/lib/goals/types";
// bug #23 — the canonical FY (Apr–Mar) week number; the local Jan-1 calendar
// copy that used to live here diverged from the cascade generator's numbering.
import { weekNoOf } from "@/lib/goals/fy-calendar";
import type { GoalNode } from "@/lib/goals/types";
import { toGoalDTO, type GoalDTO } from "@/components/goals/cascade/util";
import type { CascadeCanvasProps, WeeklyDTO } from "@/components/goals/canvas/types";
import { resolveGoalsView } from "./cascade/view";

/**
 * Shared canvas data-load for the Goals level pages (Quarterly / Monthly /
 * Weekly / Daily) AND the free /goals/cascade shell. ONE hierarchical query per
 * the design (getYearBoard = a single indexed IN-list; weekly = one FY-range
 * select) — no per-page fan-out, no extra pooler pressure. Returns the exact
 * prop set GoalsCanvas consumes (minus the level-lock props, which the page adds).
 */

/** Flatten a goal tree back to every node. */
function collect(nodes: GoalNode[]): GoalNode[] {
  const out: GoalNode[] = [];
  const walk = (ns: GoalNode[]) => ns.forEach((n) => (out.push(n), walk(n.children)));
  walk(nodes);
  return out;
}

export type CanvasData = Omit<CascadeCanvasProps, "initialZoom" | "hideLevelNav">;

export async function loadCanvasData(sp: { emp?: string; fy?: string }): Promise<CanvasData> {
  const { me, isAdmin } = await requireGoalsAccess();
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
        targetQty: weeklyGoals.targetQty,
        actualQty: weeklyGoals.actualQty,
        targetAmount: weeklyGoals.targetAmount,
        actualAmount: weeklyGoals.actualAmount,
        weight: weeklyGoals.weight,
        adopted: weeklyGoals.adopted,
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

  return {
    goals,
    weekly,
    assigned,
    fyStartYear: fy,
    // bug #15 — the signed-in viewer, so the toolbar's "My goals" pill can
    // tell "mine" from the viewed person's when a manager browses a downline.
    myEmployeeId: me.id,
    viewedEmployeeId: view.viewedEmployeeId,
    viewedName: view.viewedName,
    roster: view.roster,
    canWrite: view.canWrite,
    canReview: view.canReview,
    // Phase 2 (Option A policy) — the shell resolves goalPolicy() from these:
    // structure rights need admin OR manager-of-the-viewed-person.
    isAdmin,
    managesViewed: view.managesViewed,
    ritualGates: { satCommit: satCommitGateOn(), monApprove: monApproveGateOn() },
  };
}
