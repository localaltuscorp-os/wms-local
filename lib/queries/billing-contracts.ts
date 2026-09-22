import "server-only";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  billingContractItems,
  billingContractPdcs,
  billingContracts,
  billingDocuments,
  type BillingContract,
  type BillingContractPdc,
} from "@/db/schema";
import type { BillingDocStatus, ContractItemStatus } from "@/db/enums";
import { DOCUMENTS_BUCKET } from "@/lib/supabase/admin";
import { createSignedObjectUrl } from "@/lib/storage/objects";
import { todayISO } from "@/lib/billing/numbering";
import {
  addToBucket,
  amt,
  deriveContractStatus,
  billBucket,
  emptyBuckets,
  pdcSummary,
  projectRetainer,
  sumAmounts,
  type BillBucket,
  type BucketTotals,
} from "@/lib/billing/contracts";

/**
 * BILLING CONTRACTS — the read side.
 *
 * Paid / Unpaid / Not Due are computed here from the LIVE invoice rows the
 * schedule points at (see `billBucket`), so marking an invoice paid in
 * Documents moves it on the Contracts view with nothing else to update.
 * Batched: a list page issues three queries however many contracts it shows.
 */

export interface ContractScheduleRow {
  id: string;
  seq: number;
  dueDate: string | null;
  description: string | null;
  amount: number;
  status: ContractItemStatus;
  bucket: BillBucket | null;
  /** True when a bill is raised and its invoice is not cancelled. */
  live: boolean;
  document: {
    id: string;
    docNo: string | null;
    status: BillingDocStatus;
    dueDate: string | null;
    total: number;
  } | null;
  /** A retainer period that has not been raised yet — shown, not stored. */
  projected?: boolean;
}

export interface ContractSummary {
  id: string;
  entityId: string;
  customerId: string;
  customerName: string;
  totalValue: number;
  startDate: string;
  endDate: string;
  billingDate: string;
  paymentType: BillingContract["paymentType"];
  billingFrequency: BillingContract["billingFrequency"];
  retainerAmount: number | null;
  status: BillingContract["status"];
  billedAmount: number;
  remainingAmount: number;
  buckets: BucketTotals;
  pdc: { count: number; amount: number };
  hasAttachment: boolean;
  createdAt: Date;
}

type ItemJoin = {
  item: typeof billingContractItems.$inferSelect;
  docId: string | null;
  docNo: string | null;
  docStatus: BillingDocStatus | null;
  docDueDate: string | null;
  docTotal: string | null;
};

async function loadItems(contractIds: string[]): Promise<ItemJoin[]> {
  if (contractIds.length === 0) return [];
  return db
    .select({
      item: billingContractItems,
      docId: billingDocuments.id,
      docNo: billingDocuments.docNo,
      docStatus: billingDocuments.status,
      docDueDate: billingDocuments.dueDate,
      docTotal: billingDocuments.total,
    })
    .from(billingContractItems)
    .leftJoin(billingDocuments, eq(billingDocuments.id, billingContractItems.documentId))
    .where(inArray(billingContractItems.contractId, contractIds))
    .orderBy(asc(billingContractItems.seq));
}

function toScheduleRow(r: ItemJoin, today: string): ContractScheduleRow {
  const document =
    r.docId && r.docStatus
      ? { id: r.docId, docNo: r.docNo, status: r.docStatus, dueDate: r.docDueDate, total: amt(r.docTotal) }
      : null;
  const live = r.item.status === "billed" && document?.status !== "cancelled";
  return {
    id: r.item.id,
    seq: r.item.seq,
    dueDate: r.item.dueDate,
    description: r.item.description,
    amount: amt(r.item.amount),
    status: r.item.status,
    live,
    document,
    bucket: billBucket(
      {
        itemStatus: r.item.status,
        dueDate: r.item.dueDate,
        document: document ? { status: document.status, dueDate: document.dueDate } : null,
      },
      today,
    ),
  };
}

/** The retainer periods still to come, as not-yet-raised rows. */
function retainerProjection(c: BillingContract, rows: ContractScheduleRow[]): ContractScheduleRow[] {
  if (c.paymentType !== "retainer" || c.status !== "active") return [];
  const billed = sumAmounts(rows.filter((r) => r.live).map((r) => r.amount));
  return projectRetainer({
    totalValue: amt(c.totalValue),
    billedSoFar: billed,
    perPeriod: amt(c.retainerAmount),
    frequency: c.billingFrequency,
    billingDate: c.billingDate,
    endDate: c.endDate,
    periodsBilled: rows.reduce((m, r) => Math.max(m, r.seq), 0),
  }).map((p) => ({
    id: `projected-${p.seq}`,
    seq: p.seq,
    dueDate: p.dueDate,
    description: null,
    amount: p.amount,
    status: "pending" as const,
    live: false,
    document: null,
    projected: true,
    bucket: null,
  }));
}

/** The contract with its status re-derived from the invoices as they are now. */
function withLiveStatus(c: BillingContract, rows: ContractScheduleRow[]): BillingContract {
  const status = deriveContractStatus({
    status: c.status,
    paymentType: c.paymentType,
    totalValue: amt(c.totalValue),
    stopWhenComplete: c.stopWhenComplete,
    rows: rows.map((r) => ({ live: r.live, stopped: r.status === "stopped", amount: r.amount })),
  });
  return status === c.status ? c : { ...c, status };
}

function summarise(
  c: BillingContract,
  rows: ContractScheduleRow[],
  pdcs: { amount: string | number }[],
  today: string,
): ContractSummary {
  const buckets = emptyBuckets();
  // A stopped or cancelled contract bills nothing further, so its unraised
  // rows are out of the count; its raised bills still are.
  const open = c.status === "active" || c.status === "completed";
  for (const r of rows) {
    if (!r.live && !open) continue;
    addToBucket(buckets, r.bucket, r.amount);
  }
  for (const p of retainerProjection(c, rows)) {
    addToBucket(buckets, billBucket({ itemStatus: "pending", dueDate: p.dueDate, document: null }, today), p.amount);
  }
  const billed = sumAmounts(rows.filter((r) => r.live).map((r) => r.amount));
  const total = amt(c.totalValue);
  return {
    id: c.id,
    entityId: c.entityId,
    customerId: c.customerId,
    customerName: c.customerName,
    totalValue: total,
    startDate: c.startDate,
    endDate: c.endDate,
    billingDate: c.billingDate,
    paymentType: c.paymentType,
    billingFrequency: c.billingFrequency,
    retainerAmount: c.retainerAmount === null ? null : amt(c.retainerAmount),
    status: c.status,
    billedAmount: billed,
    remainingAmount: Math.max(0, Math.round((total - billed) * 100) / 100),
    buckets,
    pdc: pdcSummary(pdcs),
    hasAttachment: Boolean(c.attachmentPath),
    createdAt: c.createdAt,
  };
}

export async function listContracts(): Promise<{ rows: ContractSummary[]; totals: BucketTotals }> {
  const contracts = await db
    .select()
    .from(billingContracts)
    .orderBy(desc(billingContracts.createdAt))
    .limit(500);
  const ids = contracts.map((c) => c.id);
  const items = await loadItems(ids);
  const pdcs = ids.length
    ? await db
        .select({ contractId: billingContractPdcs.contractId, amount: billingContractPdcs.amount })
        .from(billingContractPdcs)
        .where(inArray(billingContractPdcs.contractId, ids))
    : [];

  const today = todayISO();
  const itemsBy = new Map<string, ContractScheduleRow[]>();
  for (const r of items) {
    const list = itemsBy.get(r.item.contractId) ?? [];
    list.push(toScheduleRow(r, today));
    itemsBy.set(r.item.contractId, list);
  }
  const pdcsBy = new Map<string, { amount: string }[]>();
  for (const p of pdcs) {
    const list = pdcsBy.get(p.contractId) ?? [];
    list.push({ amount: p.amount });
    pdcsBy.set(p.contractId, list);
  }

  const rows = contracts.map((raw) => {
    const schedule = itemsBy.get(raw.id) ?? [];
    return summarise(withLiveStatus(raw, schedule), schedule, pdcsBy.get(raw.id) ?? [], today);
  });
  const totals = emptyBuckets();
  for (const r of rows) {
    for (const k of ["paid", "unpaid", "notDue"] as const) {
      totals[k].count += r.buckets[k].count;
      totals[k].amount = Math.round((totals[k].amount + r.buckets[k].amount) * 100) / 100;
    }
  }
  return { rows, totals };
}

export interface ContractDetail {
  contract: BillingContract;
  summary: ContractSummary;
  schedule: ContractScheduleRow[];
  /** Retainer periods still to come (not stored). */
  upcoming: ContractScheduleRow[];
  pdcs: BillingContractPdc[];
  attachmentUrl: string | null;
}

export async function getContract(id: string): Promise<ContractDetail | null> {
  const [raw] = await db.select().from(billingContracts).where(eq(billingContracts.id, id)).limit(1);
  if (!raw) return null;
  const items = await loadItems([id]);
  const pdcs = await db
    .select()
    .from(billingContractPdcs)
    .where(eq(billingContractPdcs.contractId, id))
    .orderBy(asc(billingContractPdcs.srNo));
  const today = todayISO();
  const schedule = items.map((r) => toScheduleRow(r, today));
  const contract = withLiveStatus(raw, schedule);
  const attachmentUrl = contract.attachmentPath
    ? await createSignedObjectUrl(DOCUMENTS_BUCKET, contract.attachmentPath, 60 * 30).catch(() => null)
    : null;
  return {
    contract,
    summary: summarise(contract, schedule, pdcs, today),
    schedule,
    upcoming: retainerProjection(contract, schedule),
    pdcs,
    attachmentUrl,
  };
}
