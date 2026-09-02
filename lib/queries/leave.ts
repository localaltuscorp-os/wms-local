import "server-only";
import { and, asc, desc, eq, gte, inArray, lte, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import { employees, leaveRequests } from "@/db/schema";
import type { LeaveKind, LeaveStatus } from "@/db/enums";
import {
  leaveCycleFor,
  balanceWindow,
  overlapDays,
} from "@/lib/attendance/leave-cycle";

export interface LeaveBalance {
  cycleStart: string;
  cycleEnd: string;
  allowance: number;
  used: number;
  remaining: number;
  beforeProbation: boolean;
  /** Prior-cycle leftover (max(0, allowance - used)), surfaced read-only. The
   *  policy does NOT auto-extend this cycle's allowance with it. */
  carryForward: number;
}

export interface LeaveRow {
  id: string;
  employeeId: string;
  employeeName: string;
  kind: LeaveKind;
  startDate: string;
  endDate: string;
  days: number;
  reason: string | null;
  status: LeaveStatus;
  decidedByName: string | null;
  decidedAt: Date | null;
  decisionNote: string | null;
  createdAt: Date;
}

/** Sum approved PAID leave days that overlap the clamped window, per the
 *  cycle anchored at `probationEnd`. `refTodayISO` is YYYY-MM-DD. */
async function usedPaidDays(
  employeeId: string,
  probationEnd: string,
  cycleStart: string,
  cycleEnd: string,
): Promise<number> {
  const win = balanceWindow(probationEnd, cycleStart, cycleEnd);
  if (!win) return 0;

  // Pull approved paid leaves that could overlap the window, then count the
  // clamped overlap in JS (cheap; leave rows per employee are few).
  const rows = await db
    .select({
      startDate: leaveRequests.startDate,
      endDate: leaveRequests.endDate,
    })
    .from(leaveRequests)
    .where(
      and(
        eq(leaveRequests.employeeId, employeeId),
        eq(leaveRequests.kind, "paid"),
        eq(leaveRequests.status, "approved"),
        // overlap: start ≤ window.to AND end ≥ window.from
        lte(leaveRequests.startDate, win.to),
        gte(leaveRequests.endDate, win.from),
      ),
    );

  let used = 0;
  for (const r of rows) {
    used += overlapDays(r.startDate, r.endDate, win.from, win.to);
  }
  return used;
}

/**
 * Current-cycle paid-leave balance for an employee. Uses the employee's
 * `probationEnd` as the cycle anchor; counts approved paid leave whose dates
 * fall in [max(cycleStart, probationEnd), cycleEnd]. If the employee has no
 * probationEnd or is still before it, allowance/remaining are 0.
 */
export async function getLeaveBalance(
  employeeId: string,
  refTodayISO: string,
): Promise<LeaveBalance> {
  const emp = await db.query.employees.findFirst({
    where: eq(employees.id, employeeId),
    columns: { probationEnd: true },
  });
  const probationEnd = emp?.probationEnd ?? null;

  if (!probationEnd) {
    return {
      cycleStart: refTodayISO,
      cycleEnd: refTodayISO,
      allowance: 0,
      used: 0,
      remaining: 0,
      beforeProbation: false,
      carryForward: 0,
    };
  }

  const cycle = leaveCycleFor(probationEnd, refTodayISO);
  if (cycle.beforeProbation) {
    return {
      cycleStart: cycle.cycleStart,
      cycleEnd: cycle.cycleEnd,
      allowance: 0,
      used: 0,
      remaining: 0,
      beforeProbation: true,
      carryForward: 0,
    };
  }

  const used = await usedPaidDays(
    employeeId,
    probationEnd,
    cycle.cycleStart,
    cycle.cycleEnd,
  );
  const remaining = Math.max(0, cycle.allowance - used);

  // Prior cycle: the day before this cycle's start. carryForward is the prior
  // cycle's leftover (read-only; not added to this cycle's allowance).
  let carryForward = 0;
  const priorRefMs = Date.parse(`${cycle.cycleStart}T00:00:00Z`) - 86_400_000;
  if (!Number.isNaN(priorRefMs)) {
    const priorRef = new Date(priorRefMs).toISOString().slice(0, 10);
    if (priorRef >= probationEnd) {
      const prior = leaveCycleFor(probationEnd, priorRef);
      if (!prior.beforeProbation) {
        const priorUsed = await usedPaidDays(
          employeeId,
          probationEnd,
          prior.cycleStart,
          prior.cycleEnd,
        );
        carryForward = Math.max(0, prior.allowance - priorUsed);
      }
    }
  }

  return {
    cycleStart: cycle.cycleStart,
    cycleEnd: cycle.cycleEnd,
    allowance: cycle.allowance,
    used,
    remaining,
    beforeProbation: false,
    carryForward,
  };
}

/** Shared select + joins for the three list queries. `where` and ordering are
 *  applied by the caller. Returns mapped LeaveRows (days → number). */
async function selectLeaveRows(
  where: SQL | undefined,
  order: "newest" | "by_start",
): Promise<LeaveRow[]> {
  const decider = alias(employees, "decider");
  const rows = await db
    .select({
      id: leaveRequests.id,
      employeeId: leaveRequests.employeeId,
      employeeName: employees.name,
      kind: leaveRequests.kind,
      startDate: leaveRequests.startDate,
      endDate: leaveRequests.endDate,
      days: leaveRequests.days,
      reason: leaveRequests.reason,
      status: leaveRequests.status,
      decidedByName: decider.name,
      decidedAt: leaveRequests.decidedAt,
      decisionNote: leaveRequests.decisionNote,
      createdAt: leaveRequests.createdAt,
    })
    .from(leaveRequests)
    .innerJoin(employees, eq(leaveRequests.employeeId, employees.id))
    .leftJoin(decider, eq(leaveRequests.decidedById, decider.id))
    .where(where)
    .orderBy(
      order === "newest"
        ? desc(leaveRequests.createdAt)
        : asc(leaveRequests.startDate),
    );

  return rows.map((r) => ({
    ...r,
    days: Number(r.days),
    decidedByName: r.decidedByName ?? null,
  }));
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
