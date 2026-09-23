import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { moduleSubmissions } from "@/db/schema";

/**
 * REIMBURSEMENTS, FOR THE EARNINGS SLIP.
 *
 * The employee's Total Earnings document lists Salary → Attendance → Incentive
 * and then Retention; Reimbursement had no section at all, even though it is
 * money the same person is owed in the same month and the Accounts index
 * already places it directly under Incentive.
 *
 * ── WHY THIS READS `module_submissions` DIRECTLY ───────────────────────────
 * Reimbursement is not its own table. It is a module submission — a jsonb
 * `fields` payload (amount, expense date) plus an `adminFields` payload the
 * Accounts side fills in (`approved`, `payment_date`, `paid_through`). This
 * reader does NOT reinterpret either: it reads the same two payloads the
 * Reimbursements module renders, so a claim cannot read as approved on one
 * screen and pending on the other.
 *
 * "PAID" MEANS `payment_date`, the same field the Reimbursements module and the
 * Accounts dashboard treat as the money having moved. Nothing is derived from
 * the status column alone: a claim can be decided and still unpaid.
 */

export interface ReimbursementLine {
  id: string;
  /** "what was this spend for". */
  expenseFor: string;
  amount: number;
  /** "paid" when a payment date exists, else the decision state. */
  state: "paid" | "approved" | "pending" | "rejected";
  paidDate: string | null;
  expenseDate: string | null;
}

export interface ReimbursementEarnings {
  lines: ReimbursementLine[];
  /** Paid in the requested month — the figure that joins Total Earnings. */
  paidThisMonth: number;
  /** Approved (or decided) but not yet paid, whenever it was incurred. */
  awaitingPayment: number;
}

function amountOf(fields: Record<string, string>): number {
  const n = Number(String(fields.amount ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/**
 * The state of one claim. Exported because it is the whole of the rule, and the
 * rule is the point: PAID is `payment_date`, and approval alone is not payment.
 */
export function reimbursementStateOf(
  status: string,
  adminFields: Record<string, string>,
): ReimbursementLine["state"] {
  if (adminFields.payment_date) return "paid";
  if (adminFields.approved === "No" || status === "rejected") return "rejected";
  if (adminFields.approved === "Yes" || status === "approved") return "approved";
  return "pending";
}

/**
 * The employee's reimbursements for one month ("YYYY-MM"), split into the two
 * figures the slip needs.
 *
 * `month` matches the PAYMENT date for paid claims (that is when the money
 * joined the month's earnings) and the EXPENSE date for the unpaid ones, so an
 * old claim paid in this month shows up here rather than in the month it was
 * incurred — which is what "earnings for this month" means to the reader.
 */
export async function getReimbursementsForMonth(
  employeeId: string,
  month: string,
): Promise<ReimbursementEarnings> {
  const rows = await db
    .select({
      id: moduleSubmissions.id,
      fields: moduleSubmissions.fields,
      adminFields: moduleSubmissions.adminFields,
      status: moduleSubmissions.status,
      createdAt: moduleSubmissions.createdAt,
    })
    .from(moduleSubmissions)
    .where(
      and(
        eq(moduleSubmissions.module, "reimbursement"),
        eq(moduleSubmissions.employeeId, employeeId),
        eq(moduleSubmissions.archived, false),
      ),
    );

  const lines: ReimbursementLine[] = [];
  let paidThisMonth = 0;
  let awaitingPayment = 0;

  for (const r of rows) {
    const fields = r.fields ?? {};
    const admin = r.adminFields ?? {};
    const state = reimbursementStateOf(r.status, admin);
    const amount = amountOf(fields);
    const expenseDate = (fields.expense_date ?? "").slice(0, 10) || null;
    const paidDate = (admin.payment_date ?? "").slice(0, 10) || null;
    const relevant = paidDate ?? expenseDate ?? r.createdAt.toISOString().slice(0, 10);

    // Only this month's lines are listed: the slip is a month's document.
    if (!relevant.startsWith(month)) continue;

    lines.push({
      id: r.id,
      expenseFor: String(fields.expense_for ?? "").slice(0, 120) || "Expense",
      amount,
      state,
      paidDate,
      expenseDate,
    });

    if (state === "paid") paidThisMonth += amount;
    else if (state === "approved") awaitingPayment += amount;
  }

  lines.sort((a, b) => (b.paidDate ?? b.expenseDate ?? "").localeCompare(a.paidDate ?? a.expenseDate ?? ""));
  return {
    lines,
    paidThisMonth: Number(paidThisMonth.toFixed(2)),
    awaitingPayment: Number(awaitingPayment.toFixed(2)),
  };
}
