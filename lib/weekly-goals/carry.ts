import "server-only";

import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { weeklyGoals } from "@/db/schema";
import { effectivePct } from "@/lib/weekly-goals/effective";

export interface CarryResult {
  /** Rows scanned in the source week. */
  scanned: number;
  /** New clones inserted into the target week. */
  carried: number;
  /** Distinct employees who had a goal carried. */
  employees: number;
}

/**
 * Auto carry-forward (replaces the manual "Carry → next week" button): clone
 * every UNFINISHED (effective % < 100), adopted, non-archived weekly goal from
 * `fromWeek` into `toWeek`, for EVERY employee, in one pass.
 *
 * Idempotent — a source that already has a clone in `toWeek` (matched on
 * `carriedFromId`) is skipped, so a re-run or an overlapping cron fire never
 * duplicates. Mirrors the manual clone's field copy: progress resets to 0 for
 * the fresh week and the commit/approval stamps clear, while the cascade fields,
 * team-involvement, and DELEGATION persist so a delegated goal keeps flowing to
 * the delegate week over week. `carriedFromId` marks the clone so the board
 * renders it as spilled-over.
 */
export async function carryUnfinishedForward(fromWeek: string, toWeek: string): Promise<CarryResult> {
  const src = await db
    .select()
    .from(weeklyGoals)
    .where(
      and(
        eq(weeklyGoals.weekStart, fromWeek),
        eq(weeklyGoals.archived, false),
        eq(weeklyGoals.adopted, true),
      ),
    )
    .orderBy(asc(weeklyGoals.position));

  const unfinished = src.filter(
    (r) => effectivePct({ acceptPct: r.acceptPct, pctDone: r.pctDone }) < 100,
  );
  if (unfinished.length === 0) return { scanned: src.length, carried: 0, employees: 0 };

  // Idempotency: which sources already have a clone waiting in the target week?
  const existing = await db
    .select({ carriedFromId: weeklyGoals.carriedFromId })
    .from(weeklyGoals)
    .where(
      and(
        eq(weeklyGoals.weekStart, toWeek),
        inArray(
          weeklyGoals.carriedFromId,
          unfinished.map((r) => r.id),
        ),
      ),
    );
  const alreadyCarried = new Set(existing.map((r) => r.carriedFromId));
  const todo = unfinished.filter((r) => !alreadyCarried.has(r.id));
  if (todo.length === 0) return { scanned: src.length, carried: 0, employees: 0 };

  // Next Sr. No. per employee in the target week — ONE grouped query, then bump
  // locally as we lay out the clones so positions stay contiguous.
  const maxRows = await db
    .select({
      employeeId: weeklyGoals.employeeId,
      max: sql<number>`coalesce(max(${weeklyGoals.position}), 0)::int`,
    })
    .from(weeklyGoals)
    .where(eq(weeklyGoals.weekStart, toWeek))
    .groupBy(weeklyGoals.employeeId);
  const pos = new Map<string, number>(maxRows.map((m) => [m.employeeId, m.max]));

  const values = todo.map((s) => {
    const next = (pos.get(s.employeeId) ?? 0) + 1;
    pos.set(s.employeeId, next);
    return {
      employeeId: s.employeeId,
      weekStart: toWeek,
      position: next,
      client: s.client,
      subject: s.subject,
      priority: s.priority,
      incentive: s.incentive,
      kpi: s.kpi,
      targetDone: s.targetDone,
      explanation: s.explanation,
      linkUrl: s.linkUrl,
      weight: s.weight,
      notes: s.notes,
      // cascade fields carried forward
      monthGoalId: s.monthGoalId,
      area: s.area,
      uom: s.uom,
      targetQty: s.targetQty,
      targetAmount: s.targetAmount,
      actualQty: null,
      actualAmount: null,
      teamInvolved: s.teamInvolved,
      teamDependencyPct: s.teamDependencyPct,
      // keep the goal reaching the same people next week
      delegatedTo: s.delegatedTo,
      shareWithTeam: s.shareWithTeam,
      evidenceUrl: null,
      adopted: true,
      committedAt: null,
      approvedByManagerAt: null,
      pctDone: 0,
      carriedFromId: s.id,
      createdById: s.createdById ?? s.employeeId,
      updatedById: s.createdById ?? s.employeeId,
    };
  });

  await db.insert(weeklyGoals).values(values);
  return {
    scanned: src.length,
    carried: values.length,
    employees: new Set(todo.map((t) => t.employeeId)).size,
  };
}
