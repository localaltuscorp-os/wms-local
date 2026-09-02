import "server-only";
import { and, gte, lte } from "drizzle-orm";
import { db, holidays } from "@/lib/db";
import { istYmd } from "@/lib/weekly-goals/week";
import { countWorkingDays } from "@/lib/transforms/working-days";
import {
  activityWindow,
  calendarDaysBetween,
  computeActivityTargets,
  type ActivityPeriod,
} from "@/lib/dashboard/manager-activity-contract";
import type {
  CreatorWorkloadRow,
  CreatorWorkloadBoard,
} from "@/lib/dashboard/creator-workload-contract";
// The five-way classification, the org walk and the three source queries all
// live in ONE place. See the header of creator-splits.ts for why.
import { loadCreatorSplits } from "./creator-splits";

// Re-exported so server callers never reach past this module for the shape,
// exactly as manager-activity-board.ts does for its own contract.
export {
  WORKLOAD_RELATIONS,
  WORKLOAD_FAMILIES,
  type RelationSplit,
  type WorkloadRelation,
  type CreatorWorkloadRow,
  type CreatorWorkloadBoard,
} from "@/lib/dashboard/creator-workload-contract";

/**
 * WHO IS CREATING HOW MUCH WORK — one flat row per active employee, counting
 * the items they ORIGINATED in the window, split by their relationship to the
 * person the work landed on.
 *
 * The originator columns, the five-way relationship split and its
 * precedence are all documented and implemented once, in
 * lib/queries/creator-splits.ts. This module is the flat presentation of
 * them: one row per active employee, alphabetical, with the window's
 * pro-rated targets attached.
 */
export async function creatorWorkloadBoard(
  period: ActivityPeriod,
  now: Date = new Date(),
  custom?: { from: string; to: string } | null,
): Promise<CreatorWorkloadBoard> {
  const { from, to } = activityWindow(period, istYmd(now), custom);

  // Working days need the holiday calendar (a DB read), which is why the
  // targets are computed here rather than in the client-safe contract.
  const holidayRows = await db
    .select({ holidayDate: holidays.holidayDate })
    .from(holidays)
    .where(and(gte(holidays.holidayDate, from), lte(holidays.holidayDate, to)))
    .catch(() => [] as { holidayDate: string }[]);
  const targets = computeActivityTargets(
    calendarDaysBetween(from, to),
    countWorkingDays(
      new Date(`${from}T00:00:00Z`),
      new Date(`${to}T00:00:00Z`),
      new Set(holidayRows.map((h) => h.holidayDate)),
    ),
  );

  // ONE call: the org walk, the five-way classification and the three source
  // queries all live in creator-splits.ts, shared with the nested delegation
  // board so the two sections can never disagree about a number.
  const { people, reportsOf, splits } = await loadCreatorSplits(from, to);

  const rows: CreatorWorkloadRow[] = people
    .map((p) => {
      const b = splits.get(p.id)!;
      return {
        employeeId: p.id,
        employeeName: p.name,
        directReports: reportsOf.get(p.id)?.length ?? 0,
        goals: b.goals,
        tasks: b.tasks,
        commitments: b.commitments,
        grandTotal: b.goals.total + b.tasks.total + b.commitments.total,
      };
    })
    // Alphabetical is the board's resting state; every column re-sorts it
    // client-side from here without another round trip.
    .sort((a, b) => a.employeeName.localeCompare(b.employeeName));

  return { period, from, to, targets, rows };
}
