import "server-only";
import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  billingCustomers,
  billingDocumentEvents,
  billingDocumentLines,
  billingDocuments,
  billingEntityProfiles,
  billingPaymentTerms,
  orgSettings,
  type BillingCustomerSnapshot,
  type BillingDocument,
  type BillingSellerSnapshot,
} from "@/db/schema";
import type { BillingDocType, BillingEventType } from "@/db/enums";
import { amountInWords } from "@/lib/salary/pdf-house-style";
import { buildSellerSnapshot } from "@/lib/billing/seller";
import { entityChargesGst } from "@/lib/billing/gst-entities";
import { DUMMY_ENTITY_PROFILES, withDummyFallback } from "@/lib/billing/master";
import { allocateDocNo, canConvert, dueDateFor, financialYear, todayISO } from "@/lib/billing/numbering";
import { computeLine, computeTotals, money, resolveGstMode, type Totals } from "@/lib/billing/tax";
import { generateBlockers, type BillingDocumentParsed } from "@/lib/validators/billing";

/**
 * BILLING — the write core.
 *
 * Every mutation the module performs lives here, taking an EXPLICIT actor
 * (`{ id, email }`) rather than reaching for the session, so a future mobile or
 * JSON API shares one implementation with the server actions — the arrangement
 * `lib/dcc` already uses.
 *
 * Three invariants this file exists to hold:
 *
 *   1. THE SERVER OWNS THE MONEY. Posted totals are display state. Every write
 *      recomputes the lines and the totals from the line inputs and the derived
 *      GST mode, and stores its own numbers.
 *   2. THE SNAPSHOT IS TAKEN AT SAVE TIME. `sellerSnapshot` / `customerSnapshot`
 *      carry the printed values, so editing a master later cannot rewrite a
 *      document that has already gone out.
 *   3. THE NUMBER IS ALLOCATED ON GENERATE, inside the same transaction as the
 *      status change — never when a draft is created.
 */

export interface BillingActor {
  id: string;
  email?: string | null;
  name?: string | null;
}

export type CoreResult<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

const clean = (v: string | null | undefined): string | null => {
  const t = v?.trim();
  return t ? t : null;
};

/** Money → the string a numeric(14,2) column wants. */
const money2 = (n: number): string => n.toFixed(2);

export async function recordEvent(
  tx: typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0],
  documentId: string,
  actorId: string | null,
  eventType: BillingEventType,
  meta?: Record<string, unknown>,
): Promise<void> {
  await tx.insert(billingDocumentEvents).values({
    documentId,
    actorId,
    eventType,
    meta: meta ?? null,
  });
}

// ── Payload building ───────────────────────────────────────────────────────

export interface DocumentPayload {
  seller: BillingSellerSnapshot;
  customer: BillingCustomerSnapshot;
  totals: Totals;
  lines: {
    productId: string | null;
    code: string | null;
    name: string;
    description: string | null;
    sacCode: string | null;
    hsnCode: string | null;
    quantity: string;
    unit: string | null;
    rate: string;
    discountPct: string | null;
    discountAmount: string;
    amount: string;
    gstRate: string;
    cgstAmount: string;
    sgstAmount: string;
    igstAmount: string;
    lineTotal: string;
    sortOrder: number;
  }[];
  dueDate: string | null;
  paymentTermsLabel: string | null;
}

/**
 * Turn a validated form payload into everything the row needs: the two
 * snapshots, the derived GST mode, the per-line money and the totals.
 *
 * Shared by create, update, generate and convert, so those four can never
 * disagree about what a document's figures are.
 */
export async function buildDocumentPayload(
  rawInput: BillingDocumentParsed,
): Promise<DocumentPayload> {
  /* GST ONLY FOR GST ISSUERS. Any entity other than Altus Corp and Colour
     Graphics issues without GST details: forced here, whatever the form sent,
     so a stale tab or a hand-built request cannot put GST on its document. */
  const input: BillingDocumentParsed = entityChargesGst(rawInput.entityId)
    ? rawInput
    : {
        ...rawInput,
        gstApplicable: false,
        isReverseCharge: false,
        isExempt: false,
        lines: rawInput.lines.map((l) => ({ ...l, gstRate: "0" })),
      };
  const [profile, [org], customerRow, termRow] = await Promise.all([
    db
      .select()
      .from(billingEntityProfiles)
      .where(eq(billingEntityProfiles.entityId, input.entityId))
      .limit(1)
      // SAME FALLBACK THE FORM USED. This read went straight to the table and
      // so never saw lib/billing/master — which meant a document SAVED while
      // the Admin Master is still empty took a seller snapshot with no PAN and
      // no GSTIN, even though the form beside it had shown both. A seller with
      // no GSTIN cannot charge GST, so the invoice also came out with
      // gst_mode "none" and every tax line zero.
      //
      // Looked up BY ENTITY, so an entity the dummy master does not describe
      // stays null rather than borrowing Altus Corp's tax identifiers.
      .then(
        (r) =>
          r[0] ??
          withDummyFallback([], DUMMY_ENTITY_PROFILES).find(
            (p) => p.entityId === input.entityId,
          ) ??
          null,
      ),
    db.select({ logoUrl: orgSettings.logoUrl }).from(orgSettings).limit(1),
    input.customerId
      ? db
          .select()
          .from(billingCustomers)
          .where(eq(billingCustomers.id, input.customerId))
          .limit(1)
          .then((r) => r[0] ?? null)
      : Promise.resolve(null),
    input.paymentTermsId
      ? db
          .select()
          .from(billingPaymentTerms)
          .where(eq(billingPaymentTerms.id, input.paymentTermsId))
          .limit(1)
          .then((r) => r[0] ?? null)
      : Promise.resolve(null),
  ]);

  const seller = buildSellerSnapshot(input.entityId, profile, org?.logoUrl ?? null);

  // The master supplies the defaults; the values ON THE DOCUMENT win, because
  // the user is allowed to correct an address or an email for one invoice
  // without editing the master row behind it.
  const customer: BillingCustomerSnapshot = {
    name: input.customerName,
    legalName: customerRow?.legalName ?? null,
    contactName: clean(input.customerContactName) ?? customerRow?.contactName ?? null,
    email: clean(input.customerEmail) ?? customerRow?.email ?? null,
    whatsapp: clean(input.customerWhatsapp) ?? customerRow?.whatsapp ?? null,
    phone: customerRow?.phone ?? null,
    pan: customerRow?.pan ?? null,
    gstin: clean(input.customerGstin) ?? customerRow?.gstin ?? null,
    addressLine1: customerRow?.addressLine1 ?? null,
    addressLine2: customerRow?.addressLine2 ?? null,
    city: customerRow?.city ?? null,
    stateName: clean(input.placeOfSupplyState) ?? customerRow?.stateName ?? null,
    stateCode: clean(input.placeOfSupplyCode) ?? customerRow?.stateCode ?? null,
    pincode: customerRow?.pincode ?? null,
    country: customerRow?.country ?? "India",
  };

  const mode = resolveGstMode({
    sellerGstin: seller.gstin,
    sellerStateCode: seller.stateCode,
    customerStateCode: customer.stateCode,
    gstApplicable: input.gstApplicable,
    exempt: input.isExempt,
  });

  const totals = computeTotals(input.lines, mode);

  const lines = input.lines.map((l, i) => {
    const c = computeLine(l, mode);
    return {
      productId: l.productId ?? null,
      code: clean(l.code),
      name: l.name.trim(),
      description: clean(l.description),
      sacCode: clean(l.sacCode) ?? clean(input.sacCode) ?? profile?.defaultSacCode ?? null,
      hsnCode: clean(l.hsnCode),
      quantity: String(money(l.quantity)),
      unit: clean(l.unit),
      rate: money2(money(l.rate)),
      discountPct: clean(l.discountPct),
      discountAmount: money2(c.discountAmount),
      amount: money2(c.amount),
      gstRate: money2(c.gstRate),
      cgstAmount: money2(c.cgstAmount),
      sgstAmount: money2(c.sgstAmount),
      igstAmount: money2(c.igstAmount),
      lineTotal: money2(c.lineTotal),
      sortOrder: i,
    };
  });

  const paymentTermsLabel = clean(input.paymentTermsLabel) ?? termRow?.label ?? null;
  const dueDate = clean(input.dueDate) ?? dueDateFor(input.docDate, termRow?.dueDays ?? null);

  return { seller, customer, totals, lines, dueDate, paymentTermsLabel };
}

function documentColumns(
  input: BillingDocumentParsed,
  payload: DocumentPayload,
  actor: BillingActor,
) {
  const { seller, customer, totals } = payload;
  return {
    docType: input.docType,
    finYear: financialYear(input.docDate),
    docDate: input.docDate,
    dueDate: payload.dueDate,
    entityId: input.entityId,
    sellerSnapshot: seller,
    customerId: input.customerId,
    customerSnapshot: customer,
    customerName: input.customerName.trim(),
    customerContactName: customer.contactName,
    customerEmail: customer.email,
    customerWhatsapp: customer.whatsapp,
    customerGstin: customer.gstin,
    placeOfSupplyState: customer.stateName,
    placeOfSupplyCode: customer.stateCode,
    serviceDescription: clean(input.serviceDescription),
    sacCode: clean(input.sacCode),
    paymentTermsId: input.paymentTermsId,
    paymentTermsLabel: payload.paymentTermsLabel,
    remarks: clean(input.remarks),
    gstMode: totals.mode,
    gstApplicable: input.gstApplicable,
    isReverseCharge: input.isReverseCharge,
    subtotal: money2(totals.subtotal),
    discountTotal: money2(totals.discountTotal),
    taxableValue: money2(totals.taxableValue),
    cgstAmount: money2(totals.cgstAmount),
    sgstAmount: money2(totals.sgstAmount),
    igstAmount: money2(totals.igstAmount),
    roundOff: money2(totals.roundOff),
    total: money2(totals.total),
    amountInWords: amountInWords(totals.total),
    updatedById: actor.id,
    updatedAt: new Date(),
  };
}

/** Which statuses may still be edited. A generated tax invoice may not. */
export function isEditable(doc: Pick<BillingDocument, "status" | "docType">): boolean {
  if (doc.status === "cancelled" || doc.status === "converted" || doc.status === "paid") return false;
  if (doc.status === "draft") return true;
  // Quotations and proformas stay editable after generation; a GST document
  // does not — corrections happen by cancel + reissue.
  return doc.docType !== "tax_invoice";
}

// ── Create / update ────────────────────────────────────────────────────────

export async function saveBillingDocument(
  input: BillingDocumentParsed,
  actor: BillingActor,
): Promise<CoreResult<{ id: string }>> {
  /* KYC FIRST. A document is only ever raised against a customer that went
     through New Customer KYC — so Bill To is required, and it must be a live
     (not deleted, not deactivated) row in the Customer Master. Checked here,
     the one path every save takes, not only in the form. */
  if (!input.customerId) {
    return {
      ok: false,
      error: "Select the customer in Bill To. A new customer must be onboarded in New Customer KYC first.",
    };
  }
  const [billTo] = await db
    .select({ isActive: billingCustomers.isActive, deletedAt: billingCustomers.deletedAt })
    .from(billingCustomers)
    .where(eq(billingCustomers.id, input.customerId))
    .limit(1);
  if (!billTo || billTo.deletedAt) {
    return {
      ok: false,
      error: "That customer is not in the Customer Master. Onboard them in New Customer KYC first.",
    };
  }
  if (!billTo.isActive) {
    return { ok: false, error: "That customer is deactivated. Activate them in the Customer Master to bill them." };
  }

  const payload = await buildDocumentPayload(input);

  if (input.id) {
    const [existing] = await db
      .select()
      .from(billingDocuments)
      .where(eq(billingDocuments.id, input.id))
      .limit(1);
    if (!existing) return { ok: false, error: "That document no longer exists." };
    if (!isEditable(existing)) {
      return {
        ok: false,
        error:
          existing.docType === "tax_invoice" && existing.status !== "draft"
            ? "A generated tax invoice cannot be edited. Cancel it and reissue instead."
            : `A ${existing.status} document cannot be edited.`,
      };
    }
    // The type of an already-numbered document is fixed: its number came out of
    // that type's series.
    if (existing.docNo && existing.docType !== input.docType) {
      return { ok: false, error: "A numbered document cannot change its type. Convert it instead." };
    }

    const id = input.id;
    await db.transaction(async (tx) => {
      await tx
        .update(billingDocuments)
        .set(documentColumns(input, payload, actor))
        .where(eq(billingDocuments.id, id));
      await tx.delete(billingDocumentLines).where(eq(billingDocumentLines.documentId, id));
      await tx.insert(billingDocumentLines).values(payload.lines.map((l) => ({ ...l, documentId: id })));
      await recordEvent(tx, id, actor.id, "updated", { total: payload.totals.total });
    });
    return { ok: true, id };
  }

  const id = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(billingDocuments)
      .values({
        ...documentColumns(input, payload, actor),
        status: "draft",
        sourceDocumentId: input.sourceDocumentId,
        createdById: actor.id,
      })
      .returning({ id: billingDocuments.id });
    const newId = row!.id;
    await tx.insert(billingDocumentLines).values(payload.lines.map((l) => ({ ...l, documentId: newId })));
    await recordEvent(tx, newId, actor.id, "created", { docType: input.docType });
    return newId;
  });

  return { ok: true, id };
}

// ── Generate ───────────────────────────────────────────────────────────────

/**
 * Validate completeness, take the next number in the series and stamp the
 * document `generated` — all in one transaction, so a failure here gives the
 * number back rather than leaving a hole in the series.
 */
export async function generateBillingDocument(
  id: string,
  actor: BillingActor,
): Promise<CoreResult<{ docNo: string }>> {
  const [doc] = await db.select().from(billingDocuments).where(eq(billingDocuments.id, id)).limit(1);
  if (!doc) return { ok: false, error: "That document no longer exists." };
  if (doc.status === "cancelled") return { ok: false, error: "This document is cancelled." };
  if (doc.docNo) return { ok: true, docNo: doc.docNo };

  const lines = await db
    .select({ id: billingDocumentLines.id })
    .from(billingDocumentLines)
    .where(eq(billingDocumentLines.documentId, id));

  const blockers = generateBlockers({
    docType: doc.docType,
    customerName: doc.customerName,
    lines,
    total: Number(doc.total),
    sellerGstin: doc.sellerSnapshot?.gstin ?? null,
    placeOfSupplyCode: doc.placeOfSupplyCode,
  });
  if (blockers.length > 0) return { ok: false, error: blockers[0]! };

  try {
    const docNo = await db.transaction(async (tx) => {
      const allocated = await allocateDocNo(tx, {
        entityId: doc.entityId,
        docType: doc.docType,
        docDate: doc.docDate,
      });
      await tx
        .update(billingDocuments)
        .set({
          docNo: allocated.docNo,
          seq: allocated.seq,
          finYear: allocated.finYear,
          status: "generated",
          generatedAt: new Date(),
          updatedById: actor.id,
          updatedAt: new Date(),
        })
        .where(eq(billingDocuments.id, id));
      await recordEvent(tx, id, actor.id, "generated", { docNo: allocated.docNo });
      return allocated.docNo;
    });
    return { ok: true, docNo };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not generate the document." };
  }
}

// ── Convert ────────────────────────────────────────────────────────────────

/**
 * Quotation → Proforma → Tax Invoice.
 *
 * The child is a NEW draft carrying everything forward — customer, snapshots,
 * lines, GST, terms, remarks — linked back by `sourceDocumentId`. The source is
 * marked `converted` and is never edited, renumbered or deleted.
 */
export async function convertBillingDocument(
  sourceId: string,
  toType: BillingDocType,
  actor: BillingActor,
): Promise<CoreResult<{ id: string }>> {
  const [source] = await db
    .select()
    .from(billingDocuments)
    .where(eq(billingDocuments.id, sourceId))
    .limit(1);
  if (!source) return { ok: false, error: "That document no longer exists." };
  if (source.status === "cancelled") return { ok: false, error: "A cancelled document cannot be converted." };
  if (!source.docNo) return { ok: false, error: "Generate this document before converting it." };
  if (!canConvert(source.docType, toType)) {
    return { ok: false, error: `A ${source.docType.replace(/_/g, " ")} cannot become a ${toType.replace(/_/g, " ")}.` };
  }

  const [existingChild] = await db
    .select({ id: billingDocuments.id, docNo: billingDocuments.docNo })
    .from(billingDocuments)
    .where(and(eq(billingDocuments.sourceDocumentId, sourceId), ne(billingDocuments.status, "cancelled")))
    .limit(1);
  if (existingChild) {
    return {
      ok: false,
      error: `This document has already been converted${existingChild.docNo ? ` to ${existingChild.docNo}` : ""}.`,
    };
  }

  const sourceLines = await db
    .select()
    .from(billingDocumentLines)
    .where(eq(billingDocumentLines.documentId, sourceId));

  const docDate = todayISO();
  const [term] = source.paymentTermsId
    ? await db
        .select()
        .from(billingPaymentTerms)
        .where(eq(billingPaymentTerms.id, source.paymentTermsId))
        .limit(1)
    : [null];

  try {
    const id = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(billingDocuments)
        .values({
          docType: toType,
          finYear: financialYear(docDate),
          docDate,
          dueDate: dueDateFor(docDate, term?.dueDays ?? null),
          status: "draft",
          entityId: source.entityId,
          entityProfileId: source.entityProfileId,
          sellerSnapshot: source.sellerSnapshot,
          customerId: source.customerId,
          customerSnapshot: source.customerSnapshot,
          customerName: source.customerName,
          customerContactName: source.customerContactName,
          customerEmail: source.customerEmail,
          customerWhatsapp: source.customerWhatsapp,
          customerGstin: source.customerGstin,
          placeOfSupplyState: source.placeOfSupplyState,
          placeOfSupplyCode: source.placeOfSupplyCode,
          serviceDescription: source.serviceDescription,
          sacCode: source.sacCode,
          paymentTermsId: source.paymentTermsId,
          paymentTermsLabel: source.paymentTermsLabel,
          remarks: source.remarks,
          gstMode: source.gstMode,
          gstApplicable: source.gstApplicable,
          isReverseCharge: source.isReverseCharge,
          subtotal: source.subtotal,
          discountTotal: source.discountTotal,
          taxableValue: source.taxableValue,
          cgstAmount: source.cgstAmount,
          sgstAmount: source.sgstAmount,
          igstAmount: source.igstAmount,
          roundOff: source.roundOff,
          total: source.total,
          amountInWords: source.amountInWords,
          sourceDocumentId: source.id,
          sourceDocNo: source.docNo,
          sourceDocType: source.docType,
          createdById: actor.id,
        })
        .returning({ id: billingDocuments.id });
      const newId = row!.id;

      if (sourceLines.length > 0) {
        await tx.insert(billingDocumentLines).values(
          sourceLines.map((l) => ({
            documentId: newId,
            productId: l.productId,
            code: l.code,
            name: l.name,
            description: l.description,
            sacCode: l.sacCode,
            hsnCode: l.hsnCode,
            quantity: l.quantity,
            unit: l.unit,
            rate: l.rate,
            discountPct: l.discountPct,
            discountAmount: l.discountAmount,
            amount: l.amount,
            gstRate: l.gstRate,
            cgstAmount: l.cgstAmount,
            sgstAmount: l.sgstAmount,
            igstAmount: l.igstAmount,
            lineTotal: l.lineTotal,
            sortOrder: l.sortOrder,
          })),
        );
      }

      // The source is frozen, not consumed: it keeps its number and its trail.
      await tx
        .update(billingDocuments)
        .set({ status: "converted", updatedById: actor.id, updatedAt: new Date() })
        .where(eq(billingDocuments.id, sourceId));

      await recordEvent(tx, newId, actor.id, "converted", {
        from: source.docNo,
        fromType: source.docType,
      });
      await recordEvent(tx, sourceId, actor.id, "converted", { toType, childId: newId });
      return newId;
    });
    return { ok: true, id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not convert the document." };
  }
}

// ── Lifecycle ──────────────────────────────────────────────────────────────

/**
 * ARCHIVE or RESTORE a document (migration 0231).
 *
 * "Stop showing me this", and nothing more. It is NOT `cancel`: a cancelled
 * document was withdrawn and is void, while an archived one is still exactly
 * as issued and still counts — a paid invoice from two years ago is a legal
 * record. Nothing in this module deletes a document, and this does not either.
 *
 * Any status can be archived, including a draft: an abandoned half-typed
 * quotation is the most common thing anyone wants off the list.
 *
 * Re-archiving keeps the ORIGINAL `archived_at`, so "filed away last March"
 * stays true if someone toggles it twice.
 */
export async function setBillingDocumentArchived(
  id: string,
  archived: boolean,
  actor: BillingActor,
): Promise<CoreResult> {
  const [doc] = await db
    .select({ id: billingDocuments.id, archived: billingDocuments.archived, archivedAt: billingDocuments.archivedAt })
    .from(billingDocuments)
    .where(eq(billingDocuments.id, id))
    .limit(1);
  if (!doc) return { ok: false, error: "That document no longer exists." };
  if (doc.archived === archived) return { ok: true };

  await db
    .update(billingDocuments)
    .set({
      archived,
      archivedAt: archived ? (doc.archivedAt ?? new Date()) : null,
      updatedById: actor.id,
      updatedAt: new Date(),
    })
    .where(eq(billingDocuments.id, id));
  return { ok: true };
}

export async function cancelBillingDocument(
  id: string,
  reason: string,
  actor: BillingActor,
): Promise<CoreResult> {
  const [doc] = await db.select().from(billingDocuments).where(eq(billingDocuments.id, id)).limit(1);
  if (!doc) return { ok: false, error: "That document no longer exists." };
  if (doc.status === "cancelled") return { ok: true };

  await db.transaction(async (tx) => {
    await tx
      .update(billingDocuments)
      .set({
        status: "cancelled",
        cancelledAt: new Date(),
        cancelReason: reason,
        updatedById: actor.id,
        updatedAt: new Date(),
      })
      .where(eq(billingDocuments.id, id));
    // Cancelling a child frees its source to be converted again.
    if (doc.sourceDocumentId) {
      await tx
        .update(billingDocuments)
        .set({ status: "generated", updatedAt: new Date() })
        .where(and(eq(billingDocuments.id, doc.sourceDocumentId), eq(billingDocuments.status, "converted")));
    }
    await recordEvent(tx, id, actor.id, "cancelled", { reason });
  });
  return { ok: true };
}

export async function markBillingDocumentPaid(
  id: string,
  paidAmount: number,
  paidAt: string,
  actor: BillingActor,
): Promise<CoreResult> {
  const [doc] = await db.select().from(billingDocuments).where(eq(billingDocuments.id, id)).limit(1);
  if (!doc) return { ok: false, error: "That document no longer exists." };
  if (doc.status === "cancelled") return { ok: false, error: "A cancelled document cannot be marked paid." };
  if (!doc.docNo) return { ok: false, error: "Generate this document before recording a payment." };

  await db.transaction(async (tx) => {
    await tx
      .update(billingDocuments)
      .set({
        status: "paid",
        paidAt: new Date(`${paidAt}T00:00:00.000Z`),
        paidAmount: money2(paidAmount),
        updatedById: actor.id,
        updatedAt: new Date(),
      })
      .where(eq(billingDocuments.id, id));
    await recordEvent(tx, id, actor.id, "paid", { paidAmount, paidAt });
  });
  return { ok: true };
}

/**
 * Stamp a document sent. Called by the email path AFTER a successful send.
 *
 * The status is decided in SQL rather than read-then-written, so emailing a
 * document a second time can never walk a `paid` row back to `sent`.
 */
export async function markBillingDocumentSent(
  id: string,
  to: string,
  actor: BillingActor,
): Promise<void> {
  await db
    .update(billingDocuments)
    .set({
      status: sql`case when ${billingDocuments.status} in ('paid','cancelled','converted')
                       then ${billingDocuments.status} else 'sent' end`,
      sentAt: new Date(),
      lastSentTo: to,
      updatedById: actor.id,
      updatedAt: new Date(),
    })
    .where(eq(billingDocuments.id, id));
}
