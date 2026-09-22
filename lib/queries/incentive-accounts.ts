import "server-only";
import { and, desc, eq, gte, inArray, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { incentiveEntries, salaryPayments } from "@/db/schema";
import type { AnalyticsScope } from "@/lib/incentive/analytics/model";

/**
 * ACCOUNTS — the employee incentive PAYABLE ledger, scoped to the viewer.
 *
 * Why this file exists: `salary_payments` carries the money (the payout rows the
 * salary run writes, and the negative rows the reversal action writes) while
 * `incentive_entries` carries what was approved and what the employee has been
 * paid against. Neither alone answers the accountant's question — "what does
 * this person still owe / get?" — because a reversal is a row in the first table
 * against an entry in the second. This composes them per entry and derives the
 * final payable. It re-derives no money that the payout or reversal actions
 * already decided; it only adds up what they wrote.
 *
 * ── THE PAYABLE RULE ──────────────────────────────────────────────────────────
 *   unpaid        = due − paid          (what is still owed on the entry)
 *   finalPayable  = unpaid + reversal   (reversal is ≤ 0)
 *
 * A reversal therefore offsets the payable and can push it negative — which is
 * the point: money already disbursed and then reversed is money to recover, so
 * the last column tells the accountant to claw back rather than to pay.
 *
 * ── SCOPE ─────────────────────────────────────────────────────────────────────
 * Filtering happens HERE, in the SQL, from the server-resolved scope — never in
 * the component. `all` covers everybody (admin / super-admin / reviewer); every
 * other viewer is narrowed to their own id plus their transitive downline. An
 * entry with no `employee_id` cannot be attributed to anyone, so a narrowed
 * viewer never sees it: the failure direction is "show less", never more.
 */
export interface IncentiveAccountsRow {
  entryId: string;
  employeeId: string | null;
  employeeName: string;
  incentiveName: string;
  entryDate: string | null;
  periodMonth: string | null;
  /** Approved amount on the ledger row — what the incentive is worth. */
  due: number;
  /** What the employee has actually been paid for this entry. */
  paid: number;
  /** due − paid. */
  unpaid: number;
  /** Σ negative `salary_payments` rows for this entry (≤ 0). */
  reversal: number;
  /** unpaid + reversal. Negative means "recover this much". */
  finalPayable: number;
  status: IncentiveAccountsStatus;
  paidDate: string | null;
}

export type IncentiveAccountsStatus = "paid" | "part_paid" | "unpaid" | "reversed";

export interface IncentiveAccountsLedger {
  rows: IncentiveAccountsRow[];
  totals: {
    due: number;
    paid: number;
    unpaid: number;
    reversal: number;
    finalPayable: number;
    rows: number;
  };
  /** Employees represented, for the section's headcount line. */
  people: number;
}

function num(v: string | number | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Round paise dust off a derived figure. */
function money(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * The payment state of one entry. A reversal outranks the paid/unpaid split:
 * the money moved and then came back, which is a different fact from "unpaid".
 */
function statusOf(due: number, paid: number, reversal: number): IncentiveAccountsStatus {
  if (reversal < 0) return "reversed";
  if (due > 0 && paid >= due) return "paid";
  if (paid > 0) return "part_paid";
  return "unpaid";
}

/**
 * THE PAYABLE RULE, on its own so it can be pinned by a test without a database.
 *
 *   unpaid       = due − paid
 *   finalPayable = unpaid + reversal      (reversal ≤ 0)
 *
 * Covered states: unpaid (0 paid), partially paid, fully paid, and reversed at
 * any of those. A reversal therefore offsets the payable and may push the final
 * figure NEGATIVE — money already disbursed and then reversed is money to
 * recover, and a negative last column is how the accountant is told so.
 */
export function deriveIncentivePayable(
  due: number,
  paid: number,
  reversal: number,
): {
  due: number;
  paid: number;
  unpaid: number;
  reversal: number;
  finalPayable: number;
  status: IncentiveAccountsStatus;
} {
  const d = money(due);
  const p = money(paid);
  const r = money(Math.min(0, reversal));
  const unpaid = money(d - p);
  return {
    due: d,
    paid: p,
    unpaid,
    reversal: r,
    finalPayable: money(unpaid + r),
    status: statusOf(d, p, r),
  };
}

/** Ledger entries + their reversal rows for the viewer's scope. */
export async function getIncentiveAccountsLedger(
  scope: AnalyticsScope,
  opts: { year?: number } = {},
): Promise<IncentiveAccountsLedger> {
  // `all` → no employee predicate at all. Otherwise an empty set must match
  // NOTHING rather than everything, which `inArray` with [] would not give us,
  // so guard it explicitly.
  if (!scope.all && scope.employeeIds.size === 0) {
    return { rows: [], totals: zeroTotals(), people: 0 };
  }
  const scopeWhere = scope.all
    ? undefined
    : inArray(incentiveEntries.employeeId, [...scope.employeeIds]);

  const yearWhere =
    opts.year != null
      ? and(
          gte(incentiveEntries.periodMonth, `${opts.year}-01-01`),
          lt(incentiveEntries.periodMonth, `${opts.year + 1}-01-01`),
        )
      : undefined;

  const entries = await db
    .select({
      id: incentiveEntries.id,
      employeeId: incentiveEntries.employeeId,
      empName: incentiveEntries.empName,
      incentiveName: incentiveEntries.incentiveName,
      entryDate: incentiveEntries.entryDate,
      periodMonth: incentiveEntries.periodMonth,
      approvedAmt: incentiveEntries.approvedAmt,
      paidAmt: incentiveEntries.paidAmt,
      paidDate: incentiveEntries.paidDate,
    })
    .from(incentiveEntries)
    .where(and(scopeWhere, yearWhere))
    .orderBy(desc(incentiveEntries.periodMonth), desc(incentiveEntries.srcSrNo));

  if (entries.length === 0) {
    return { rows: [], totals: zeroTotals(), people: 0 };
  }

  // The reversal rows for exactly these entries — one query, not one per row.
  const reversals = await db
    .select({
      entryId: salaryPayments.incentiveEntryId,
      amount: salaryPayments.amount,
    })
    .from(salaryPayments)
    .where(
      and(
        eq(salaryPayments.kind, "incentive"),
        inArray(
          salaryPayments.incentiveEntryId,
          entries.map((e) => e.id),
        ),
      ),
    );

  const reversalByEntry = new Map<string, number>();
  for (const r of reversals) {
    if (!r.entryId) continue;
    const amount = num(r.amount);
    // Only the negative rows are the adjustment; the positive rows on the same
    // entry id are the payouts, which are already `paid_amt` on the entry.
    if (amount >= 0) continue;
    reversalByEntry.set(r.entryId, money((reversalByEntry.get(r.entryId) ?? 0) + amount));
  }

  const rows: IncentiveAccountsRow[] = entries.map((e) => {
    const money_ = deriveIncentivePayable(
      num(e.approvedAmt),
      num(e.paidAmt),
      reversalByEntry.get(e.id) ?? 0,
    );
    return {
      entryId: e.id,
      employeeId: e.employeeId,
      employeeName: e.empName,
      incentiveName: e.incentiveName,
      entryDate: e.entryDate,
      periodMonth: e.periodMonth,
      paidDate: e.paidDate,
      ...money_,
    };
  });

  const totals = rows.reduce(
    (acc, r) => {
      acc.due += r.due;
      acc.paid += r.paid;
      acc.unpaid += r.unpaid;
      acc.reversal += r.reversal;
      acc.finalPayable += r.finalPayable;
      return acc;
    },
    zeroTotals(),
  );
  totals.due = money(totals.due);
  totals.paid = money(totals.paid);
  totals.unpaid = money(totals.unpaid);
  totals.reversal = money(totals.reversal);
  totals.finalPayable = money(totals.finalPayable);
  totals.rows = rows.length;

  const people = new Set(
    rows.map((r) => r.employeeId ?? `name:${r.employeeName.trim().toLowerCase()}`),
  ).size;

  return { rows, totals, people };
}

function zeroTotals(): IncentiveAccountsLedger["totals"] {
  return { due: 0, paid: 0, unpaid: 0, reversal: 0, finalPayable: 0, rows: 0 };
}
