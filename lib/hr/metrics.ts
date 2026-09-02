import "server-only";
import { and, gte, sql, ne, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { hrTickets } from "@/db/schema";
import {
  HR_TICKET_OPEN_STATUSES,
  HR_TICKET_CATEGORIES,
  HR_TICKET_CATEGORY_LABELS,
  type HrTicketCategory,
  type HrTicketStatus,
} from "@/db/enums";

/**
 * On-demand HR support metrics. Computed straight off hr_tickets over a bounded
 * recent window — no projection table, no engine. Confidential (grievance)
 * tickets are EXCLUDED from every drill-down (design brief: never leak into
 * metrics); only their headline count is exposed as an aggregate.
 *
 * Handler/admin-only surface — the caller gates access (see /hr/metrics).
 */

export interface HrMetrics {
  windowDays: number;
  total: number;
  open: number;
  resolvedOrClosed: number;
  confidentialOpen: number;
  breaching: number;
  /** Median-ish: mean first-response time in hours over responded tickets. */
  avgFirstResponseHours: number | null;
  avgResolutionHours: number | null;
  csatAvg: number | null;
  csatCount: number;
  byStatus: Array<{ status: HrTicketStatus; count: number }>;
  byCategory: Array<{ category: HrTicketCategory; label: string; count: number }>;
}

export async function getHrMetrics(windowDays = 90): Promise<HrMetrics> {
  const since = new Date(Date.now() - windowDays * 86_400_000);

  // Non-confidential tickets in the window — the drill-down universe.
  const rows = await db
    .select({
      status: hrTickets.status,
      category: hrTickets.category,
      priority: hrTickets.priority,
      createdAt: hrTickets.createdAt,
      firstResponseDueAt: hrTickets.firstResponseDueAt,
      firstRespondedAt: hrTickets.firstRespondedAt,
      resolutionDueAt: hrTickets.resolutionDueAt,
      resolvedAt: hrTickets.resolvedAt,
      csatScore: hrTickets.csatScore,
    })
    .from(hrTickets)
    .where(and(gte(hrTickets.createdAt, since), ne(hrTickets.confidential, true)))
    .limit(5000);

  // Confidential headline count (never drilled into).
  const [{ n: confOpen } = { n: 0 }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(hrTickets)
    .where(
      and(
        gte(hrTickets.createdAt, since),
        eq(hrTickets.confidential, true),
        inArray(hrTickets.status, [...HR_TICKET_OPEN_STATUSES]),
      ),
    );

  const openSet = new Set<string>(HR_TICKET_OPEN_STATUSES);
  const now = Date.now();

  let open = 0;
  let resolvedOrClosed = 0;
  let breaching = 0;
  const frtHours: number[] = [];
  const resHours: number[] = [];
  const csatScores: number[] = [];
  const statusCounts = new Map<HrTicketStatus, number>();
  const catCounts = new Map<HrTicketCategory, number>();

  for (const r of rows) {
    const st = r.status as HrTicketStatus;
    statusCounts.set(st, (statusCounts.get(st) ?? 0) + 1);
    catCounts.set(r.category as HrTicketCategory, (catCounts.get(r.category as HrTicketCategory) ?? 0) + 1);
    if (openSet.has(st)) open += 1;
    if (st === "resolved" || st === "closed") resolvedOrClosed += 1;

    if (r.firstRespondedAt) {
      frtHours.push((r.firstRespondedAt.getTime() - r.createdAt.getTime()) / 3_600_000);
    }
    if (r.resolvedAt) {
      resHours.push((r.resolvedAt.getTime() - r.createdAt.getTime()) / 3_600_000);
    }
    if (typeof r.csatScore === "number") csatScores.push(r.csatScore);

    // Breaching = open + a passed due-stamp not yet satisfied.
    if (openSet.has(st)) {
      const frtBreach = !r.firstRespondedAt && r.firstResponseDueAt && r.firstResponseDueAt.getTime() < now;
      const resBreach = !r.resolvedAt && r.resolutionDueAt && r.resolutionDueAt.getTime() < now;
      if (frtBreach || resBreach) breaching += 1;
    }
  }

  const mean = (xs: number[]): number | null =>
    xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null;

  const byStatus = Array.from(statusCounts.entries()).map(([status, count]) => ({ status, count }));
  const byCategory = HR_TICKET_CATEGORIES.filter((c) => c !== "grievance").map((category) => ({
    category,
    label: HR_TICKET_CATEGORY_LABELS[category],
    count: catCounts.get(category) ?? 0,
  }));

  return {
    windowDays,
    total: rows.length,
    open,
    resolvedOrClosed,
    confidentialOpen: Number(confOpen ?? 0),
    breaching,
    avgFirstResponseHours: mean(frtHours),
    avgResolutionHours: mean(resHours),
    csatAvg: csatScores.length ? Math.round((csatScores.reduce((a, b) => a + b, 0) / csatScores.length) * 100) / 100 : null,
    csatCount: csatScores.length,
    byStatus,
    byCategory,
  };
}
