import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, weeklyGoals } from "@/db/schema";
import { withRetry } from "@/lib/db/with-timeout";
import { getDownlineIds } from "@/lib/weekly-goals/hierarchy";
import { isMondayIST } from "@/lib/manager-gates";
import type { ApproveMember, ApproveGoal } from "./types";

/**
 * Monday manager-approval board loader — EXTRACTED VERBATIM from
 * `app/(app)/goals/approve/page.tsx` (Phase 6, design §2.6) so the route page
 * AND the canvas RitualBanner's lazy `loadApproveRitual` action read the exact
 * same downline board. The downline is derived server-side from the MANAGER's
 * own id (`getDownlineIds`) — a peer's downline can never leak because no
 * client-supplied id ever scopes this read.
 */

/** Serialise a weekly_goals row to the client DTO (numeric cols are strings). */
export function toApproveGoal(r: typeof weeklyGoals.$inferSelect): ApproveGoal {
  return {
    id: r.id,
    employeeId: r.employeeId,
    weekStart: r.weekStart,
    position: r.position,
    subject: r.subject,
    client: r.client,
    area: r.area,
    uom: r.uom,
    targetDone: r.targetDone,
    notes: r.notes,
    status: r.status,
    pctDone: r.pctDone,
    acceptPct: r.acceptPct,
    reviewNotes: r.reviewNotes,
    targetQty: r.targetQty,
    actualQty: r.actualQty,
    targetAmount: r.targetAmount,
    actualAmount: r.actualAmount,
    teamDependencyPct: r.teamDependencyPct,
    evidenceUrl: r.evidenceUrl,
    linkUrl: r.linkUrl,
    committed: r.committedAt != null,
    approved: r.approvedByManagerAt != null,
  };
}

export async function loadApproveBoard(
  managerId: string,
  weekStart: string,
  lastWeek: string,
): Promise<{ members: ApproveMember[]; monday: boolean }> {
  const monday = isMondayIST();
  try {
    const downline = await getDownlineIds(managerId);
    if (downline.length === 0) return { members: [], monday };

    const [people, rows] = await withRetry(
      () =>
        Promise.all([
          db
            .select({ id: employees.id, name: employees.name })
            .from(employees)
            .where(and(inArray(employees.id, downline), eq(employees.isActive, true))),
          db
            .select()
            .from(weeklyGoals)
            .where(
              and(
                inArray(weeklyGoals.employeeId, downline),
                inArray(weeklyGoals.weekStart, [lastWeek, weekStart]),
                eq(weeklyGoals.archived, false),
                eq(weeklyGoals.adopted, true),
              ),
            )
            .orderBy(asc(weeklyGoals.position)),
        ]),
      { timeoutMs: [6000, 12000], label: "goals.approve.loadBoard" },
    );

    const byEmp = new Map<string, { last: ApproveGoal[]; this: ApproveGoal[] }>();
    for (const r of rows) {
      const bucket = byEmp.get(r.employeeId) ?? { last: [], this: [] };
      (r.weekStart === weekStart ? bucket.this : bucket.last).push(toApproveGoal(r));
      byEmp.set(r.employeeId, bucket);
    }

    const members: ApproveMember[] = people
      .map((p) => {
        const b = byEmp.get(p.id) ?? { last: [], this: [] };
        return { id: p.id, name: p.name, lastWeek: b.last, thisWeek: b.this };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    return { members, monday };
  } catch {
    // Fail-safe: never throw the surface — render an empty roster.
    return { members: [], monday };
  }
}
