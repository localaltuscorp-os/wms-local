import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, incentiveEntries, salaryPayments } from "@/db/schema";
import { nameKey } from "@/lib/incentive/payout-sources";

/**
 * WS-6 — the incentive PAYMENT LEDGER read path (Accounts).
 *
 * `salary_payments` has been write-only since migration 0115; this is its first
 * reader. It returns the raw incentive payment lines — the positive payout rows
 * (method='with_salary') AND the negative reversal rows (method='reversal') —
 * so a reversal shows up as a negative adjustment that offsets the employee's
 * payable, without re-deriving any money here (the payout action remains the
 * only writer).
 */

function num(v: string | number | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export interface IncentivePaymentLine {
  id: string;
  employeeId: string | null;
  employeeName: string | null;
  incentiveName: string | null;
  /** Signed — positive for payouts, negative for reversals. */
  amount: number;
  paidDate: string | null;
  method: string | null;
  note: string | null;
  month: string | null;
}

export interface IncentivePaymentSummary {
  employeeId: string | null;
  employeeName: string;
  /** Σ positive payout lines. */
  grossPaid: number;
  /** Σ negative reversal lines (≤ 0). */
  reversal: number;
  /** grossPaid + reversal — what the employee has actually been paid net. */
  netPaid: number;
  lineCount: number;
}

export interface IncentivePaymentLedger {
  month: string | null;
  lines: IncentivePaymentLine[];
  byEmployee: IncentivePaymentSummary[];
  totals: { grossPaid: number; reversal: number; netPaid: number };
}

/** Incentive payment lines for a month ('YYYY-MM'), or all when omitted. */
export async function getIncentivePaymentLedger(month?: string): Promise<IncentivePaymentLedger> {
  const rows = await db
    .select({
      id: salaryPayments.id,
      employeeId: salaryPayments.employeeId,
      employeeName: employees.name,
      incentiveName: incentiveEntries.incentiveName,
      amount: salaryPayments.amount,
      paidDate: salaryPayments.paidDate,
      method: salaryPayments.method,
      note: salaryPayments.note,
      month: salaryPayments.month,
    })
    .from(salaryPayments)
    .leftJoin(employees, eq(salaryPayments.employeeId, employees.id))
    .leftJoin(incentiveEntries, eq(salaryPayments.incentiveEntryId, incentiveEntries.id))
    .where(
      and(
        eq(salaryPayments.kind, "incentive"),
        month ? eq(salaryPayments.month, month) : undefined,
      ),
    )
    .orderBy(asc(salaryPayments.paidDate), asc(salaryPayments.createdAt));

  const lines: IncentivePaymentLine[] = rows.map((r) => ({
    id: r.id,
    employeeId: r.employeeId,
    employeeName: r.employeeName,
    incentiveName: r.incentiveName,
    amount: num(r.amount),
    paidDate: r.paidDate,
    method: r.method,
    note: r.note,
    month: r.month,
  }));

  // Aggregate per employee (keyed by employeeId, else normalised name).
  const map = new Map<string, IncentivePaymentSummary>();
  for (const l of lines) {
    const key = l.employeeId ?? nameKey(l.employeeName);
    if (!key) continue;
    let s = map.get(key);
    if (!s) {
      s = {
        employeeId: l.employeeId,
        employeeName: l.employeeName ?? "Unknown",
        grossPaid: 0,
        reversal: 0,
        netPaid: 0,
        lineCount: 0,
      };
      map.set(key, s);
    }
    if (!s.employeeId && l.employeeId) s.employeeId = l.employeeId;
    if (s.employeeName === "Unknown" && l.employeeName) s.employeeName = l.employeeName;
    if (l.amount >= 0) s.grossPaid += l.amount;
    else s.reversal += l.amount;
    s.netPaid += l.amount;
    s.lineCount += 1;
  }

  const byEmployee = [...map.values()].sort((a, b) => a.employeeName.localeCompare(b.employeeName));
  const totals = byEmployee.reduce(
    (acc, s) => {
      acc.grossPaid += s.grossPaid;
      acc.reversal += s.reversal;
      acc.netPaid += s.netPaid;
      return acc;
    },
    { grossPaid: 0, reversal: 0, netPaid: 0 },
  );
  // Round paise dust off the sums.
  totals.grossPaid = Math.round(totals.grossPaid * 100) / 100;
  totals.reversal = Math.round(totals.reversal * 100) / 100;
  totals.netPaid = Math.round(totals.netPaid * 100) / 100;

  return { month: month ?? null, lines, byEmployee, totals };
}
