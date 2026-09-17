import "server-only";
import { and, eq, gte, lt, or } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  designations,
  employees,
  incentiveEntries,
  payingEntities,
  salaryPayments,
} from "@/db/schema";
import { nameKey } from "@/lib/incentive/payout-sources";
import { fyForMonth, monthLabel } from "@/lib/salary/period";

/**
 * WS-6 — the Incentive Breakup document (salary-slip style), data layer.
 *
 * One employee + month → the list of their incentive entries with the approved
 * (due), paid, reversal and NET amounts. Reversal is read from the negative
 * `salary_payments` rows (`method='reversal'`) and, as a fallback for rows
 * reversed before the payments ledger existed, from the entry's `reversed`
 * flag. Nothing is recomputed here — it only aggregates the ledger + payments
 * already written by the payout/reversal actions.
 */

function num(v: string | number | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function nextMonthStart(month: string): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${ny}-${nm < 10 ? `0${nm}` : nm}-01`;
}

export interface IncentiveBreakupLine {
  incentiveName: string;
  /** Entry date when present, else the period month. */
  date: string | null;
  /** Approved (due) amount. */
  approved: number;
  /** Gross paid to the employee (pre-reversal). */
  paid: number;
  /** Reversal adjustment (≤ 0). */
  reversal: number;
  /** paid + reversal — what the employee actually receives. */
  net: number;
}

export interface IncentiveBreakup {
  employeeId: string;
  employeeName: string;
  designation: string | null;
  entity: string | null;
  month: string;
  monthLabel: string;
  fy: string;
  lines: IncentiveBreakupLine[];
  totals: { approved: number; paid: number; reversal: number; net: number };
}

/** Assemble the breakup for `employeeId` + `month` ('YYYY-MM'). */
export async function getIncentiveBreakup(
  employeeId: string,
  month: string,
): Promise<IncentiveBreakup> {
  const start = `${month}-01`;
  const end = nextMonthStart(month);

  const [emp] = await db
    .select({
      name: employees.name,
      designation: designations.name,
      entity: payingEntities.name,
    })
    .from(employees)
    .leftJoin(designations, eq(employees.designationId, designations.id))
    .leftJoin(payingEntities, eq(employees.payingEntityId, payingEntities.id))
    .where(eq(employees.id, employeeId))
    .limit(1);
  const name = emp?.name ?? "Employee";

  const [entries, payments] = await Promise.all([
    db
      .select()
      .from(incentiveEntries)
      .where(
        and(
          gte(incentiveEntries.periodMonth, start),
          lt(incentiveEntries.periodMonth, end),
          or(eq(incentiveEntries.employeeId, employeeId), eq(incentiveEntries.empName, name)),
        ),
      ),
    db
      .select()
      .from(salaryPayments)
      .where(
        and(
          eq(salaryPayments.kind, "incentive"),
          eq(salaryPayments.employeeId, employeeId),
          eq(salaryPayments.month, month),
        ),
      ),
  ]);

  // Negative reversal lines, keyed by their entry id.
  const reversalByEntry = new Map<string, number>();
  for (const p of payments) {
    if (p.method === "reversal" && p.incentiveEntryId) {
      reversalByEntry.set(p.incentiveEntryId, (reversalByEntry.get(p.incentiveEntryId) ?? 0) + num(p.amount));
    }
  }

  const lines: IncentiveBreakupLine[] = entries
    .map((e) => {
      const paid = num(e.paidAmt);
      const reversal = reversalByEntry.get(e.id) ?? (e.reversed ? -paid : 0);
      return {
        incentiveName: e.incentiveName,
        date: e.entryDate ?? e.periodMonth ?? null,
        approved: num(e.approvedAmt),
        paid,
        reversal,
        net: Math.round((paid + reversal) * 100) / 100,
      };
    })
    // Only rows with real money activity belong on a breakup.
    .filter((l) => l.approved > 0 || l.paid > 0 || l.reversal < 0);

  const totals = lines.reduce(
    (acc, l) => {
      acc.approved = Math.round((acc.approved + l.approved) * 100) / 100;
      acc.paid = Math.round((acc.paid + l.paid) * 100) / 100;
      acc.reversal = Math.round((acc.reversal + l.reversal) * 100) / 100;
      acc.net = Math.round((acc.net + l.net) * 100) / 100;
      return acc;
    },
    { approved: 0, paid: 0, reversal: 0, net: 0 },
  );

  return {
    employeeId,
    employeeName: name,
    designation: emp?.designation ?? null,
    entity: emp?.entity ?? "Altus Corp",
    month,
    monthLabel: monthLabel(month),
    fy: fyForMonth(month),
    lines,
    totals,
  };
}
