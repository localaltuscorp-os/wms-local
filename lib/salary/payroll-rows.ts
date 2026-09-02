import "server-only";
import type { SalaryBreakup } from "@/db/schema";
import { waiveAddBack, netAfterWaiveOff } from "./waive-off";

/**
 * Flatten the salary-breakup sheet rows into a clean payroll export shape —
 * exactly the figures Sir needs to pay everyone. Same source as the on-screen
 * table (already deduped, ex-staff excluded), so the export always matches what
 * the page shows. `finalPayment` is the amount to disburse.
 */
export interface PayrollExportRow {
  sr: number;
  employee: string;
  designation: string;
  entity: string;
  daysInMonth: number;
  workingDays: number;
  monthlyCtc: number;
  payableAfterLeave: number;
  pt: number;
  payableAfterPt: number;
  advance: number;
  previousPending: number;
  /** Raw stored take-home BEFORE any wave-off (auditable base). */
  finalPayment: number;
  /** Condoned days Sir waived off, and the rupees they add back. */
  waiveOffDays: number;
  waiveAddBack: number;
  /** Signed pre-payout adjustment (+extra / −deduct), Sir #37. */
  payoutAdjustment: number;
  /** The EFFECTIVE amount to disburse = finalPayment + waiveAddBack + adjustment. */
  netPayable: number;
  salaryGiven: number | null;
  remarks: string;
}

const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

export function toPayrollRows(rows: SalaryBreakup[]): PayrollExportRow[] {
  return rows.map((r, i) => ({
    sr: r.srNo ?? i + 1,
    employee: r.employeeName,
    designation: r.designation ?? "",
    entity: r.companyName ?? "",
    daysInMonth: num(r.daysInMonth),
    workingDays: num(r.finalWorkingDays),
    monthlyCtc: num(r.monthlyCtc),
    payableAfterLeave: num(r.payableAfterLeave),
    pt: num(r.pt),
    payableAfterPt: num(r.payableAfterPt),
    advance: num(r.advance),
    previousPending: num(r.previousPending),
    finalPayment: num(r.finalPayment),
    waiveOffDays: num(r.waiveOffDays),
    waiveAddBack: Math.round(waiveAddBack(r)),
    payoutAdjustment: Math.round(num(r.payoutAdjustment)),
    netPayable: Math.round(netAfterWaiveOff(r)),
    salaryGiven: r.salaryGiven == null ? null : num(r.salaryGiven),
    // Super-admin note (admin_note), NOT the imported joining-date remarks.
    remarks: r.adminNote ?? "",
  }));
}

/** Per-company (paying-from entity) rollup for the export breakdown sections. */
export interface CompanySubtotal {
  entity: string;
  headcount: number;
  payableAfterLeave: number;
  pt: number;
  payableAfterPt: number;
  advance: number;
  previousPending: number;
  finalPayment: number;
  /** Sum of the effective net (incl. wave-off) — the actual disbursement. */
  netPayable: number;
}

/** Aggregate payroll rows by paying-from entity, biggest net payable first. */
export function toCompanySubtotals(rows: PayrollExportRow[]): CompanySubtotal[] {
  const map = new Map<string, CompanySubtotal>();
  for (const r of rows) {
    const entity = r.entity?.trim() || "Unassigned";
    const e =
      map.get(entity) ?? {
        entity,
        headcount: 0,
        payableAfterLeave: 0,
        pt: 0,
        payableAfterPt: 0,
        advance: 0,
        previousPending: 0,
        finalPayment: 0,
        netPayable: 0,
      };
    e.headcount += 1;
    e.payableAfterLeave += r.payableAfterLeave;
    e.pt += r.pt;
    e.payableAfterPt += r.payableAfterPt;
    e.advance += r.advance;
    e.previousPending += r.previousPending;
    e.finalPayment += r.finalPayment;
    e.netPayable += r.netPayable;
    map.set(entity, e);
  }
  return [...map.values()].sort((a, b) => b.netPayable - a.netPayable);
}

/** Column definitions shared by CSV + PDF (order = display order). */
export const PAYROLL_COLUMNS: {
  key: keyof PayrollExportRow;
  label: string;
  money?: boolean;
  num?: boolean;
}[] = [
  { key: "sr", label: "Sr", num: true },
  { key: "employee", label: "Employee" },
  { key: "designation", label: "Designation" },
  { key: "entity", label: "Entity" },
  { key: "daysInMonth", label: "Days in Month", num: true },
  { key: "workingDays", label: "Working Days", num: true },
  { key: "monthlyCtc", label: "Monthly CTC", money: true },
  { key: "payableAfterLeave", label: "Payable", money: true },
  { key: "pt", label: "PT", money: true },
  { key: "payableAfterPt", label: "After PT", money: true },
  { key: "advance", label: "Advance", money: true },
  { key: "previousPending", label: "Prev. Pending", money: true },
  { key: "finalPayment", label: "Final Payment", money: true },
  { key: "waiveOffDays", label: "Wave-Off (days)", num: true },
  { key: "waiveAddBack", label: "Wave-Off (₹)", money: true },
  { key: "payoutAdjustment", label: "Adjustment (₹)", money: true },
  { key: "netPayable", label: "Net Payable", money: true },
  { key: "salaryGiven", label: "Salary Given", money: true },
  { key: "remarks", label: "Remarks" },
];
