import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees } from "@/db/schema";
import { getEmployeeMonthStatus } from "@/lib/queries/attendance-status";
import { listAdjustments } from "@/lib/queries/salary-ctc-store";
import {
  aggregateMetrics,
  lastNMonths,
  monthMetrics,
  ratio,
  ytdMonths,
  type AttendanceMetrics,
  type Ratio,
} from "@/lib/salary/attendance-metrics";
import { fyForMonth } from "@/lib/salary/period";

// WS-5 Salary — assembles the READ-ONLY attendance-analytics block for one
// person + month. Composes the graded attendance layer
// (lib/queries/attendance-status.ts) with the accountant remarks
// (salary_adjustments, via the fail-open v2 store) into a single serializable
// payload the salary UI can render.
//
// Load posture: this is an on-demand ADMIN drill-down, NOT the dashboard load
// path. Months in the fiscal-YTD window are graded SEQUENTIALLY (not fanned out
// in parallel) so we never spike the DB pool. Each unique month is graded once
// and reused across the this-month / last-3 / YTD windows. (See the
// DB-load-path-off-limits memory: build load-neutral.)

/** An accountant remark for the month (deduct or ex-gratia). */
export interface AdjustmentRemark {
  kind: "deduct" | "ex_gratia";
  days: number;
  reason: string;
}

export interface AttendanceAnalytics {
  employeeId: string;
  employeeName: string;
  month: string; // YYYY-MM
  fyLabel: string; // "FY 26-27"
  thisMonth: AttendanceMetrics;
  last3Months: AttendanceMetrics;
  ytd: AttendanceMetrics;
  exGratiaRemarks: AdjustmentRemark[];
  deductionRemarks: AdjustmentRemark[];
}

/** IST "today" as YYYY-MM-DD — the reference day the grader needs. */
function istToday(): string {
  return new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
}

/** Grade one month and reduce it to discipline metrics. */
async function metricsForMonth(
  employeeId: string,
  monthYm: string,
  refTodayISO: string,
): Promise<AttendanceMetrics> {
  const [y, m] = monthYm.split("-").map(Number) as [number, number];
  const status = await getEmployeeMonthStatus(employeeId, y, m, refTodayISO);
  const attendedDays = status.days.filter((d) => d.inAt != null).length;
  return monthMetrics({
    month: monthYm,
    attendedDays,
    lateRaw: status.summary.lateRaw,
    lateWaived: status.summary.lateWaived,
    leftEarly: status.summary.leftEarly,
  });
}

/**
 * Full analytics for a person + "YYYY-MM". Returns null only when the employee
 * id is unknown. Remarks are fail-open (empty if the salary_adjustments table
 * isn't migrated yet).
 */
export async function loadAttendanceAnalytics(
  employeeId: string,
  month: string,
): Promise<AttendanceAnalytics | null> {
  const [emp] = await db
    .select({ id: employees.id, name: employees.name })
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);
  if (!emp) return null;

  const refTodayISO = istToday();

  // Unique months across the widest window (YTD ⊇ last-3 ⊇ this-month).
  const ytdList = ytdMonths(month);
  const last3List = lastNMonths(month, 3);
  const uniqueMonths = Array.from(new Set([...ytdList, ...last3List, month]));

  // Grade sequentially (pool-safe) and memoize per month.
  const byMonth = new Map<string, AttendanceMetrics>();
  for (const ym of uniqueMonths) {
    byMonth.set(ym, await metricsForMonth(employeeId, ym, refTodayISO));
  }

  const pick = (list: string[]): AttendanceMetrics =>
    aggregateMetrics(list.map((ym) => byMonth.get(ym)!).filter(Boolean));

  const thisMonth = byMonth.get(month)!;
  const last3Months = pick(last3List);
  const ytd = pick(ytdList);

  // Accountant remarks for the SELECTED month (fail-open store). The store keys
  // on the "YYYY-MM" month string (see app/(app)/salary/ctc/page.tsx).
  const adjustments = await listAdjustments(employeeId, month);
  const exGratiaRemarks: AdjustmentRemark[] = [];
  const deductionRemarks: AdjustmentRemark[] = [];
  for (const a of adjustments) {
    const remark: AdjustmentRemark = { kind: a.kind, days: a.days, reason: a.reason };
    if (a.kind === "ex_gratia") exGratiaRemarks.push(remark);
    else deductionRemarks.push(remark);
  }

  return {
    employeeId: emp.id,
    employeeName: emp.name,
    month,
    fyLabel: fyForMonth(month),
    thisMonth,
    last3Months,
    ytd,
    exGratiaRemarks,
    deductionRemarks,
  };
}

/** Convenience: the four headline ratios for a metrics window. */
/**
 * Re-exported so every existing server caller keeps its import path. The
 * implementation moved to the pure `lib/salary/attendance-metrics` module
 * because the salary screen renders it from a client component, and importing
 * it from here pulled `server-only` into the client bundle.
 */
export { headlineRatios } from "@/lib/salary/attendance-metrics";
