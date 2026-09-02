import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import { employees, overtimeEntries } from "@/db/schema";

export type OvertimeStatus = "pending" | "approved" | "rejected";

export interface OvertimeRow {
  id: string;
  employeeId: string;
  employeeName: string;
  workDate: string; // ISO yyyy-mm-dd
  hours: number;
  reason: string | null;
  status: OvertimeStatus;
  approvedByName: string | null;
  approvedAt: Date | null;
  note: string | null;
  createdById: string | null;
  createdAt: Date;
}

/** Resolve the approve/reject scope for the signed-in user: admins → everyone,
 *  managers → self + transitive downline. Mirrors weekly-goals goalScopeFor. */
async function approverScope(me: {
  id: string;
  isAdmin: boolean;
}): Promise<{ all: boolean; ids: string[] }> {
  if (me.isAdmin) return { all: true, ids: [] };
  // Lazy import keeps this module free of a hard load-order dependency.
  const { goalScopeFor } = await import("@/lib/weekly-goals/hierarchy");
  return goalScopeFor(me);
}

/**
 * Overtime entries, newest work-date first. Normal users see only their own;
 * admins see everyone; managers see themselves + their downline.
 */
export async function listOvertimeEntries(opts: {
  employeeId: string;
  isAdmin: boolean;
  limit?: number;
}): Promise<OvertimeRow[]> {
  const scope = await approverScope({ id: opts.employeeId, isAdmin: opts.isAdmin });
  const approver = alias(employees, "approver");

  const rows = await db
    .select({
      id: overtimeEntries.id,
      employeeId: overtimeEntries.employeeId,
      employeeName: employees.name,
      workDate: overtimeEntries.workDate,
      hours: overtimeEntries.hours,
      reason: overtimeEntries.reason,
      status: overtimeEntries.status,
      approvedByName: approver.name,
      approvedAt: overtimeEntries.approvedAt,
      note: overtimeEntries.note,
      createdById: overtimeEntries.createdById,
      createdAt: overtimeEntries.createdAt,
    })
    .from(overtimeEntries)
    .innerJoin(employees, eq(overtimeEntries.employeeId, employees.id))
    .leftJoin(approver, eq(overtimeEntries.approvedById, approver.id))
    .where(scope.all ? undefined : inArray(overtimeEntries.employeeId, scope.ids))
    .orderBy(desc(overtimeEntries.workDate), desc(overtimeEntries.createdAt))
    .limit(opts.limit ?? 300);

  return rows.map((r) => ({
    ...r,
    hours: Number(r.hours),
    status: r.status as OvertimeStatus,
    approvedByName: r.approvedByName ?? null,
  }));
}

/** Whether `scope` may approve/reject an entry owned by `targetEmployeeId`. */
export function canApproveOvertime(
  scope: { all: boolean; ids: string[] },
  targetEmployeeId: string,
): boolean {
  return scope.all || scope.ids.includes(targetEmployeeId);
}

export { approverScope as overtimeScopeFor };

// ── Dashboard aggregates ────────────────────────────────────────────────────

export interface OvertimePersonTotal {
  employeeId: string;
  employeeName: string;
  monthHours: number;
  monthApprovedHours: number;
  allTimeHours: number;
  allTimeApprovedHours: number;
}

export interface OvertimeDashboard {
  people: OvertimePersonTotal[];
  pendingCount: number;
  byStatus: { pending: number; approved: number; rejected: number };
  monthTotalHours: number;
  allTimeTotalHours: number;
  monthLabel: string; // e.g. "Jun 2026"
}

/**
 * Per-person overtime totals (this calendar month vs all-time) plus status
 * roll-ups, scoped to the viewer. Approved-only sub-totals power the bars.
 */
export async function getOvertimeDashboard(opts: {
  employeeId: string;
  isAdmin: boolean;
  /** First day of the target month as ISO yyyy-mm-dd (local). */
  monthStartISO: string;
  monthLabel: string;
}): Promise<OvertimeDashboard> {
  const scope = await approverScope({ id: opts.employeeId, isAdmin: opts.isAdmin });
  const monthStart = opts.monthStartISO;

  const scopeCond = scope.all
    ? undefined
    : inArray(overtimeEntries.employeeId, scope.ids);

  // numeric → number happens client-side via Number(); SUM returns text/null.
  const isMonth = sql<number>`CASE WHEN ${overtimeEntries.workDate} >= ${monthStart}::date AND ${overtimeEntries.workDate} < (${monthStart}::date + interval '1 month') THEN 1 ELSE 0 END`;
  const isApproved = sql<number>`CASE WHEN ${overtimeEntries.status} = 'approved' THEN 1 ELSE 0 END`;

  const rows = await db
    .select({
      employeeId: overtimeEntries.employeeId,
      employeeName: employees.name,
      monthHours: sql<string>`COALESCE(SUM(${overtimeEntries.hours} * ${isMonth}), 0)`,
      monthApprovedHours: sql<string>`COALESCE(SUM(${overtimeEntries.hours} * ${isMonth} * ${isApproved}), 0)`,
      allTimeHours: sql<string>`COALESCE(SUM(${overtimeEntries.hours}), 0)`,
      allTimeApprovedHours: sql<string>`COALESCE(SUM(${overtimeEntries.hours} * ${isApproved}), 0)`,
    })
    .from(overtimeEntries)
    .innerJoin(employees, eq(overtimeEntries.employeeId, employees.id))
    .where(scopeCond)
    .groupBy(overtimeEntries.employeeId, employees.name);

  const people: OvertimePersonTotal[] = rows
    .map((r) => ({
      employeeId: r.employeeId,
      employeeName: r.employeeName,
      monthHours: Number(r.monthHours),
      monthApprovedHours: Number(r.monthApprovedHours),
      allTimeHours: Number(r.allTimeHours),
      allTimeApprovedHours: Number(r.allTimeApprovedHours),
    }))
    .sort((a, b) => b.allTimeHours - a.allTimeHours);

  // Status roll-up (counts).
  const statusRows = await db
    .select({
      status: overtimeEntries.status,
      n: sql<string>`COUNT(*)`,
    })
    .from(overtimeEntries)
    .where(scopeCond)
    .groupBy(overtimeEntries.status);

  const byStatus = { pending: 0, approved: 0, rejected: 0 };
  for (const s of statusRows) {
    const key = s.status as OvertimeStatus;
    if (key in byStatus) byStatus[key] = Number(s.n);
  }

  return {
    people,
    pendingCount: byStatus.pending,
    byStatus,
    monthTotalHours: people.reduce((acc, p) => acc + p.monthHours, 0),
    allTimeTotalHours: people.reduce((acc, p) => acc + p.allTimeHours, 0),
    monthLabel: opts.monthLabel,
  };
}

/** Active employees the viewer may log overtime FOR (self + downline, or all). */
export async function listOvertimeLoggableEmployees(opts: {
  employeeId: string;
  isAdmin: boolean;
}): Promise<{ id: string; name: string }[]> {
  const scope = await approverScope({ id: opts.employeeId, isAdmin: opts.isAdmin });
  const rows = await db
    .select({ id: employees.id, name: employees.name })
    .from(employees)
    .where(
      scope.all
        ? eq(employees.isActive, true)
        : and(eq(employees.isActive, true), inArray(employees.id, scope.ids)),
    )
    .orderBy(employees.name);
  return rows;
}
