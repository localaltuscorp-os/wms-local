import "server-only";
import { and, asc, desc, eq, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  designations,
  employees,
  payingEntities,
  salaryAdvances,
  salaryProfiles,
  salaryRuns,
} from "@/db/schema";

/** Drizzle `date` columns come back as strings (YYYY-MM-DD), but guard for Date. */
function toISODate(v: string | Date | null): string | null {
  if (v == null) return null;
  return typeof v === "string" ? v : v.toISOString().slice(0, 10);
}

export interface SalaryProfileRow {
  employeeId: string;
  name: string;
  email: string;
  designationId: string | null;
  designationName: string | null;
  payingEntityId: string | null;
  payingEntityName: string | null;
  annualCtc: number;
  tdsMonthly: number;
  ptExempt: boolean;
  probationEnd: string | null;
}

/**
 * Every active employee with their salary profile (if any) and the
 * designation / paying-entity names. Left-joined so employees without a
 * profile still appear, with annualCtc 0 / tdsMonthly 0 / ptExempt false.
 * Designation + paying-entity FKs live on `employees`.
 */
export async function listSalaryProfiles(): Promise<SalaryProfileRow[]> {
  const rows = await db
    .select({
      employeeId: employees.id,
      name: employees.name,
      email: employees.email,
      designationId: employees.designationId,
      designationName: designations.name,
      payingEntityId: employees.payingEntityId,
      payingEntityName: payingEntities.name,
      annualCtc: salaryProfiles.annualCtc,
      tdsMonthly: salaryProfiles.tdsMonthly,
      ptExempt: salaryProfiles.ptExempt,
      probationEnd: employees.probationEnd,
    })
    .from(employees)
    .leftJoin(salaryProfiles, eq(salaryProfiles.employeeId, employees.id))
    .leftJoin(designations, eq(employees.designationId, designations.id))
    .leftJoin(payingEntities, eq(employees.payingEntityId, payingEntities.id))
    .where(eq(employees.isActive, true))
    .orderBy(asc(employees.name));

  return rows.map((r) => ({
    employeeId: r.employeeId,
    name: r.name,
    email: r.email,
    designationId: r.designationId ?? null,
    designationName: r.designationName ?? null,
    payingEntityId: r.payingEntityId ?? null,
    payingEntityName: r.payingEntityName ?? null,
    annualCtc: r.annualCtc == null ? 0 : Number(r.annualCtc),
    tdsMonthly: r.tdsMonthly == null ? 0 : Number(r.tdsMonthly),
    ptExempt: r.ptExempt ?? false,
    probationEnd: toISODate(r.probationEnd),
  }));
}

export interface ProfileRow {
  id: string;
  employeeId: string;
  annualCtc: number;
  tdsMonthly: number;
  ptExempt: boolean;
}

/** A single employee's salary profile row, or null if none exists. */
export async function getProfile(employeeId: string): Promise<ProfileRow | null> {
  const [row] = await db
    .select({
      id: salaryProfiles.id,
      employeeId: salaryProfiles.employeeId,
      annualCtc: salaryProfiles.annualCtc,
      tdsMonthly: salaryProfiles.tdsMonthly,
      ptExempt: salaryProfiles.ptExempt,
    })
    .from(salaryProfiles)
    .where(eq(salaryProfiles.employeeId, employeeId))
    .limit(1);

  if (!row) return null;
  return {
    id: row.id,
    employeeId: row.employeeId,
    annualCtc: Number(row.annualCtc),
    tdsMonthly: Number(row.tdsMonthly),
    ptExempt: row.ptExempt,
  };
}

export interface SalaryRunRow {
  id: string;
  employeeId: string;
  employeeName: string;
  designationName: string | null;
  payingEntityName: string | null;
  fy: string;
  month: string;
  annualCtc: number;
  daysInMonth: number;
  payableDays: number;
  lateMarks: number;
  lateDeductionDays: number;
  gross: number;
  pt: number;
  tds: number;
  advances: number;
  pendingBalanceIn: number;
  netPayable: number;
  disbursed: boolean;
  disbursedAmount: number | null;
  source: string;
  createdAt: Date;
}

function mapRun(r: {
  id: string;
  employeeId: string;
  employeeName: string;
  designationName: string | null;
  payingEntityName: string | null;
  fy: string;
  month: string;
  annualCtc: string;
  daysInMonth: number;
  payableDays: string;
  lateMarks: number;
  lateDeductionDays: string;
  gross: string;
  pt: string;
  tds: string;
  advances: string;
  pendingBalanceIn: string;
  netPayable: string;
  disbursed: boolean;
  disbursedAmount: string | null;
  source: string;
  createdAt: Date;
}): SalaryRunRow {
  return {
    id: r.id,
    employeeId: r.employeeId,
    employeeName: r.employeeName,
    designationName: r.designationName ?? null,
    payingEntityName: r.payingEntityName ?? null,
    fy: r.fy,
    month: r.month,
    annualCtc: Number(r.annualCtc),
    daysInMonth: r.daysInMonth,
    payableDays: Number(r.payableDays),
    lateMarks: r.lateMarks,
    lateDeductionDays: Number(r.lateDeductionDays),
    gross: Number(r.gross),
    pt: Number(r.pt),
    tds: Number(r.tds),
    advances: Number(r.advances),
    pendingBalanceIn: Number(r.pendingBalanceIn),
    netPayable: Number(r.netPayable),
    disbursed: r.disbursed,
    disbursedAmount: r.disbursedAmount == null ? null : Number(r.disbursedAmount),
    source: r.source,
    createdAt: r.createdAt,
  };
}

const RUN_SELECT = {
  id: salaryRuns.id,
  employeeId: salaryRuns.employeeId,
  employeeName: employees.name,
  designationName: designations.name,
  payingEntityName: payingEntities.name,
  fy: salaryRuns.fy,
  month: salaryRuns.month,
  annualCtc: salaryRuns.annualCtc,
  daysInMonth: salaryRuns.daysInMonth,
  payableDays: salaryRuns.payableDays,
  lateMarks: salaryRuns.lateMarks,
  lateDeductionDays: salaryRuns.lateDeductionDays,
  gross: salaryRuns.gross,
  pt: salaryRuns.pt,
  tds: salaryRuns.tds,
  advances: salaryRuns.advances,
  pendingBalanceIn: salaryRuns.pendingBalanceIn,
  netPayable: salaryRuns.netPayable,
  disbursed: salaryRuns.disbursed,
  disbursedAmount: salaryRuns.disbursedAmount,
  source: salaryRuns.source,
  createdAt: salaryRuns.createdAt,
} as const;

/** All salary runs for a month, joined to employee/designation/entity names. */
export async function listRunsForMonth(month: string): Promise<SalaryRunRow[]> {
  const rows = await db
    .select(RUN_SELECT)
    .from(salaryRuns)
    .innerJoin(employees, eq(salaryRuns.employeeId, employees.id))
    .leftJoin(designations, eq(employees.designationId, designations.id))
    .leftJoin(payingEntities, eq(employees.payingEntityId, payingEntities.id))
    .where(eq(salaryRuns.month, month))
    .orderBy(asc(employees.name));

  return rows.map(mapRun);
}

/** A single salary run + employee/designation/entity, or null. */
export async function getRun(runId: string): Promise<SalaryRunRow | null> {
  const [row] = await db
    .select(RUN_SELECT)
    .from(salaryRuns)
    .innerJoin(employees, eq(salaryRuns.employeeId, employees.id))
    .leftJoin(designations, eq(employees.designationId, designations.id))
    .leftJoin(payingEntities, eq(employees.payingEntityId, payingEntities.id))
    .where(eq(salaryRuns.id, runId))
    .limit(1);

  return row ? mapRun(row) : null;
}

export interface SalaryAdvanceRow {
  id: string;
  employeeId: string;
  advanceDate: string | null;
  fy: string;
  month: string;
  amount: number;
  note: string | null;
  createdById: string | null;
  createdAt: Date;
}

/** Advance rows for one employee + month, newest first. */
export async function listAdvances(
  employeeId: string,
  month: string,
): Promise<SalaryAdvanceRow[]> {
  const rows = await db
    .select({
      id: salaryAdvances.id,
      employeeId: salaryAdvances.employeeId,
      advanceDate: salaryAdvances.advanceDate,
      fy: salaryAdvances.fy,
      month: salaryAdvances.month,
      amount: salaryAdvances.amount,
      note: salaryAdvances.note,
      createdById: salaryAdvances.createdById,
      createdAt: salaryAdvances.createdAt,
    })
    .from(salaryAdvances)
    .where(
      and(eq(salaryAdvances.employeeId, employeeId), eq(salaryAdvances.month, month)),
    )
    .orderBy(desc(salaryAdvances.createdAt));

  return rows.map((r) => ({
    id: r.id,
    employeeId: r.employeeId,
    advanceDate: toISODate(r.advanceDate),
    fy: r.fy,
    month: r.month,
    amount: Number(r.amount),
    note: r.note,
    createdById: r.createdById,
    createdAt: r.createdAt,
  }));
}

/** Total advances taken by an employee in a given month (0 if none). */
export async function sumAdvances(
  employeeId: string,
  month: string,
): Promise<number> {
  const [row] = await db
    .select({
      total: sql<string>`coalesce(sum(${salaryAdvances.amount}), 0)`,
    })
    .from(salaryAdvances)
    .where(
      and(eq(salaryAdvances.employeeId, employeeId), eq(salaryAdvances.month, month)),
    );

  return row ? Number(row.total) : 0;
}

/**
 * The unpaid remainder carried forward from this employee's most recent
 * disbursed run before `beforeMonth` (YYYY-MM string compare is chronological).
 * Returns max(0, net_payable − coalesce(disbursed_amount, net_payable)), or 0
 * if there is no prior disbursed run. This feeds next month's pendingBalanceIn.
 */
export async function lastDisbursedRemainder(
  employeeId: string,
  beforeMonth: string,
): Promise<number> {
  const [row] = await db
    .select({
      netPayable: salaryRuns.netPayable,
      disbursedAmount: salaryRuns.disbursedAmount,
    })
    .from(salaryRuns)
    .where(
      and(
        eq(salaryRuns.employeeId, employeeId),
        eq(salaryRuns.disbursed, true),
        lt(salaryRuns.month, beforeMonth),
      ),
    )
    .orderBy(desc(salaryRuns.month))
    .limit(1);

  if (!row) return 0;
  const net = Number(row.netPayable);
  const paid = row.disbursedAmount == null ? net : Number(row.disbursedAmount);
  return Math.max(0, net - paid);
}
