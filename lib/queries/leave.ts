import "server-only";
import { and, asc, desc, eq, gte, inArray, lte, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import { employees, leaveCategories, leaveRequests } from "@/db/schema";
import type {
  LeaveKind,
  LeaveStatus,
  OfficePhoneAvailability,
  WorkerType,
} from "@/db/enums";
import { asWorkerType } from "@/lib/attendance/worker-type";
import { isPaidLeaveEligible } from "@/lib/attendance/leave-eligibility";
import {
  leaveCycleFor,
  leaveCycleLabel,
  previousCycleEnd,
  balanceWindow,
  leaveDaysInWindow,
} from "@/lib/attendance/leave-cycle";
import { getDownlineIds } from "@/lib/weekly-goals/hierarchy";

export interface LeaveBalance {
  cycleStart: string;
  cycleEnd: string;
  /** "Jan–Jun 2026" / "Jul–Dec 2026" — the period this balance belongs to. */
  cycleLabel: string;
  allowance: number;
  used: number;
  remaining: number;
  beforeProbation: boolean;
  /** Prior-period leftover (max(0, allowance - used)), surfaced read-only. Paid
   *  leave does NOT cross the Jun/Dec boundary — this is history, not credit. */
  carryForward: number;
  /** The employee's archetype, and whether it accrues paid leave at all. */
  workerType: WorkerType;
  paidEligible: boolean;
  /** Approved UNPAID days inside this period — the third summary card. */
  unpaidUsed: number;
}

export interface LeaveRow {
  id: string;
  employeeId: string;
  employeeName: string;
  /** Archetype of the requester — drives the review panel's "Employee Type". */
  workerType: WorkerType;
  departmentId: string | null;
  kind: LeaveKind;
  /** The admin-editable human reason (0208). Null on rows that predate it, and
   *  on one whose category has since been retired and unlinked. */
  categoryId: string | null;
  categoryName: string | null;
  startDate: string;
  endDate: string;
  /** Half-day boundaries — see lib/attendance/leave-cycle.LeaveSpan for why the
   *  two flags are not symmetric. */
  startHalfDay: boolean;
  endHalfDay: boolean;
  /** Halves included, so this can read 2.5. */
  days: number;
  reason: string | null;
  /** Reachability while away (0208). Null means the question was never asked —
   *  every row filed before the fields existed. */
  availPersonalPhone: boolean | null;
  availOfficePhone: OfficePhoneAvailability | null;
  availComputer: boolean | null;
  status: LeaveStatus;
  decidedByName: string | null;
  decidedAt: Date | null;
  decisionNote: string | null;
  createdAt: Date;
}

/**
 * Sum approved days of one KIND that overlap [from, to]. Callers pass the
 * probation-clamped window for paid leave and the raw period for unpaid.
 */
async function usedDays(
  employeeId: string,
  kind: LeaveKind,
  from: string,
  to: string,
): Promise<number> {
  // Pull approved leaves that could overlap the window, then count the clamped
  // overlap in JS (cheap; leave rows per employee are few).
  const rows = await db
    .select({
      startDate: leaveRequests.startDate,
      endDate: leaveRequests.endDate,
      startHalfDay: leaveRequests.startHalfDay,
      endHalfDay: leaveRequests.endHalfDay,
    })
    .from(leaveRequests)
    .where(
      and(
        eq(leaveRequests.employeeId, employeeId),
        eq(leaveRequests.kind, kind),
        eq(leaveRequests.status, "approved"),
        // overlap: start ≤ window.to AND end ≥ window.from
        lte(leaveRequests.startDate, to),
        gte(leaveRequests.endDate, from),
      ),
    );

  // Half-aware: a boundary day whose other half was worked costs 0.5, not 1.
  // Counting it whole would charge the allowance for time the employee was here.
  let used = 0;
  for (const r of rows) {
    used += leaveDaysInWindow(r, from, to);
  }
  return used;
}

/**
 * Current-period leave balance for an employee.
 *
 * PAID leave is a full-time-only entitlement (see lib/attendance/leave-eligibility)
 * granted per calendar half-year — 3 in Jan–Jun, 4 in Jul–Dec — and clamped so
 * that days before `probationEnd` never count. A non-full-timer, or a full-timer
 * with no probation-end set, gets allowance 0; `paidEligible` tells the UI which
 * of those two it is, so it can show "unpaid only" rather than "0 of 0 paid".
 *
 * UNPAID leave has no allowance — `unpaidUsed` is simply what was approved
 * inside the same period, so the employee sees both numbers in one place.
 */
export async function getLeaveBalance(
  employeeId: string,
  refTodayISO: string,
): Promise<LeaveBalance> {
  const emp = await db.query.employees.findFirst({
    where: eq(employees.id, employeeId),
    columns: { probationEnd: true, workerType: true },
  });
  const probationEnd = emp?.probationEnd ?? null;
  const workerType = asWorkerType(emp?.workerType);
  const paidEligible = isPaidLeaveEligible(workerType);

  // The period never depends on probation-end, so it can always be named — even
  // for someone with no anchor, or no paid entitlement at all.
  //
  // Pass the NULL through rather than substituting today. probation-end is now
  // also the confirmation date that drives pro-rata, and "today" as a stand-in
  // would read as "confirmed this month" — pro-rating almost the whole roster
  // down to a fraction of their leave, since only 3 of 24 employees have the
  // column set. Null means "confirmed long ago" and yields the full allowance.
  const cycle = leaveCycleFor(probationEnd, refTodayISO);
  const cycleLabel = leaveCycleLabel(cycle);
  const unpaidUsed = await usedDays(
    employeeId,
    "unpaid",
    cycle.cycleStart,
    cycle.cycleEnd,
  );

  const base = {
    cycleStart: cycle.cycleStart,
    cycleEnd: cycle.cycleEnd,
    cycleLabel,
    workerType,
    paidEligible,
    unpaidUsed,
  };

  // No paid entitlement — wrong archetype, or no probation anchor set yet.
  if (!paidEligible || !probationEnd) {
    return {
      ...base,
      allowance: 0,
      used: 0,
      remaining: 0,
      beforeProbation: false,
      carryForward: 0,
    };
  }

  if (cycle.beforeProbation) {
    return {
      ...base,
      allowance: 0,
      used: 0,
      remaining: 0,
      beforeProbation: true,
      carryForward: 0,
    };
  }

  const win = balanceWindow(probationEnd, cycle.cycleStart, cycle.cycleEnd);
  const used = win ? await usedDays(employeeId, "paid", win.from, win.to) : 0;
  const remaining = Math.max(0, cycle.allowance - used);

  // Prior period, shown read-only. Deliberately NOT added to this period's
  // allowance: nothing crosses the Jun/Dec boundary.
  let carryForward = 0;
  const priorRef = previousCycleEnd(cycle.cycleStart);
  // No probation-end recorded ⇒ nothing to be "before", so the prior period is
  // always in scope. The old string comparison against a null read as false.
  if (!probationEnd || priorRef >= probationEnd) {
    const prior = leaveCycleFor(probationEnd, priorRef);
    const priorWin = prior.beforeProbation
      ? null
      : balanceWindow(probationEnd, prior.cycleStart, prior.cycleEnd);
    if (priorWin) {
      const priorUsed = await usedDays(employeeId, "paid", priorWin.from, priorWin.to);
      carryForward = Math.max(0, prior.allowance - priorUsed);
    }
  }

  return {
    ...base,
    allowance: cycle.allowance,
    used,
    remaining,
    beforeProbation: false,
    carryForward,
  };
}

/** The row shape every leave listing returns, joined to the requester. */
function leaveRowSelection() {
  const decider = alias(employees, "decider");
  return {
    decider,
    columns: {
      id: leaveRequests.id,
      employeeId: leaveRequests.employeeId,
      employeeName: employees.name,
      workerType: employees.workerType,
      departmentId: employees.departmentId,
      kind: leaveRequests.kind,
      categoryId: leaveRequests.categoryId,
      categoryName: leaveCategories.name,
      startDate: leaveRequests.startDate,
      endDate: leaveRequests.endDate,
      startHalfDay: leaveRequests.startHalfDay,
      endHalfDay: leaveRequests.endHalfDay,
      days: leaveRequests.days,
      reason: leaveRequests.reason,
      availPersonalPhone: leaveRequests.availPersonalPhone,
      availOfficePhone: leaveRequests.availOfficePhone,
      availComputer: leaveRequests.availComputer,
      status: leaveRequests.status,
      decidedByName: decider.name,
      decidedAt: leaveRequests.decidedAt,
      decisionNote: leaveRequests.decisionNote,
      createdAt: leaveRequests.createdAt,
    },
  };
}

type RawLeaveRow = {
  workerType: string | null;
  days: string;
  decidedByName: string | null;
  categoryName: string | null;
} & Omit<LeaveRow, "workerType" | "days" | "decidedByName" | "categoryName">;

function toLeaveRows(rows: RawLeaveRow[]): LeaveRow[] {
  return rows.map((r) => ({
    ...r,
    workerType: asWorkerType(r.workerType),
    days: Number(r.days),
    decidedByName: r.decidedByName ?? null,
    categoryName: r.categoryName ?? null,
  }));
}

/** Shared select + joins for the simple list queries. `where` and ordering are
 *  applied by the caller. Returns mapped LeaveRows (days → number). */
async function selectLeaveRows(
  where: SQL | undefined,
  order: "newest" | "by_start",
): Promise<LeaveRow[]> {
  const { decider, columns } = leaveRowSelection();
  const rows = await db
    .select(columns)
    .from(leaveRequests)
    .innerJoin(employees, eq(leaveRequests.employeeId, employees.id))
    .leftJoin(decider, eq(leaveRequests.decidedById, decider.id))
    // LEFT, not inner: a retired category unlinks (ON DELETE SET NULL) and the
    // leave itself must keep listing regardless.
    .leftJoin(leaveCategories, eq(leaveRequests.categoryId, leaveCategories.id))
    .where(where)
    .orderBy(
      order === "newest"
        ? desc(leaveRequests.createdAt)
        : asc(leaveRequests.startDate),
    );
  return toLeaveRows(rows as RawLeaveRow[]);
}

/** My leave requests, newest first. */
export async function listMyLeave(employeeId: string): Promise<LeaveRow[]> {
  return selectLeaveRows(eq(leaveRequests.employeeId, employeeId), "newest");
}

/** All pending leave requests (admin), oldest-first (queue order). */
export async function listPendingLeave(): Promise<LeaveRow[]> {
  return selectLeaveRows(eq(leaveRequests.status, "pending"), "by_start");
}

/**
 * Approved leaves for a set of employees overlapping [start,end] (B7 grid).
 * Overlap = leave.start ≤ end AND leave.end ≥ start.
 */
export async function listEmployeeLeaveForRange(
  employeeIds: string[],
  start: string,
  end: string,
): Promise<LeaveRow[]> {
  if (employeeIds.length === 0) return [];
  return selectLeaveRows(
    and(
      inArray(leaveRequests.employeeId, employeeIds),
      eq(leaveRequests.status, "approved"),
      lte(leaveRequests.startDate, end),
      gte(leaveRequests.endDate, start),
    ),
    "by_start",
  );
}

// ── Review scope (§3 permissions) ───────────────────────────────────────────

/**
 * WHOSE leave requests may this person act on?
 *
 *   · admin       → every employee (`all: true`)
 *   · manager     → their full downline (direct reports and below, transitively),
 *                   reusing the SAME org-chart walk the weekly-goals permissions
 *                   use, so "who do I manage" has one answer in the app
 *   · anyone else → nobody
 *
 * `ids` deliberately EXCLUDES the reviewer themselves: approving your own leave
 * is not a manager power, and the queue would otherwise offer you an Approve
 * button on your own request.
 */
export interface LeaveReviewScope {
  all: boolean;
  ids: string[];
  canReview: boolean;
}

export async function leaveReviewScopeFor(me: {
  id: string;
  isAdmin: boolean;
}): Promise<LeaveReviewScope> {
  if (me.isAdmin) return { all: true, ids: [], canReview: true };
  const downline = await getDownlineIds(me.id);
  return { all: false, ids: downline, canReview: downline.length > 0 };
}

/** True when this reviewer may decide on `employeeId`'s request. */
export function scopeCovers(scope: LeaveReviewScope, employeeId: string): boolean {
  if (!scope.canReview) return false;
  return scope.all || scope.ids.includes(employeeId);
}

/** The scope as a SQL predicate: `undefined` = no restriction (admin),
 *  `null` = no access at all (caller should return nothing). */
function scopePredicate(scope: LeaveReviewScope): SQL | undefined | null {
  if (scope.all) return undefined;
  if (scope.ids.length === 0) return null;
  return inArray(leaveRequests.employeeId, scope.ids);
}

export interface LeaveRequestFilters {
  /** "all" keeps every status; otherwise an exact match. */
  status?: LeaveStatus | "all";
  employeeId?: string;
  /** Primary department of the requester. Admin-only in the UI — a manager's
   *  queue is already one team, so a department cut of it says nothing. */
  departmentId?: string;
  kind?: LeaveKind;
  /** Inclusive range the leave must OVERLAP. */
  from?: string;
  to?: string;
}

/**
 * The review queue for Attendance › Leave Requests, scoped to what the
 * signed-in reviewer may see and narrowed by the page's filters.
 *
 * Ordering puts PENDING first — the only actionable state — then newest-first
 * inside each group, so the queue reads as work-to-do rather than as a log.
 */
export async function listLeaveRequestsForReview(
  scope: LeaveReviewScope,
  filters: LeaveRequestFilters = {},
): Promise<LeaveRow[]> {
  const scoped = scopePredicate(scope);
  if (scoped === null) return [];

  const clauses: SQL[] = [];
  if (scoped) clauses.push(scoped);
  if (filters.status && filters.status !== "all") {
    clauses.push(eq(leaveRequests.status, filters.status));
  }
  if (filters.employeeId) clauses.push(eq(leaveRequests.employeeId, filters.employeeId));
  if (filters.departmentId) clauses.push(eq(employees.departmentId, filters.departmentId));
  if (filters.kind) clauses.push(eq(leaveRequests.kind, filters.kind));
  // Overlap, not containment: a leave straddling a range edge is still in it.
  if (filters.to) clauses.push(lte(leaveRequests.startDate, filters.to));
  if (filters.from) clauses.push(gte(leaveRequests.endDate, filters.from));

  const { decider, columns } = leaveRowSelection();
  const rows = await db
    .select(columns)
    .from(leaveRequests)
    .innerJoin(employees, eq(leaveRequests.employeeId, employees.id))
    .leftJoin(decider, eq(leaveRequests.decidedById, decider.id))
    .leftJoin(leaveCategories, eq(leaveRequests.categoryId, leaveCategories.id))
    .where(clauses.length > 0 ? and(...clauses) : undefined)
    .orderBy(
      sql`case when ${leaveRequests.status} = 'pending' then 0 else 1 end`,
      desc(leaveRequests.createdAt),
    );

  return toLeaveRows(rows as RawLeaveRow[]);
}

/**
 * How many pending requests is this reviewer on the hook for, and from how many
 * distinct people — the two numbers the Employees-page callout needs ("3
 * employees have requested leave"). Returns zeroes for a non-reviewer, so the
 * caller can render nothing without a permission check of its own.
 */
export async function countPendingLeaveForReview(
  scope: LeaveReviewScope,
): Promise<{ requests: number; employees: number }> {
  const scoped = scopePredicate(scope);
  if (scoped === null) return { requests: 0, employees: 0 };

  const clauses: SQL[] = [eq(leaveRequests.status, "pending")];
  if (scoped) clauses.push(scoped);

  const [row] = await db
    .select({
      requests: sql<number>`count(*)::int`,
      employees: sql<number>`count(distinct ${leaveRequests.employeeId})::int`,
    })
    .from(leaveRequests)
    .where(and(...clauses));

  return { requests: row?.requests ?? 0, employees: row?.employees ?? 0 };
}

/** Employees the reviewer may filter the queue by (the Employee dropdown). */
export async function listReviewableEmployees(
  scope: LeaveReviewScope,
): Promise<{ id: string; name: string }[]> {
  if (!scope.canReview) return [];
  if (!scope.all && scope.ids.length === 0) return [];
  return db
    .select({ id: employees.id, name: employees.name })
    .from(employees)
    .where(
      scope.all
        ? eq(employees.accountType, "employee")
        : inArray(employees.id, scope.ids),
    )
    .orderBy(asc(employees.name));
}
