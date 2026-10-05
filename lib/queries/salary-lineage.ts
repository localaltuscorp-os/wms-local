import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";
import {
  employeeEvents,
  hrAssets,
  salaryCtcBreakup,
  salaryPayments,
  salaryRuns,
  salaryBreakup,
} from "@/db/schema";
import { db } from "@/lib/db";
import { getReimbursementsForMonth } from "@/lib/salary/reimbursement-earnings";
import { listAdvances, listSalaryProfiles } from "@/lib/queries/salary";
import { listSalaryBreakup } from "@/lib/queries/salary-breakup";

export interface SalaryLineageData {
  employee: { id: string; name: string; email: string };
  month: string;
  profile: ReturnType<typeof profileShape>;
  ctcBreakup: { annualCtc: number; components: Array<{ label: string; annual: number }>; updatedAt: string } | null;
  run: {
    id: string;
    month: string;
    annualCtc: number;
    monthlySalary: number | null;
    perDaySalary: number | null;
    workingHoursPerDay: number | null;
    payableDays: number;
    gross: number;
    pt: number;
    tds: number;
    advances: number;
    pendingBalanceIn: number;
    netPayable: number;
    payType: string;
    workedHours: number | null;
    targetHours: number | null;
    hourlyRate: number | null;
    overtimeHours: number;
    overtimeAmount: number;
    disbursed: boolean;
    disbursedAmount: number | null;
    source: string;
    createdAt: string;
  } | null;
  breakup: {
    id: string;
    monthlyCtc: number;
    payableAfterLeave: number;
    pt: number;
    payableAfterPt: number;
    advance: number;
    previousPending: number;
    finalPayment: number;
    waiveOffDays: number;
    waiveOffNote: string | null;
    payoutAdjustment: number;
    payoutAdjustmentNote: string | null;
    salaryGiven: number | null;
    amountPaid: number;
    paid: boolean;
  } | null;
  advances: Array<{ id: string; amount: number; advanceDate: string | null; note: string | null }>;
  payments: Array<{ id: string; amount: number; paidDate: string | null; method: string | null; note: string | null; kind: string }>;
  reimbursements: Awaited<ReturnType<typeof getReimbursementsForMonth>>;
  assets: Array<{ id: string; assetCode: string; assetName: string; assetType: string }>;
  audit: Array<{ eventType: string; fromValue: unknown; toValue: unknown; note: string | null; createdAt: string }>;
}

export async function salaryLineageMonths(): Promise<string[]> {
  const [runs, breakup] = await Promise.all([
    db.select({ month: salaryRuns.month }).from(salaryRuns),
    db.select({ month: sql<string>`to_char(${salaryBreakup.month}, 'YYYY-MM')` }).from(salaryBreakup),
  ]);
  return [...new Set([...runs, ...breakup].map((row) => row.month))].sort((a, b) => b.localeCompare(a));
}

function num(value: string | number | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function dateText(value: Date | string | null | undefined): string {
  return value instanceof Date ? value.toISOString() : value ?? "";
}

function profileShape(p: Awaited<ReturnType<typeof listSalaryProfiles>>[number] | null) {
  return p
    ? {
        annualCtc: p.annualCtc,
        monthlyCtc: Number((p.annualCtc / 12).toFixed(2)),
        tdsMonthly: p.tdsMonthly,
        ptExempt: p.ptExempt,
        workerType: p.workerType,
        payType: p.workerType,
        monthlyPayAtTarget: p.monthlyPayAtTarget,
        weeklyTargetHours: p.weeklyTargetHours,
        monthlyFee: p.monthlyFee,
      }
    : null;
}

/** Read-only view of existing salary sources. No values are recalculated here. */
export async function getSalaryLineage(employeeId: string, month: string): Promise<SalaryLineageData | null> {
  const profiles = await listSalaryProfiles();
  const profile = profiles.find((row) => row.employeeId === employeeId);
  if (!profile) return null;

  const [ctcRows, runRows, breakupRows, advances, payments, assets, audit, reimbursements] = await Promise.all([
    db.select().from(salaryCtcBreakup).where(eq(salaryCtcBreakup.employeeId, employeeId)).limit(1),
    db.select().from(salaryRuns).where(and(eq(salaryRuns.employeeId, employeeId), eq(salaryRuns.month, month))).limit(1),
    listSalaryBreakup(month),
    listAdvances(employeeId, month),
    db.select({ id: salaryPayments.id, amount: salaryPayments.amount, paidDate: salaryPayments.paidDate, method: salaryPayments.method, note: salaryPayments.note, kind: salaryPayments.kind })
      .from(salaryPayments).where(and(eq(salaryPayments.employeeId, employeeId), eq(salaryPayments.month, month))).orderBy(desc(salaryPayments.createdAt)),
    db.select({ id: hrAssets.id, assetCode: hrAssets.assetCode, assetName: hrAssets.assetName, assetType: hrAssets.assetType })
      .from(hrAssets).where(eq(hrAssets.issuedEmployeeId, employeeId)).orderBy(desc(hrAssets.createdAt)),
    db.select({ eventType: employeeEvents.eventType, fromValue: employeeEvents.fromValue, toValue: employeeEvents.toValue, note: employeeEvents.note, createdAt: employeeEvents.createdAt })
      .from(employeeEvents).where(and(eq(employeeEvents.employeeId, employeeId), eq(employeeEvents.eventType, "salary_profile_set"))).orderBy(desc(employeeEvents.createdAt)).limit(20),
    getReimbursementsForMonth(employeeId, month),
  ]);

  const run = runRows[0];
  const sheet = breakupRows.find((row) => row.employeeId === employeeId);
  const ctc = ctcRows[0];

  return {
    employee: { id: profile.employeeId, name: profile.name, email: profile.email },
    month,
    profile: profileShape(profile),
    ctcBreakup: ctc ? {
      annualCtc: num(ctc.annualCtc),
      components: Array.isArray(ctc.components) ? ctc.components.map((item) => {
        const row = item as { label?: unknown; annual?: unknown };
        return { label: String(row.label ?? "Component"), annual: num(row.annual) };
      }) : [],
      updatedAt: dateText(ctc.updatedAt),
    } : null,
    run: run ? {
      id: run.id, month: run.month, annualCtc: num(run.annualCtc), monthlySalary: run.monthlySalary == null ? null : num(run.monthlySalary), perDaySalary: run.perDaySalary == null ? null : num(run.perDaySalary), workingHoursPerDay: run.workingHoursPerDay == null ? null : num(run.workingHoursPerDay), payableDays: num(run.payableDays), gross: num(run.gross), pt: num(run.pt), tds: num(run.tds), advances: num(run.advances), pendingBalanceIn: num(run.pendingBalanceIn), netPayable: num(run.netPayable), payType: run.payType, workedHours: run.workedHours == null ? null : num(run.workedHours), targetHours: run.targetHours == null ? null : num(run.targetHours), hourlyRate: run.hourlyRate == null ? null : num(run.hourlyRate), overtimeHours: num(run.overtimeHours), overtimeAmount: num(run.overtimeAmount), disbursed: run.disbursed, disbursedAmount: run.disbursedAmount == null ? null : num(run.disbursedAmount), source: run.source, createdAt: dateText(run.createdAt),
    } : null,
    breakup: sheet ? { id: sheet.id, monthlyCtc: num(sheet.monthlyCtc), payableAfterLeave: num(sheet.payableAfterLeave), pt: num(sheet.pt), payableAfterPt: num(sheet.payableAfterPt), advance: num(sheet.advance), previousPending: num(sheet.previousPending), finalPayment: num(sheet.finalPayment), waiveOffDays: num(sheet.waiveOffDays), waiveOffNote: sheet.waiveOffNote, payoutAdjustment: num(sheet.payoutAdjustment), payoutAdjustmentNote: sheet.payoutAdjustmentNote, salaryGiven: sheet.salaryGiven == null ? null : num(sheet.salaryGiven), amountPaid: num(sheet.amountPaid), paid: sheet.paid } : null,
    advances: advances.map((row) => ({ id: row.id, amount: row.amount, advanceDate: row.advanceDate, note: row.note })),
    payments: payments.map((row) => ({ ...row, amount: num(row.amount), paidDate: row.paidDate ? dateText(row.paidDate) : null })),
    reimbursements,
    assets,
    audit: audit.map((row) => ({ ...row, createdAt: dateText(row.createdAt) })),
  };
}
