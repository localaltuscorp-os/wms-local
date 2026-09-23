import "server-only";
import { desc, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import { employees, incentiveRequests } from "@/db/schema";
import type { IncentiveStatus, IncentiveType } from "@/db/enums";
import type { IncentiveSplitShare } from "@/lib/incentive/split";

export interface IncentiveRequestRow {
  id: string;
  type: IncentiveType;
  status: IncentiveStatus;
  details: Record<string, string>;
  /** Split Incentive shares, or null when the request is not split. */
  split: IncentiveSplitShare[] | null;
  employeeId: string;
  employeeName: string;
  decidedByName: string | null;
  decidedAt: Date | null;
  decisionNote: string | null;
  createdAt: Date;
  /** Which submission the row holds (0230). 1 until resubmitted. */
  submissionNo: number;
  /** When the latest resubmission landed, or null. */
  resubmittedAt: Date | null;
}

/**
 * Incentive requests, newest first — everyone's for admins and for the
 * incentive reviewer (Manan), mine otherwise.
 */
export async function listIncentiveRequests(opts: {
  employeeId: string;
  isAdmin: boolean;
  /** The incentive reviewer sees every request, admin or not. */
  canReview?: boolean;
  limit?: number;
  /**
   * THE VISIBILITY CEILING — the employees whose requests this viewer may read
   * (lib/incentive/analytics/scope.ts). `null`/absent = no narrowing, which is
   * only correct for a viewer the scope resolver has already cleared
   * organisation-wide; an EMPTY set means "nobody" and returns nothing rather
   * than everything, because conflating those two is how a filter widens a
   * query by accident.
   *
   * `isAdmin` no longer widens this on its own: an administrator sees their own
   * requests and their downline unless a grant says otherwise.
   */
  visibleEmployeeIds?: ReadonlySet<string> | null;
}): Promise<IncentiveRequestRow[]> {
  const decider = alias(employees, "decider");
  const visible = opts.visibleEmployeeIds ?? null;
  if (visible && visible.size === 0) return [];
  const rows = await db
    .select({
      id: incentiveRequests.id,
      type: incentiveRequests.type,
      status: incentiveRequests.status,
      details: incentiveRequests.details,
      split: incentiveRequests.split,
      employeeId: incentiveRequests.employeeId,
      employeeName: employees.name,
      decidedByName: decider.name,
      decidedAt: incentiveRequests.decidedAt,
      decisionNote: incentiveRequests.decisionNote,
      createdAt: incentiveRequests.createdAt,
      submissionNo: incentiveRequests.submissionNo,
      resubmittedAt: incentiveRequests.resubmittedAt,
    })
    .from(incentiveRequests)
    .innerJoin(employees, eq(incentiveRequests.employeeId, employees.id))
    .leftJoin(decider, eq(incentiveRequests.decidedById, decider.id))
    .where(
      visible
        ? inArray(incentiveRequests.employeeId, [...visible])
        : opts.isAdmin || opts.canReview
          ? undefined
          : eq(incentiveRequests.employeeId, opts.employeeId),
    )
    .orderBy(desc(incentiveRequests.createdAt))
    .limit(opts.limit ?? 200);

  return rows.map((r) => ({
    ...r,
    split: r.split ?? null,
    decidedByName: r.decidedByName ?? null,
  }));
}
