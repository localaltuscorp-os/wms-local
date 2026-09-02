import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  attendanceSheetDay,
  attendanceSheetMonth,
  paidLeaveCycle,
  type AttendanceSheetMonth,
  type PaidLeaveCycle,
} from "@/db/schema";

/**
 * READ-side queries over the HR "Attendance log" sheet mirror (migration
 * 0101; populated by lib/attendance-log/*-sync.ts). This is a PARALLEL
 * authoritative layer sourced from the HR sheet — it does not replace, feed
 * or alter the in-app punch flow (attendance_logs), grading
 * (attendance-status.ts) or the leave module; UI consuming it should label
 * the data "HR sheet record".
 *
 * All lookups are by employee_id, so only sheet rows that matched an employee
 * are surfaced (unmatched names live in the tables + sync_runs until an alias
 * is added). Load-neutral: small indexed selects, fetched on demand.
 */

/** Raw sheet day codes: P | A | W/O | H | H-P | H-H/D | H/D | -  */
export interface HrSheetDayCell {
  day: number;
  statusCode: string;
  /** 'YYYY-MM-DD'; null when the day column exceeds that month's length. */
  date: string | null;
}

export interface HrSheetMonthRecord {
  summary: AttendanceSheetMonth;
  /** Day cells 1..31 as present in the sheet, ordered by day. */
  days: HrSheetDayCell[];
}

/**
 * One employee's HR-sheet record for one month ('YYYY-MM-01' bucket, or any
 * 'YYYY-MM…' string — normalized here). Null when the sheet has no row.
 */
export async function loadHrSheetMonth(
  employeeId: string,
  month: string,
): Promise<HrSheetMonthRecord | null> {
  const bucket = `${month.slice(0, 7)}-01`;
  const [summary] = await db
    .select()
    .from(attendanceSheetMonth)
    .where(and(eq(attendanceSheetMonth.employeeId, employeeId), eq(attendanceSheetMonth.month, bucket)))
    .limit(1);
  if (!summary) return null;

  const days = await db
    .select({
      day: attendanceSheetDay.day,
      statusCode: attendanceSheetDay.statusCode,
      date: attendanceSheetDay.date,
    })
    .from(attendanceSheetDay)
    .where(and(eq(attendanceSheetDay.employeeId, employeeId), eq(attendanceSheetDay.month, bucket)))
    .orderBy(asc(attendanceSheetDay.day));

  return { summary, days };
}

/** Months ('YYYY-MM-01') the HR sheet has for this employee, newest first. */
export async function listHrSheetMonths(employeeId: string): Promise<string[]> {
  const rows = await db
    .select({ month: attendanceSheetMonth.month })
    .from(attendanceSheetMonth)
    .where(eq(attendanceSheetMonth.employeeId, employeeId))
    .orderBy(desc(attendanceSheetMonth.month));
  return rows.map((r) => r.month);
}

export interface HrPaidLeaveRecord {
  /** DOJ from the sheet block header ('YYYY-MM-DD'), when parseable. */
  doj: string | null;
  /** Cycle rows in sheet order (period ascending by import order). */
  cycles: PaidLeaveCycle[];
  /** Sum of the numeric Leaves cells across all cycles. */
  totalLeaves: number;
}

/**
 * The HR sheet's paid-leave cycles + entitlement total for one employee.
 * Null when the sheet has no matched block for them.
 */
export async function loadHrPaidLeave(employeeId: string): Promise<HrPaidLeaveRecord | null> {
  const cycles = await db
    .select()
    .from(paidLeaveCycle)
    .where(eq(paidLeaveCycle.employeeId, employeeId))
    .orderBy(asc(paidLeaveCycle.importedAt), asc(paidLeaveCycle.period));
  if (cycles.length === 0) return null;

  const totalLeaves = cycles.reduce((sum, c) => sum + (c.leaves == null ? 0 : Number(c.leaves)), 0);
  return {
    doj: cycles.find((c) => c.doj != null)?.doj ?? null,
    cycles,
    totalLeaves,
  };
}
