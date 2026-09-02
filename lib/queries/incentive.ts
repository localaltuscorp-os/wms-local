import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import { employees, incentiveRequests } from "@/db/schema";
import type { IncentiveStatus, IncentiveType } from "@/db/enums";

export interface IncentiveRequestRow {
  id: string;
  type: IncentiveType | "project" | "sheet" | "weekly_goal";
  status: IncentiveStatus;
  details: Record<string, string>;
  employeeId: string;
  employeeName: string;
  decidedByName: string | null;
  decidedAt: Date | null;
  decisionNote: string | null;
  createdAt: Date;
  // Ledger fields (migration 0057).
  amount: number;
  paid: boolean;
  paidAmt: number;
  paidDate: string | null;
  label: string | null;
  conditions: Record<string, string> | null;
  archived: boolean;
}

/**
 * Incentive requests, newest first — everyone's for admins, mine otherwise.
 * Archived rows are excluded unless `archived: true` is requested.
 */
export async function listIncentiveRequests(opts: {
  employeeId: string;
  isAdmin: boolean;
  archived?: boolean;
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
      amount: incentiveRequests.amount,
      paid: incentiveRequests.paid,
      paidAmt: incentiveRequests.paidAmt,
      paidDate: incentiveRequests.paidDate,
      label: incentiveRequests.label,
      conditions: incentiveRequests.conditions,
      archived: incentiveRequests.archived,
    })
    .from(incentiveRequests)
    .innerJoin(employees, eq(incentiveRequests.employeeId, employees.id))
    .leftJoin(decider, eq(incentiveRequests.decidedById, decider.id))
    .where(
      and(
        eq(incentiveRequests.archived, opts.archived ?? false),
        opts.isAdmin ? undefined : eq(incentiveRequests.employeeId, opts.employeeId),
      ),
    )
    .orderBy(desc(incentiveRequests.createdAt))
    .limit(opts.limit ?? 200);

  return rows.map((r) => ({
    ...r,
    decidedByName: r.decidedByName ?? null,
  }));
}

/* ------------------------------------------------------------------ */
/* Dashboard aggregation                                               */
/* ------------------------------------------------------------------ */

export interface IncentiveLeader {
  employeeId: string;
  employeeName: string;
  approved: number;
  paid: number;
  unpaid: number;
  count: number;
}

export interface IncentiveDashboardData {
  totals: { earned: number; approved: number; paid: number; unpaid: number; count: number };
  leaderboard: IncentiveLeader[];
  byType: { type: IncentiveType | "project" | "sheet" | "weekly_goal"; approved: number; count: number }[];
  byMonth: { month: string; approved: number; paid: number }[];
}

function istMonth(d: Date): string {
  // e.g. "Apr-26"
  const s = d.toLocaleDateString("en-US", { timeZone: "Asia/Kolkata", month: "short", year: "2-digit" });
  return s.replace(" ", "-");
}

/**
 * Org-wide incentive dashboard: headline totals, per-employee leaderboard,
 * per-scheme split, and the last several months' trend. Approved/unpaid only
 * count once a request is approved (matches the ledger rule).
 */
export async function incentiveDashboard(): Promise<IncentiveDashboardData> {
  const rows = await db
    .select({
      type: incentiveRequests.type,
      status: incentiveRequests.status,
      amount: incentiveRequests.amount,
      paid: incentiveRequests.paid,
      paidAmt: incentiveRequests.paidAmt,
      employeeId: incentiveRequests.employeeId,
      employeeName: employees.name,
      createdAt: incentiveRequests.createdAt,
    })
    .from(incentiveRequests)
    .innerJoin(employees, eq(incentiveRequests.employeeId, employees.id))
    .where(eq(incentiveRequests.archived, false));

  const totals = { earned: 0, approved: 0, paid: 0, unpaid: 0, count: rows.length };
  const leaders = new Map<string, IncentiveLeader>();
  const types = new Map<string, { approved: number; count: number }>();
  const months = new Map<string, { approved: number; paid: number }>();

  for (const r of rows) {
    const isApproved = r.status === "approved";
    const approvedAmt = isApproved ? r.amount : 0;
    const unpaid = isApproved ? Math.max(0, r.amount - r.paidAmt) : 0;
    totals.earned += r.amount;
    totals.approved += approvedAmt;
    totals.paid += r.paidAmt;
    totals.unpaid += unpaid;

    const L = leaders.get(r.employeeId) ?? {
      employeeId: r.employeeId, employeeName: r.employeeName,
      approved: 0, paid: 0, unpaid: 0, count: 0,
    };
    L.approved += approvedAmt; L.paid += r.paidAmt; L.unpaid += unpaid; L.count += 1;
    leaders.set(r.employeeId, L);

    const T = types.get(r.type) ?? { approved: 0, count: 0 };
    T.approved += approvedAmt; T.count += 1;
    types.set(r.type, T);

    const mk = istMonth(r.createdAt);
    const M = months.get(mk) ?? { approved: 0, paid: 0 };
    M.approved += approvedAmt; M.paid += r.paidAmt;
    months.set(mk, M);
  }

  return {
    totals,
    leaderboard: [...leaders.values()].sort((a, b) => b.approved - a.approved),
    byType: [...types.entries()].map(([type, v]) => ({ type: type as IncentiveType | "project" | "sheet" | "weekly_goal", ...v })).sort((a, b) => b.approved - a.approved),
    byMonth: [...months.entries()].map(([month, v]) => ({ month, ...v })),
  };
}
