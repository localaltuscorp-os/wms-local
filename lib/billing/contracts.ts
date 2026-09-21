/**
 * BILLING CONTRACTS — the rules, with no database and no React.
 *
 * Imported by the Create Contract form (to warn as you type) AND by the server
 * core (to refuse the write), so the two can never disagree about what
 * "Total cannot exceed Contract Value" means. Everything here is pure and is
 * pinned by tests/unit/billing-contracts.test.ts.
 *
 * ALL AMOUNTS ARE PRE-GST. A contract value is the fee agreed; the tax invoice
 * a schedule row raises adds GST on top, exactly as the document engine does
 * for any other line. Comparing a tax-inclusive invoice total against a
 * tax-exclusive contract value would make every contract "exceeded" by 18%.
 */

import type {
  ContractBillingFrequency,
  ContractPaymentType,
  BillingDocStatus,
} from "@/db/enums";

export const CONTRACT_TOTAL_EXCEEDED = "Total cannot exceed Contract Value";

/** Money to 2dp, from whatever a form or a numeric column hands over. */
export function amt(v: string | number | null | undefined): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

/** Sum without float drift: 0.1 + 0.2 must be 0.30, not 0.30000000000000004. */
export function sumAmounts(values: (string | number | null | undefined)[]): number {
  return Math.round(values.reduce<number>((s, v) => s + Math.round(amt(v) * 100), 0)) / 100;
}

/** True when `v` is a well-formed, non-negative money string ("" counts as 0). */
export function isValidAmount(v: string): boolean {
  const t = v.replace(/,/g, "").trim();
  if (t === "") return true;
  return /^\d+(\.\d{1,2})?$/.test(t);
}

/* ─────────────────────────────── dates ─────────────────────────────────── */

/** ISO date + n calendar months, clamped to the month's last day (31 Jan + 1 = 28/29 Feb). */
export function addMonthsISO(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const targetMonth = m - 1 + months;
  const first = new Date(Date.UTC(y, targetMonth, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(d, lastDay));
  return first.toISOString().slice(0, 10);
}

export function periodMonths(freq: ContractBillingFrequency | null | undefined): number {
  return freq === "quarterly" ? 3 : 1;
}

/* ──────────────────────────── the schedule ─────────────────────────────── */

export interface PlanItem {
  amount: string | number;
  /** A stopped row that never raised a bill no longer counts toward the plan. */
  stopped?: boolean;
  /** A row that has a live (un-cancelled) invoice always counts, stopped or not. */
  billed?: boolean;
}

/** What the schedule commits the contract to. */
export function plannedTotal(items: PlanItem[]): number {
  return sumAmounts(items.filter((i) => !i.stopped || i.billed).map((i) => i.amount));
}

export interface ContractPlanInput {
  totalValue: string | number;
  paymentType: ContractPaymentType;
  startDate: string;
  endDate: string;
  billingDate: string;
  billingFrequency?: ContractBillingFrequency | null;
  retainerAmount?: string | number | null;
  items: (PlanItem & { description?: string | null; dueDate?: string | null })[];
  pdcs?: { amount: string | number }[];
}

export interface PlanIssue {
  field: string;
  message: string;
}

/**
 * Every rule a contract must satisfy before it is saved. Returned as a list so
 * the form can put each message beside its field; the server returns the first.
 */
export function validateContractPlan(c: ContractPlanInput): PlanIssue[] {
  const out: PlanIssue[] = [];
  const total = amt(c.totalValue);
  if (!(total > 0)) out.push({ field: "totalValue", message: "Enter the Total Contract Value" });
  if (c.startDate && c.endDate && c.endDate < c.startDate) {
    out.push({ field: "endDate", message: "End Date cannot be before Start Date" });
  }

  for (const [i, it] of c.items.entries()) {
    if (amt(it.amount) < 0 || (typeof it.amount === "string" && !isValidAmount(it.amount))) {
      out.push({ field: `items.${i}.amount`, message: `Row ${i + 1}: enter a valid Billing Amount` });
    }
  }

  switch (c.paymentType) {
    case "retainer": {
      if (!c.billingFrequency) {
        out.push({ field: "billingFrequency", message: "Choose Monthly or Quarterly billing" });
      }
      const per = amt(c.retainerAmount);
      const label = c.billingFrequency === "quarterly" ? "Quarterly" : "Monthly";
      if (!(per > 0)) {
        out.push({ field: "retainerAmount", message: `Enter the ${label} Billing Amount` });
      } else if (total > 0 && per > total) {
        out.push({ field: "retainerAmount", message: `${label} Billing Amount: ${CONTRACT_TOTAL_EXCEEDED}` });
      }
      break;
    }
    case "full_payment": {
      // None is fine — the server defaults it to the whole contract value.
      if (c.items.length > 1) {
        out.push({ field: "items", message: "A Full Payment contract has exactly one billing entry" });
      }
      break;
    }
    case "milestone":
    case "subscription": {
      const live = c.items.filter((i) => !i.stopped || i.billed);
      if (live.length === 0) {
        out.push({
          field: "items",
          message: c.paymentType === "milestone" ? "Add at least one milestone" : "Add at least one billing entry",
        });
      }
      break;
    }
  }

  if (c.paymentType !== "retainer") {
    for (const [i, it] of c.items.entries()) {
      const wellFormed = typeof it.amount !== "string" || isValidAmount(it.amount);
      if (!it.stopped && wellFormed && !(amt(it.amount) > 0)) {
        out.push({ field: `items.${i}.amount`, message: `Row ${i + 1}: enter the Billing Amount` });
      }
      if (c.paymentType === "subscription" && !it.dueDate) {
        out.push({ field: `items.${i}.dueDate`, message: `Row ${i + 1}: choose the Due Date` });
      }
    }
    if (total > 0 && plannedTotal(c.items) > total) {
      out.push({ field: "items", message: CONTRACT_TOTAL_EXCEEDED });
    }
  }

  for (const [i, p] of (c.pdcs ?? []).entries()) {
    const raw = p.amount;
    if (amt(raw) < 0 || (typeof raw === "string" && !isValidAmount(raw))) {
      out.push({ field: `pdcs.${i}.amount`, message: `PDC ${i + 1}: Amt must be a positive number` });
    }
  }
  return out;
}

/** The PDC Received summary — count and sum of the rows below it. */
export function pdcSummary(pdcs: { amount: string | number }[]): { count: number; amount: number } {
  return { count: pdcs.length, amount: sumAmounts(pdcs.map((p) => p.amount)) };
}

/** "1/3", "2/3" … — the subscription sequence label. */
export function sequenceLabel(index: number, count: number): string {
  return `${index + 1}/${count}`;
}

/* ───────────────────────────── completion ──────────────────────────────── */

/**
 * Active or completed — DERIVED, because the thing that decides it (an
 * invoice's status) can change in Documents without the contract being told.
 * Cancel the only bill of a completed contract and it is open again. Stopped
 * and cancelled are human decisions and are passed through untouched.
 */
export function deriveContractStatus<S extends string>(c: {
  status: S;
  paymentType: ContractPaymentType;
  totalValue: number;
  stopWhenComplete: boolean;
  rows: { live: boolean; stopped: boolean; amount: number }[];
}): S | "active" | "completed" {
  if (c.status !== "active" && c.status !== "completed") return c.status;
  const billed = sumAmounts(c.rows.filter((r) => r.live).map((r) => r.amount));
  const valueDone = billed >= c.totalValue;
  const scheduleDone =
    c.paymentType !== "retainer" && c.rows.some((r) => r.live) && c.rows.every((r) => r.live || r.stopped);
  return (valueDone && c.stopWhenComplete) || scheduleDone ? "completed" : "active";
}

/* ───────────────────────────── raise a bill ─────────────────────────────── */

/**
 * Whether one more bill of `amount` fits under the ceiling. `billedSoFar` is the
 * sum of rows that already have a live invoice.
 */
export function canBill(
  totalValue: number,
  billedSoFar: number,
  amount: number,
): { ok: true } | { ok: false; error: string } {
  if (!(amount > 0)) return { ok: false, error: "The Billing Amount must be greater than zero." };
  if (Math.round((billedSoFar + amount) * 100) > Math.round(totalValue * 100)) {
    return { ok: false, error: `${CONTRACT_TOTAL_EXCEEDED}. Remaining: ${(totalValue - billedSoFar).toFixed(2)}.` };
  }
  return { ok: true };
}

/**
 * The next retainer bill: the period amount, or whatever remains when that is
 * less (the last period is short rather than overshooting). Null when the
 * contract value is fully billed.
 */
export function nextRetainerAmount(totalValue: number, billedSoFar: number, perPeriod: number): number | null {
  const remaining = Math.round((totalValue - billedSoFar) * 100) / 100;
  if (remaining <= 0 || !(perPeriod > 0)) return null;
  return Math.min(perPeriod, remaining);
}

/**
 * The retainer periods not yet billed, projected forward from the billing date.
 * Stops at the contract value, and at the end date when there is one.
 */
export function projectRetainer(opts: {
  totalValue: number;
  billedSoFar: number;
  perPeriod: number;
  frequency: ContractBillingFrequency | null;
  billingDate: string;
  endDate: string | null;
  periodsBilled: number;
  max?: number;
}): { seq: number; dueDate: string; amount: number }[] {
  const out: { seq: number; dueDate: string; amount: number }[] = [];
  let billed = opts.billedSoFar;
  let seq = opts.periodsBilled + 1;
  const step = periodMonths(opts.frequency);
  const cap = opts.max ?? 120;
  while (out.length < cap) {
    const next = nextRetainerAmount(opts.totalValue, billed, opts.perPeriod);
    if (next === null) break;
    const dueDate = addMonthsISO(opts.billingDate, (seq - 1) * step);
    if (opts.endDate && dueDate > opts.endDate) break;
    out.push({ seq, dueDate, amount: next });
    billed = Math.round((billed + next) * 100) / 100;
    seq += 1;
  }
  return out;
}

/* ─────────────────────── Paid / Unpaid / Not Due ────────────────────────── */

export type BillBucket = "paid" | "unpaid" | "not_due";

/**
 * Which of the three columns of the All Contracts View a bill belongs to.
 *
 *   PAID     its invoice is marked paid in the document engine.
 *   UNPAID   raised and not yet paid, and its due date has arrived (or it has
 *            none) — or never raised although its due date has passed.
 *   NOT DUE  its due date is still ahead, raised or not; or a milestone with
 *            no date that has not been reached yet.
 *
 * Null for a row that is out of the count: stopped without a bill, or whose
 * only invoice was cancelled and has not been re-raised.
 */
export function billBucket(
  row: {
    itemStatus: "pending" | "billed" | "stopped";
    dueDate: string | null;
    document: { status: BillingDocStatus; dueDate: string | null } | null;
  },
  today: string,
): BillBucket | null {
  const doc = row.document && row.document.status !== "cancelled" ? row.document : null;
  if (doc) {
    if (doc.status === "paid") return "paid";
    const due = doc.dueDate ?? row.dueDate;
    return due && due > today ? "not_due" : "unpaid";
  }
  if (row.itemStatus === "stopped") return null;
  if (row.dueDate) return row.dueDate > today ? "not_due" : "unpaid";
  return "not_due";
}

export interface BucketTotals {
  paid: { count: number; amount: number };
  unpaid: { count: number; amount: number };
  notDue: { count: number; amount: number };
}

export function emptyBuckets(): BucketTotals {
  return {
    paid: { count: 0, amount: 0 },
    unpaid: { count: 0, amount: 0 },
    notDue: { count: 0, amount: 0 },
  };
}

export function addToBucket(t: BucketTotals, bucket: BillBucket | null, amount: number): void {
  if (!bucket) return;
  const b = bucket === "paid" ? t.paid : bucket === "unpaid" ? t.unpaid : t.notDue;
  b.count += 1;
  b.amount = Math.round((b.amount + amount) * 100) / 100;
}
