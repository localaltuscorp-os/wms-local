import "server-only";
import { loadMonthIncentiveSources } from "@/lib/incentive/payout";
import { aggregateByPerson, nameKey } from "@/lib/incentive/payout-sources";
import { nilView, round2 } from "@/lib/incentive/payout-math";
import { listRunsForMonth, type SalaryRunRow } from "@/lib/queries/salary";

/**
 * WS-6 — the "pay incentive from the same place as salary" board. For a month,
 * every person who has incentive activity is joined to their salary run (if one
 * exists), so the accountant sees — per person — Booked, Accrued, Amount Payable
 * (= Accrued, the default basis) and Amount Paid, and can pay the incentive
 * against that person's salary run.
 *
 * PAID here is read straight off the ledger rows (same fold the canonical PAID
 * producer uses); the payout action is the only writer.
 */

export interface IncentivePayoutRow {
  /** Person key — employeeId when known, else normalised name. */
  key: string;
  employeeId: string | null;
  name: string;
  designationName: string | null;
  payingEntityName: string | null;
  /** The salary run to pay the incentive against; null ⇒ generate a run first. */
  salaryRunId: string | null;
  /** Salary net payable for context (null when no run). */
  salaryNet: number | null;
  salaryDisbursed: boolean;
  booked: number;
  accrued: number;
  /** Amount Payable under the default (accrued) basis. */
  payable: number;
  /** Amount already paid to the employee. */
  paid: number;
  /** payable − paid; `≤ 0` ⇒ the account nils. */
  remainder: number;
  nils: boolean;
  sourceCount: number;
}

export interface IncentivePayoutBoard {
  month: string;
  rows: IncentivePayoutRow[];
  totals: {
    booked: number;
    accrued: number;
    payable: number;
    paid: number;
    remainder: number;
    /** How many rows still have a run to pay against and a positive remainder. */
    payableRows: number;
  };
}

/** Board for `month` (YYYY-MM): per-person incentive vs their salary run. */
export async function getIncentivePayoutBoard(month: string): Promise<IncentivePayoutBoard> {
  const [sources, runs] = await Promise.all([
    loadMonthIncentiveSources(month),
    listRunsForMonth(month),
  ]);

  // Index runs by BOTH employeeId and normalised name so an incentive person
  // (who may only carry a name) can still find their run.
  const runByEmp = new Map<string, SalaryRunRow>();
  const runByName = new Map<string, SalaryRunRow>();
  for (const r of runs) {
    runByEmp.set(r.employeeId, r);
    const k = nameKey(r.employeeName);
    if (k && !runByName.has(k)) runByName.set(k, r);
  }

  const rows: IncentivePayoutRow[] = aggregateByPerson(sources).map((a) => {
    const run =
      (a.employeeId ? runByEmp.get(a.employeeId) : undefined) ?? runByName.get(nameKey(a.name));
    const payable = round2(a.accrued);
    const paid = round2(a.paid);
    const view = nilView(payable, paid);
    return {
      key: a.key,
      employeeId: a.employeeId ?? run?.employeeId ?? null,
      name: a.name,
      designationName: run?.designationName ?? null,
      payingEntityName: run?.payingEntityName ?? null,
      salaryRunId: run?.id ?? null,
      salaryNet: run ? run.netPayable : null,
      salaryDisbursed: run?.disbursed ?? false,
      booked: round2(a.booked),
      accrued: round2(a.accrued),
      payable: view.payable,
      paid: view.paid,
      remainder: view.remainder,
      nils: view.nils,
      sourceCount: a.sourceCount,
    };
  });

  // Sort: unpaid remainder first (most work to do), then by payable desc.
  rows.sort((x, y) => y.remainder - x.remainder || y.payable - x.payable);

  const totals = rows.reduce(
    (acc, r) => {
      acc.booked = round2(acc.booked + r.booked);
      acc.accrued = round2(acc.accrued + r.accrued);
      acc.payable = round2(acc.payable + r.payable);
      acc.paid = round2(acc.paid + r.paid);
      acc.remainder = round2(acc.remainder + r.remainder);
      if (r.salaryRunId && r.remainder > 0) acc.payableRows += 1;
      return acc;
    },
    { booked: 0, accrued: 0, payable: 0, paid: 0, remainder: 0, payableRows: 0 },
  );

  return { month, rows, totals };
}
