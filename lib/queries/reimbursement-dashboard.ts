import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, moduleSubmissions } from "@/db/schema";

/**
 * Reimbursement analytics — aggregated from the generic `module_submissions`
 * rows (module = "reimbursement"). Everything is derived from the request
 * `fields` jsonb (amount/expense_date/expense_for/product) and the admin
 * `adminFields` jsonb (approved Yes/No, payment_date, paid_through,
 * expense_head, tally_*), plus the row `status` (pending/approved/rejected).
 *
 * Money lives as a free-text jsonb value, so amounts may arrive as
 * "1,500", "₹1500", " 1500.50 ", "" or be absent. `parseAmount` strips
 * non-numeric noise and guards NaN — a row that can't be parsed contributes ₹0,
 * never breaks the rollup.
 *
 * Load note: this is an on-demand route query (force-dynamic page), NOT on the
 * dashboard/auth hot path. It runs one indexed scan over a module's rows.
 */

export interface KpiBlock {
  /** Total ₹ across the set. */
  amount: number;
  /** Row count in the set. */
  count: number;
}

export interface NamedAmount {
  name: string;
  amount: number;
  count: number;
}

export interface MonthPoint {
  /** YYYY-MM key. */
  key: string;
  /** Human label e.g. "Jun 2026". */
  label: string;
  /** Reimbursed (paid) ₹ that month. */
  paid: number;
  /** Submitted ₹ that month (by created date). */
  submitted: number;
}

export interface RecentRow {
  id: string;
  employeeName: string;
  expenseFor: string;
  amount: number;
  status: string;
  approved: boolean;
  paidThrough: string | null;
  expenseHead: string | null;
  createdAt: Date;
}

export interface ReimbursementDashboard {
  /** Whether the viewer sees the whole org or only their own rows. */
  scopeAll: boolean;
  /** All-time KPIs. */
  submitted: KpiBlock;
  approved: KpiBlock;
  pending: KpiBlock;
  paid: KpiBlock;
  rejected: KpiBlock;
  /** This-calendar-month KPIs (by created date). */
  monthSubmitted: KpiBlock;
  monthApproved: KpiBlock;
  monthPaid: KpiBlock;
  /** Breakdowns (descending by ₹). */
  byStatus: NamedAmount[];
  byPerson: NamedAmount[];
  byExpenseHead: NamedAmount[];
  byPaymentMethod: NamedAmount[];
  /** Month-over-month trend, oldest → newest, last 12 months present. */
  trend: MonthPoint[];
  recent: RecentRow[];
}

/** Coerce a free-text jsonb money value to a finite, non-negative number. */
function parseAmount(raw: string | undefined | null): number {
  if (raw == null) return 0;
  // Keep digits, dot and minus; drop ₹, commas, spaces, stray text.
  const cleaned = String(raw).replace(/[^0-9.-]/g, "");
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return 0;
  const n = Number.parseFloat(cleaned);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

/** Parse a date-ish jsonb value (YYYY-MM-DD or anything Date accepts). */
function parseDate(raw: string | undefined | null): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const MONTH_LABEL = new Intl.DateTimeFormat("en-IN", { month: "short", year: "numeric" });

function isApproved(status: string, approved: string | undefined): boolean {
  if (status === "approved") return true;
  return (approved ?? "").trim().toLowerCase() === "yes";
}

/** A row counts as PAID once an admin payment_date has been recorded. */
function isPaid(adminFields: Record<string, string>): boolean {
  return !!parseDate(adminFields.payment_date);
}

export async function getReimbursementDashboard(opts: {
  employeeId: string;
  isAdmin: boolean;
}): Promise<ReimbursementDashboard> {
  const rows = await db
    .select({
      id: moduleSubmissions.id,
      employeeName: employees.name,
      fields: moduleSubmissions.fields,
      adminFields: moduleSubmissions.adminFields,
      status: moduleSubmissions.status,
      createdAt: moduleSubmissions.createdAt,
    })
    .from(moduleSubmissions)
    .innerJoin(employees, eq(moduleSubmissions.employeeId, employees.id))
    .where(
      and(
        eq(moduleSubmissions.module, "reimbursement"),
        eq(moduleSubmissions.archived, false),
        opts.isAdmin ? undefined : eq(moduleSubmissions.employeeId, opts.employeeId),
      ),
    )
    .orderBy(desc(moduleSubmissions.createdAt));

  const now = new Date();
  const curKey = monthKey(now);

  const submitted: KpiBlock = { amount: 0, count: 0 };
  const approved: KpiBlock = { amount: 0, count: 0 };
  const pending: KpiBlock = { amount: 0, count: 0 };
  const paid: KpiBlock = { amount: 0, count: 0 };
  const rejected: KpiBlock = { amount: 0, count: 0 };
  const monthSubmitted: KpiBlock = { amount: 0, count: 0 };
  const monthApproved: KpiBlock = { amount: 0, count: 0 };
  const monthPaid: KpiBlock = { amount: 0, count: 0 };

  const statusAgg = new Map<string, NamedAmount>();
  const personAgg = new Map<string, NamedAmount>();
  const headAgg = new Map<string, NamedAmount>();
  const methodAgg = new Map<string, NamedAmount>();
  const trendAgg = new Map<string, MonthPoint>();
  const recent: RecentRow[] = [];

  const bump = (m: Map<string, NamedAmount>, name: string, amount: number) => {
    const cur = m.get(name) ?? { name, amount: 0, count: 0 };
    cur.amount += amount;
    cur.count += 1;
    m.set(name, cur);
  };

  for (const r of rows) {
    const fields = r.fields ?? {};
    const adminFields = r.adminFields ?? {};
    const amount = parseAmount(fields.amount);
    const created = r.createdAt;
    const createdKey = monthKey(created);
    const inCurMonth = createdKey === curKey;

    const approvedFlag = isApproved(r.status, adminFields.approved);
    const paidFlag = isPaid(adminFields);
    const isRejected = r.status === "rejected" || (adminFields.approved ?? "").trim().toLowerCase() === "no";
    const isPending = !approvedFlag && !isRejected;

    // All-time KPIs.
    submitted.amount += amount;
    submitted.count += 1;
    if (approvedFlag) {
      approved.amount += amount;
      approved.count += 1;
    }
    if (isPending) {
      pending.amount += amount;
      pending.count += 1;
    }
    if (isRejected) {
      rejected.amount += amount;
      rejected.count += 1;
    }
    if (paidFlag) {
      paid.amount += amount;
      paid.count += 1;
    }

    // This-month KPIs (by created date).
    if (inCurMonth) {
      monthSubmitted.amount += amount;
      monthSubmitted.count += 1;
      if (approvedFlag) {
        monthApproved.amount += amount;
        monthApproved.count += 1;
      }
      if (paidFlag) {
        monthPaid.amount += amount;
        monthPaid.count += 1;
      }
    }

    // Breakdowns.
    const statusLabel = isRejected ? "Rejected" : approvedFlag ? "Approved" : "Pending";
    bump(statusAgg, statusLabel, amount);
    bump(personAgg, r.employeeName || "Unknown", amount);
    bump(headAgg, (adminFields.expense_head || "").trim() || "Unassigned", amount);
    bump(methodAgg, (adminFields.paid_through || "").trim() || "Not set", amount);

    // Trend — reimbursed (paid) ₹ by payment month, submitted ₹ by created month.
    const addTrend = (key: string, date: Date, paidAmt: number, subAmt: number) => {
      const cur = trendAgg.get(key) ?? {
        key,
        label: MONTH_LABEL.format(date),
        paid: 0,
        submitted: 0,
      };
      cur.paid += paidAmt;
      cur.submitted += subAmt;
      trendAgg.set(key, cur);
    };
    addTrend(createdKey, created, 0, amount);
    if (paidFlag) {
      const payDate = parseDate(adminFields.payment_date) ?? created;
      addTrend(monthKey(payDate), payDate, amount, 0);
    }

    if (recent.length < 12) {
      recent.push({
        id: r.id,
        employeeName: r.employeeName || "Unknown",
        expenseFor: (fields.expense_for || "").trim() || "—",
        amount,
        status: r.status,
        approved: approvedFlag,
        paidThrough: (adminFields.paid_through || "").trim() || null,
        expenseHead: (adminFields.expense_head || "").trim() || null,
        createdAt: created,
      });
    }
  }

  const byAmountDesc = (a: NamedAmount, b: NamedAmount) => b.amount - a.amount;

  // Trend: keep the most recent 12 months, oldest → newest.
  const trend = [...trendAgg.values()].sort((a, b) => a.key.localeCompare(b.key)).slice(-12);

  return {
    scopeAll: opts.isAdmin,
    submitted,
    approved,
    pending,
    paid,
    rejected,
    monthSubmitted,
    monthApproved,
    monthPaid,
    byStatus: [...statusAgg.values()].sort(byAmountDesc),
    byPerson: [...personAgg.values()].sort(byAmountDesc),
    byExpenseHead: [...headAgg.values()].sort(byAmountDesc),
    byPaymentMethod: [...methodAgg.values()].sort(byAmountDesc),
    trend,
    recent,
  };
}
