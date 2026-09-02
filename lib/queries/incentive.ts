import "server-only";
import { desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import { employees, incentiveRequests } from "@/db/schema";
import type { IncentiveStatus, IncentiveType } from "@/db/enums";

export interface IncentiveRequestRow {
  id: string;
  type: IncentiveType;
  status: IncentiveStatus;
  details: Record<string, string>;
  employeeId: string;
  employeeName: string;
  decidedByName: string | null;
  decidedAt: Date | null;
  decisionNote: string | null;
  createdAt: Date;
}

/**
 * Incentive requests, newest first — everyone's for admins, mine otherwise.
 */
export async function listIncentiveRequests(opts: {
  employeeId: string;
  isAdmin: boolean;
  limit?: number;
}): Promise<IncentiveRequestRow[]> {
  const decider = alias(employees, "decider");
  const rows = await db
    .select({
      id: incentiveRequests.id,
      type: incentiveRequests.type,
      status: incentiveRequests.status,
      details: incentiveRequests.details,
      employeeId: incentiveRequests.employeeId,
      employeeName: employees.name,
      decidedByName: decider.name,
      decidedAt: incentiveRequests.decidedAt,
      decisionNote: incentiveRequests.decisionNote,
      createdAt: incentiveRequests.createdAt,
    })
    .from(incentiveRequests)
    .innerJoin(employees, eq(incentiveRequests.employeeId, employees.id))
    .leftJoin(decider, eq(incentiveRequests.decidedById, decider.id))
    .where(
      opts.isAdmin ? undefined : eq(incentiveRequests.employeeId, opts.employeeId),
    )
    .orderBy(desc(incentiveRequests.createdAt))
    .limit(opts.limit ?? 200);

  return rows.map((r) => ({
    ...r,
    decidedByName: r.decidedByName ?? null,
  }));
}
