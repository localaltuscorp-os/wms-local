import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, isNotNull, isNull, or } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  billingContractItems,
  billingContractPdcs,
  billingContracts,
  billingCustomers,
  billingDocuments,
  type BillingContract,
  type BillingContractItem,
} from "@/db/schema";
import { CONTRACT_PAYMENT_TYPE_LABELS, type BillingDocStatus } from "@/db/enums";
import { DOCUMENTS_BUCKET } from "@/lib/supabase/admin";
import { putObject, removeObjects } from "@/lib/storage/objects";
import { validateUpload } from "@/lib/hr/upload";
import { todayISO } from "@/lib/billing/numbering";
import {
  saveBillingDocument,
  type BillingActor,
  type CoreResult,
} from "@/lib/billing/documents";
import { getEntityBillingProfile, listSacCodes } from "@/lib/queries/billing-documents";
import { BillingDocumentSchema } from "@/lib/validators/billing";
import type { ContractParsed } from "@/lib/validators/billing-contracts";
import {
  addMonthsISO,
  amt,
  canBill,
  CONTRACT_TOTAL_EXCEEDED,
  deriveContractStatus,
  nextRetainerAmount,
  periodMonths,
  plannedTotal,
  sumAmounts,
} from "@/lib/billing/contracts";

/**
 * BILLING CONTRACTS — the write core.
 *
 * Same shape as lib/billing/documents.ts: explicit actor, `{ok}` results,
 * nothing thrown at the UI. Three things this file exists to hold:
 *
 *   1. THE CEILING. Nothing — a save, an edit, a Raise Bill — may leave the
 *      schedule, or what has actually been billed, above the contract value.
 *      Checked here with the server's own view of which rows are billed and
 *      stopped, never the form's.
 *   2. ONE INVOICE PER ROW. Raise Bill CLAIMS the row inside a transaction that
 *      locks the contract, then creates the invoice; two clicks (or two tabs)
 *      cannot both bill the same milestone or push a retainer past its value.
 *   3. INVOICES ARE THE ENGINE'S. A bill is an ordinary draft tax invoice from
 *      `saveBillingDocument`; its paid / cancelled state is read back live.
 */

const money2 = (n: number): string => n.toFixed(2);

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface ItemWithDoc extends BillingContractItem {
  docStatus: BillingDocStatus | null;
}

/** A row carries a live bill: claimed/raised, and its invoice not cancelled. */
export function isLive(i: Pick<ItemWithDoc, "status" | "docStatus">): boolean {
  return i.status === "billed" && i.docStatus !== "cancelled";
}

async function itemsWithDocs(tx: Tx | typeof db, contractId: string): Promise<ItemWithDoc[]> {
  const rows = await tx
    .select({ item: billingContractItems, docStatus: billingDocuments.status })
    .from(billingContractItems)
    .leftJoin(billingDocuments, eq(billingDocuments.id, billingContractItems.documentId))
    .where(eq(billingContractItems.contractId, contractId))
    .orderBy(asc(billingContractItems.seq));
  return rows.map((r) => ({ ...r.item, docStatus: r.docStatus ?? null }));
}

function billedTotal(items: ItemWithDoc[]): number {
  return sumAmounts(items.filter(isLive).map((i) => i.amount));
}

/* ───────────────────────────── status ──────────────────────────────────── */

/**
 * Completed / active, re-derived after anything that moves money. Stopped and
 * cancelled are decisions a person made and are never overridden here.
 */
export async function recomputeContractStatus(contractId: string): Promise<void> {
  const [c] = await db.select().from(billingContracts).where(eq(billingContracts.id, contractId)).limit(1);
  if (!c || c.status === "stopped" || c.status === "cancelled") return;
  const items = await itemsWithDocs(db, contractId);
  const next = deriveContractStatus({
    status: c.status,
    paymentType: c.paymentType,
    totalValue: amt(c.totalValue),
    stopWhenComplete: c.stopWhenComplete,
    rows: items.map((i) => ({ live: isLive(i), stopped: i.status === "stopped", amount: amt(i.amount) })),
  });
  if (next !== c.status) {
    await db
      .update(billingContracts)
      .set({ status: next, updatedAt: new Date() })
      .where(eq(billingContracts.id, contractId));
  }
}

/* ────────────────────────── create / update ────────────────────────────── */

export async function saveContract(
  input: ContractParsed,
  actor: BillingActor,
): Promise<CoreResult<{ id: string }>> {
  // The client must be a live Customer Master row — the same rule the
  // document engine applies, so a contract can always raise its bills.
  const [customer] = await db
    .select({ id: billingCustomers.id, name: billingCustomers.name, isActive: billingCustomers.isActive })
    .from(billingCustomers)
    .where(and(eq(billingCustomers.id, input.customerId), isNull(billingCustomers.deletedAt)))
    .limit(1);
  if (!customer) {
    return { ok: false, error: "That client is not in the Customer Master. Onboard them in New Customer KYC first." };
  }
  if (!customer.isActive) {
    return { ok: false, error: "That client is deactivated. Activate them in the Customer Master first." };
  }

  const total = amt(input.totalValue);
  const isRetainer = input.paymentType === "retainer";

  // Full Payment defaults its one entry to the whole contract value.
  let submitted = isRetainer ? [] : input.items;
  if (input.paymentType === "full_payment" && submitted.length === 0) {
    submitted = [{ id: null, dueDate: input.billingDate, description: "Full payment", amount: money2(total) }];
  }

  const header = {
    entityId: input.entityId,
    customerId: customer.id,
    customerName: customer.name,
    totalValue: money2(total),
    startDate: input.startDate,
    endDate: input.endDate,
    billingDate: input.billingDate,
    paymentType: input.paymentType,
    billingFrequency: isRetainer ? input.billingFrequency : null,
    retainerAmount: isRetainer ? money2(amt(input.retainerAmount)) : null,
    stopWhenComplete: input.stopWhenComplete,
    notes: input.notes,
    updatedById: actor.id,
    updatedAt: new Date(),
  };

  const pdcRows = (contractId: string) =>
    input.pdcs.map((p, i) => ({
      contractId,
      srNo: i + 1,
      chequeDate: p.chequeDate,
      chequeNo: p.chequeNo,
      bankName: p.bankName,
      amount: money2(amt(p.amount)),
      drawerName: p.drawerName,
    }));

  /* ── CREATE ── */
  if (!input.id) {
    const id = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(billingContracts)
        .values({ ...header, status: "active", createdById: actor.id })
        .returning({ id: billingContracts.id });
      const newId = row!.id;
      if (submitted.length) {
        await tx.insert(billingContractItems).values(
          submitted.map((it, i) => ({
            contractId: newId,
            kind: input.paymentType,
            seq: i + 1,
            dueDate: it.dueDate,
            description: it.description,
            amount: money2(amt(it.amount)),
          })),
        );
      }
      if (input.pdcs.length) await tx.insert(billingContractPdcs).values(pdcRows(newId));
      return newId;
    });
    return { ok: true, id };
  }

  /* ── UPDATE ── */
  const id = input.id;
  const result = await db.transaction(async (tx): Promise<CoreResult> => {
    const [existing] = await tx
      .select()
      .from(billingContracts)
      .where(eq(billingContracts.id, id))
      .for("update")
      .limit(1);
    if (!existing) return { ok: false, error: "That contract no longer exists." };
    if (existing.status === "cancelled") return { ok: false, error: "A cancelled contract cannot be edited." };

    const current = await itemsWithDocs(tx, id);
    const live = current.filter(isLive);
    const billed = billedTotal(current);

    if (existing.paymentType !== input.paymentType && current.some((i) => i.status === "billed")) {
      return { ok: false, error: "Bills have been raised on this contract, so its Payment Type cannot change." };
    }
    if (billed > total) {
      return { ok: false, error: `${CONTRACT_TOTAL_EXCEEDED}: ${money2(billed)} has already been billed.` };
    }

    const byId = new Map(current.map((i) => [i.id, i]));
    for (const it of submitted) {
      if (it.id && !byId.has(it.id)) return { ok: false, error: "A schedule row no longer exists — reload and try again." };
      const prev = it.id ? byId.get(it.id) : undefined;
      if (prev && isLive(prev) && amt(prev.amount) !== amt(it.amount)) {
        return { ok: false, error: `Row ${prev.seq} has already been billed, so its Billing Amount cannot change.` };
      }
    }
    const keptIds = new Set(submitted.map((i) => i.id).filter(Boolean) as string[]);
    const droppedLive = live.find((i) => !keptIds.has(i.id));
    if (!isRetainer && droppedLive) {
      return { ok: false, error: `Row ${droppedLive.seq} has a bill raised against it and cannot be removed.` };
    }

    // The ceiling, with the server's view of which rows are stopped / billed.
    if (!isRetainer) {
      const plan = submitted.map((it) => {
        const prev = it.id ? byId.get(it.id) : undefined;
        return { amount: it.amount, stopped: prev?.status === "stopped", billed: prev ? isLive(prev) : false };
      });
      if (plannedTotal(plan) > total) return { ok: false, error: CONTRACT_TOTAL_EXCEEDED };
    }

    await tx.update(billingContracts).set(header).where(eq(billingContracts.id, id));

    if (!isRetainer) {
      // Rows the form dropped go, unless they ever raised an invoice — a
      // cancelled bill still belongs in the contract's history.
      const removable = current.filter((i) => !keptIds.has(i.id) && !i.documentId).map((i) => i.id);
      if (removable.length) await tx.delete(billingContractItems).where(inArray(billingContractItems.id, removable));
      const orphans = current.filter((i) => !keptIds.has(i.id) && i.documentId && !isLive(i)).map((i) => i.id);
      if (orphans.length) {
        await tx
          .update(billingContractItems)
          .set({ status: "stopped", stoppedAt: new Date(), updatedAt: new Date() })
          .where(inArray(billingContractItems.id, orphans));
      }
      for (const [i, it] of submitted.entries()) {
        const values = {
          seq: i + 1,
          dueDate: it.dueDate,
          description: it.description,
          amount: money2(amt(it.amount)),
          updatedAt: new Date(),
        };
        if (it.id) {
          await tx.update(billingContractItems).set(values).where(eq(billingContractItems.id, it.id));
        } else {
          await tx.insert(billingContractItems).values({ ...values, contractId: id, kind: input.paymentType });
        }
      }
      // Kept-for-history rows go after the live schedule.
      let seq = submitted.length;
      for (const oid of orphans) {
        seq += 1;
        await tx.update(billingContractItems).set({ seq }).where(eq(billingContractItems.id, oid));
      }
    }

    await tx.delete(billingContractPdcs).where(eq(billingContractPdcs.contractId, id));
    if (input.pdcs.length) await tx.insert(billingContractPdcs).values(pdcRows(id));
    return { ok: true };
  });
  if (!result.ok) return result;

  // A raised contract value re-opens a completed contract, and vice versa.
  await recomputeContractStatus(id);
  return { ok: true, id };
}

/* ───────────────────────────── raise a bill ────────────────────────────── */

function blockedReason(c: BillingContract): string | null {
  if (c.status === "cancelled") return "This contract is cancelled.";
  if (c.status === "stopped") return "Billing is stopped for this contract. Resume it to raise a bill.";
  if (c.status === "completed") return "The Contract Value is completely billed — nothing is left to raise.";
  return null;
}

/** GST rate for a contract bill: the entity's default SAC, else 18%. */
async function defaultTaxFor(entityId: string): Promise<{ sacCode: string | null; gstRate: string }> {
  const profile = await getEntityBillingProfile(entityId);
  const sacCode = profile?.defaultSacCode ?? null;
  if (sacCode) {
    const sacs = await listSacCodes();
    const hit = sacs.find((s) => s.code === sacCode);
    if (hit?.defaultGstRate !== null && hit?.defaultGstRate !== undefined) {
      return { sacCode, gstRate: String(hit.defaultGstRate) };
    }
  }
  return { sacCode, gstRate: "18" };
}

/**
 * RAISE BILL — one schedule row becomes one draft tax invoice.
 *
 * For a retainer, `itemId` is omitted and the NEXT period is billed: the period
 * amount, or what remains of the contract value when that is less.
 */
export async function raiseContractBill(
  contractId: string,
  itemId: string | null,
  actor: BillingActor,
): Promise<CoreResult<{ documentId: string; itemId: string }>> {
  // An invoice cancelled in Documents may have re-opened a completed contract.
  await recomputeContractStatus(contractId);

  /* 1. CLAIM the row under a lock on the contract. */
  type Claim = { item: BillingContractItem; created: boolean; previousDocId: string | null; contract: BillingContract };
  const claim = await db.transaction(async (tx): Promise<CoreResult<{ claim: Claim }>> => {
    const [c] = await tx
      .select()
      .from(billingContracts)
      .where(eq(billingContracts.id, contractId))
      .for("update")
      .limit(1);
    if (!c) return { ok: false, error: "That contract no longer exists." };
    const blocked = blockedReason(c);
    if (blocked) return { ok: false, error: blocked };

    const items = await itemsWithDocs(tx, contractId);
    const billed = billedTotal(items);
    const total = amt(c.totalValue);

    if (c.paymentType === "retainer") {
      if (itemId) return { ok: false, error: "A retainer bills its next period; no row is chosen." };
      const per = amt(c.retainerAmount);
      const next = nextRetainerAmount(total, billed, per);
      if (next === null) return { ok: false, error: "The Contract Value is completely billed — billing has stopped." };

      // A period whose invoice was cancelled is re-raised before a new one.
      const redo = items.find((i) => i.status === "billed" && i.docStatus === "cancelled");
      if (redo) {
        const ok = canBill(total, billed, amt(redo.amount));
        if (!ok.ok) return ok;
        const [row] = await tx
          .update(billingContractItems)
          .set({ raisedAt: new Date(), updatedAt: new Date() })
          .where(eq(billingContractItems.id, redo.id))
          .returning();
        return { ok: true, claim: { item: row!, created: false, previousDocId: redo.documentId, contract: c } };
      }

      const seq = items.reduce((m, i) => Math.max(m, i.seq), 0) + 1;
      const dueDate = addMonthsISO(c.billingDate, (seq - 1) * periodMonths(c.billingFrequency));
      if (dueDate > c.endDate) {
        return { ok: false, error: `Period ${seq} would fall on ${dueDate}, after the contract's End Date (${c.endDate}).` };
      }
      const freq = c.billingFrequency === "quarterly" ? "Quarterly" : "Monthly";
      const [row] = await tx
        .insert(billingContractItems)
        .values({
          contractId,
          kind: "retainer",
          seq,
          dueDate,
          description: `Retainer — ${freq} billing, period ${seq}`,
          amount: money2(next),
          status: "billed",
          raisedAt: new Date(),
        })
        .returning();
      return { ok: true, claim: { item: row!, created: true, previousDocId: null, contract: c } };
    }

    if (!itemId) return { ok: false, error: "Choose the row to bill." };
    const item = items.find((i) => i.id === itemId);
    if (!item) return { ok: false, error: "That row is not on this contract." };
    if (item.status === "stopped") return { ok: false, error: "Billing is stopped for this row." };
    if (isLive(item)) return { ok: false, error: "A bill has already been raised for this row." };
    const ok = canBill(total, billed, amt(item.amount));
    if (!ok.ok) return ok;

    const [row] = await tx
      .update(billingContractItems)
      .set({ status: "billed", raisedAt: new Date(), updatedAt: new Date() })
      .where(eq(billingContractItems.id, item.id))
      .returning();
    return { ok: true, claim: { item: row!, created: false, previousDocId: item.documentId, contract: c } };
  });
  if (!claim.ok) return claim;
  const { item, created, previousDocId, contract } = claim.claim;

  const release = async () => {
    if (created) {
      await db.delete(billingContractItems).where(eq(billingContractItems.id, item.id));
    } else {
      await db
        .update(billingContractItems)
        .set({ status: previousDocId ? "billed" : "pending", documentId: previousDocId, updatedAt: new Date() })
        .where(eq(billingContractItems.id, item.id));
    }
  };

  /* 2. The invoice, through the document engine. */
  const today = todayISO();
  const tax = await defaultTaxFor(contract.entityId);
  const typeLabel = CONTRACT_PAYMENT_TYPE_LABELS[contract.paymentType];
  const label =
    contract.paymentType === "milestone"
      ? `Milestone ${item.seq}`
      : contract.paymentType === "subscription"
        ? `Instalment ${item.seq}`
        : contract.paymentType === "retainer"
          ? `Retainer period ${item.seq}`
          : "Full payment";
  const lineName = item.description?.trim() || `${label} — ${typeLabel} contract`;
  const parsed = BillingDocumentSchema.safeParse({
    docType: "tax_invoice",
    entityId: contract.entityId,
    docDate: today,
    dueDate: item.dueDate && item.dueDate >= today ? item.dueDate : null,
    customerId: contract.customerId,
    customerName: contract.customerName,
    serviceDescription: lineName,
    sacCode: tax.sacCode,
    remarks: `Billed under contract (${typeLabel}, ${label}).`,
    gstApplicable: true,
    isReverseCharge: false,
    isExempt: false,
    lines: [
      {
        name: lineName.slice(0, 300),
        quantity: "1",
        rate: item.amount,
        discountAmount: "0",
        gstRate: tax.gstRate,
        sacCode: tax.sacCode,
      },
    ],
  });
  if (!parsed.success) {
    await release();
    return { ok: false, error: parsed.error.issues[0]?.message ?? "The bill could not be prepared." };
  }
  const saved = await saveBillingDocument(parsed.data, actor);
  if (!saved.ok) {
    await release();
    return saved;
  }

  /* 3. Link it. */
  await db
    .update(billingContractItems)
    .set({ documentId: saved.id, status: "billed", updatedAt: new Date() })
    .where(eq(billingContractItems.id, item.id));
  await recomputeContractStatus(contractId);
  return { ok: true, documentId: saved.id, itemId: item.id };
}

/* ─────────────────────────────── stop ──────────────────────────────────── */

/** STOP BILLING on one milestone / instalment. A row with a live bill cannot. */
export async function stopContractItem(
  contractId: string,
  itemId: string,
): Promise<CoreResult> {
  const items = await itemsWithDocs(db, contractId);
  const item = items.find((i) => i.id === itemId);
  if (!item) return { ok: false, error: "That row is not on this contract." };
  if (item.status === "stopped") return { ok: true };
  if (isLive(item)) {
    return { ok: false, error: "A bill has already been raised for this row. Cancel that invoice first to stop it." };
  }
  await db
    .update(billingContractItems)
    .set({ status: "stopped", stoppedAt: new Date(), updatedAt: new Date() })
    .where(eq(billingContractItems.id, itemId));
  await recomputeContractStatus(contractId);
  return { ok: true };
}

/** Put a stopped row back on the schedule — re-checked against the ceiling. */
export async function resumeContractItem(contractId: string, itemId: string): Promise<CoreResult> {
  const [c] = await db.select().from(billingContracts).where(eq(billingContracts.id, contractId)).limit(1);
  if (!c) return { ok: false, error: "That contract no longer exists." };
  const items = await itemsWithDocs(db, contractId);
  const item = items.find((i) => i.id === itemId);
  if (!item) return { ok: false, error: "That row is not on this contract." };
  if (item.status !== "stopped") return { ok: true };
  const plan = items.map((i) => ({
    amount: i.amount,
    stopped: i.id === itemId ? false : i.status === "stopped",
    billed: isLive(i),
  }));
  if (plannedTotal(plan) > amt(c.totalValue)) return { ok: false, error: CONTRACT_TOTAL_EXCEEDED };
  await db
    .update(billingContractItems)
    .set({ status: item.documentId ? "billed" : "pending", stoppedAt: null, updatedAt: new Date() })
    .where(eq(billingContractItems.id, itemId));
  await recomputeContractStatus(contractId);
  return { ok: true };
}

/** STOP BILLING on the whole contract (the retainer's button). Reversible. */
export async function setContractBillingStopped(
  id: string,
  stopped: boolean,
  actor: BillingActor,
): Promise<CoreResult> {
  const [c] = await db.select().from(billingContracts).where(eq(billingContracts.id, id)).limit(1);
  if (!c) return { ok: false, error: "That contract no longer exists." };
  if (c.status === "cancelled") return { ok: false, error: "This contract is cancelled." };
  if (stopped) {
    await db
      .update(billingContracts)
      .set({ status: "stopped", stoppedAt: new Date(), stoppedById: actor.id, updatedAt: new Date(), updatedById: actor.id })
      .where(eq(billingContracts.id, id));
    return { ok: true };
  }
  await db
    .update(billingContracts)
    .set({ status: "active", stoppedAt: null, stoppedById: null, updatedAt: new Date(), updatedById: actor.id })
    .where(eq(billingContracts.id, id));
  await recomputeContractStatus(id);
  return { ok: true };
}

/** CANCEL — the contract is void. Invoices already raised are left as they are. */
export async function cancelContract(id: string, reason: string, actor: BillingActor): Promise<CoreResult> {
  const [c] = await db.select().from(billingContracts).where(eq(billingContracts.id, id)).limit(1);
  if (!c) return { ok: false, error: "That contract no longer exists." };
  if (c.status === "cancelled") return { ok: true };
  await db
    .update(billingContracts)
    .set({ status: "cancelled", cancelledAt: new Date(), cancelReason: reason, updatedAt: new Date(), updatedById: actor.id })
    .where(eq(billingContracts.id, id));
  return { ok: true };
}

/**
 * DELETE — only a contract that never raised an invoice. Once a bill exists
 * the contract is part of that invoice's story; cancel it instead.
 */
export async function deleteContract(id: string): Promise<CoreResult> {
  const [c] = await db.select().from(billingContracts).where(eq(billingContracts.id, id)).limit(1);
  if (!c) return { ok: true };
  const raised = await db
    .select({ id: billingContractItems.id })
    .from(billingContractItems)
    .where(
      and(
        eq(billingContractItems.contractId, id),
        or(eq(billingContractItems.status, "billed"), isNotNull(billingContractItems.documentId)),
      ),
    )
    .limit(1);
  if (raised.length) return { ok: false, error: "Bills have been raised on this contract. Cancel it instead of deleting." };
  await db.delete(billingContracts).where(eq(billingContracts.id, id));
  if (c.attachmentPath) await removeObjects(DOCUMENTS_BUCKET, [c.attachmentPath]).catch(() => {});
  return { ok: true };
}

/* ───────────────────────────── attachment ──────────────────────────────── */

export const CONTRACT_ATTACHMENT_MAX_BYTES = 15 * 1024 * 1024;
export const CONTRACT_ATTACHMENT_EXTENSIONS = ["pdf", "doc", "docx", "jpg", "jpeg", "png", "webp"] as const;

/** Attach (or replace) the signed contract. The old file goes once the new one is recorded. */
export async function attachContractFile(
  contractId: string,
  file: File,
): Promise<CoreResult<{ name: string }>> {
  const valid = validateUpload(file);
  if (!valid.ok) return valid;
  if (file.size > CONTRACT_ATTACHMENT_MAX_BYTES) return { ok: false, error: "The contract file must be 15 MB or smaller." };
  const cleanName = (file.name || "contract").replace(/[\r\n"]/g, "").slice(0, 180) || "contract";
  const ext = (cleanName.split(".").pop() ?? "").toLowerCase();
  if (!(CONTRACT_ATTACHMENT_EXTENSIONS as readonly string[]).includes(ext)) {
    return { ok: false, error: "Attach a PDF, Word document or image (PDF, DOC, DOCX, JPG, PNG, WEBP)." };
  }

  const [c] = await db
    .select({ id: billingContracts.id, attachmentPath: billingContracts.attachmentPath })
    .from(billingContracts)
    .where(eq(billingContracts.id, contractId))
    .limit(1);
  if (!c) return { ok: false, error: "That contract no longer exists." };

  const path = `billing/contracts/${contractId}/${randomUUID()}.${ext}`;
  const mime = (file.type || "application/octet-stream").toLowerCase();
  const put = await putObject(DOCUMENTS_BUCKET, path, Buffer.from(await file.arrayBuffer()), mime);
  if (!put.ok) return { ok: false, error: `Upload failed: ${put.error}` };

  try {
    await db
      .update(billingContracts)
      .set({ attachmentPath: path, attachmentName: cleanName, attachmentType: mime, attachmentSize: file.size, updatedAt: new Date() })
      .where(eq(billingContracts.id, contractId));
  } catch (e) {
    await removeObjects(DOCUMENTS_BUCKET, [path]).catch(() => {});
    return { ok: false, error: `The file could not be saved: ${e instanceof Error ? e.message : "Unknown error"}` };
  }
  if (c.attachmentPath) await removeObjects(DOCUMENTS_BUCKET, [c.attachmentPath]).catch(() => {});
  return { ok: true, name: cleanName };
}

export async function removeContractFile(contractId: string): Promise<CoreResult> {
  const [c] = await db
    .select({ attachmentPath: billingContracts.attachmentPath })
    .from(billingContracts)
    .where(eq(billingContracts.id, contractId))
    .limit(1);
  if (!c) return { ok: false, error: "That contract no longer exists." };
  await db
    .update(billingContracts)
    .set({ attachmentPath: null, attachmentName: null, attachmentType: null, attachmentSize: null, updatedAt: new Date() })
    .where(eq(billingContracts.id, contractId));
  if (c.attachmentPath) await removeObjects(DOCUMENTS_BUCKET, [c.attachmentPath]).catch(() => {});
  return { ok: true };
}
