import "server-only";
import { and, asc, desc, eq, gte, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  billingCustomerAddresses,
  billingCustomerContacts,
  billingCustomers,
  billingDocumentEvents,
  billingDocumentLines,
  billingDocuments,
  billingEmailLog,
  billingEntityProfiles,
  billingLookups,
  billingPaymentTerms,
  billingSacCodes,
  billingSeriesDefaults,
  employees,
  orgSettings,
  outstandingProducts,
  type BillingCustomer,
  type BillingDocument,
  type BillingDocumentLine,
  type BillingEntityProfile,
  type BillingPaymentTerm,
  type BillingSacCode,
} from "@/db/schema";
import type { BillingDocType } from "@/db/enums";
import { financialYearRange, todayISO, CONVERSION_TARGETS } from "@/lib/billing/numbering";
import { buildSellerSnapshot } from "@/lib/billing/seller";
import type { BillingListFilters } from "@/lib/validators/billing";
import type { BillableProduct } from "@/lib/billing/master/types";
import {
  withDummyCustomerDetail,
  withDummyFallback,
  DUMMY_CUSTOMERS,
  DUMMY_ENTITY_PROFILES,
  DUMMY_PAYMENT_TERMS,
  DUMMY_PRODUCTS,
  DUMMY_SAC_CODES,
} from "@/lib/billing/master";
import type { BillingSellerSnapshot } from "@/db/schema";

/**
 * BILLING — the read side of the document engine.
 *
 * Deliberately a NEW file. `lib/queries/billing.ts` is the Google-Sheets revenue
 * ledger behind the existing `/billing` landing page and is left alone; the two
 * coexist in one room.
 *
 * Everything here batches. A list page issues a fixed number of queries no
 * matter how many rows it shows — the creator names and line counts arrive by
 * id list, never per row.
 */

export interface BillingDocumentRow {
  id: string;
  docType: BillingDocType;
  docNo: string | null;
  finYear: string;
  docDate: string;
  dueDate: string | null;
  status: BillingDocument["status"];
  entityId: string;
  customerId: string | null;
  customerName: string;
  customerEmail: string | null;
  taxableValue: number;
  taxTotal: number;
  total: number;
  gstMode: BillingDocument["gstMode"];
  createdByName: string | null;
  sourceDocNo: string | null;
  sourceDocType: BillingDocType | null;
  /** Derived, never stored: issued, unpaid and past its due date. */
  isOverdue: boolean;
  sentAt: Date | null;
  archived: boolean;
}

const num = (v: string | number | null | undefined): number => {
  if (v === null || v === undefined) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function whereFromFilters(f: Partial<BillingListFilters>) {
  const clauses = [];
  // ARCHIVED IS OUT BY DEFAULT and only ever shown on its own (migration 0231).
  // Mixing filed documents back into the working list would undo the point of
  // filing them; the toggle swaps the list rather than widening it.
  clauses.push(eq(billingDocuments.archived, f.archived === true));
  // EVERY FILTER TAKES A LIST. An empty one is no filter at all, which is what
  // the single-value versions meant by null and what the pills mean by nothing
  // ticked - so "show everything" survives the change untouched.
  if (f.type?.length) clauses.push(inArray(billingDocuments.docType, f.type));
  if (f.status?.length) clauses.push(inArray(billingDocuments.status, f.status));
  if (f.customerId?.length) clauses.push(inArray(billingDocuments.customerId, f.customerId));
  if (f.entityId?.length) clauses.push(inArray(billingDocuments.entityId, f.entityId));
  if (f.finYear?.length) {
    // Several financial years are several DATE RANGES, so they combine with OR
    // - unlike the other filters, where one column is matched against a set.
    // Anded with `from`/`to` below, which is what the year pills above the list
    // already narrow to.
    const ranges = f.finYear.map((y) => {
      const { from, to } = financialYearRange(y);
      return and(gte(billingDocuments.docDate, from), lte(billingDocuments.docDate, to))!;
    });
    clauses.push(ranges.length === 1 ? ranges[0]! : or(...ranges)!);
  }
  if (f.from) clauses.push(gte(billingDocuments.docDate, f.from));
  if (f.to) clauses.push(lte(billingDocuments.docDate, f.to));
  if (f.q) {
    const like = `%${f.q.toLowerCase()}%`;
    clauses.push(
      or(
        sql`lower(coalesce(${billingDocuments.docNo}, '')) like ${like}`,
        sql`lower(${billingDocuments.customerName}) like ${like}`,
        sql`lower(coalesce(${billingDocuments.remarks}, '')) like ${like}`,
        sql`lower(coalesce(${billingDocuments.serviceDescription}, '')) like ${like}`,
      )!,
    );
  }
  return clauses.length > 0 ? and(...clauses) : undefined;
}

export async function listBillingDocuments(
  filters: Partial<BillingListFilters> = {},
  opts: { limit?: number; offset?: number } = {},
): Promise<{ rows: BillingDocumentRow[]; total: number }> {
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 300);
  const offset = Math.max(opts.offset ?? 0, 0);
  const where = whereFromFilters(filters);

  const [rows, countRows] = await Promise.all([
    db
      .select({
        id: billingDocuments.id,
        docType: billingDocuments.docType,
        docNo: billingDocuments.docNo,
        finYear: billingDocuments.finYear,
        docDate: billingDocuments.docDate,
        dueDate: billingDocuments.dueDate,
        status: billingDocuments.status,
        entityId: billingDocuments.entityId,
        customerId: billingDocuments.customerId,
        customerName: billingDocuments.customerName,
        customerEmail: billingDocuments.customerEmail,
        taxableValue: billingDocuments.taxableValue,
        cgst: billingDocuments.cgstAmount,
        sgst: billingDocuments.sgstAmount,
        igst: billingDocuments.igstAmount,
        total: billingDocuments.total,
        gstMode: billingDocuments.gstMode,
        sourceDocNo: billingDocuments.sourceDocNo,
        sourceDocType: billingDocuments.sourceDocType,
        sentAt: billingDocuments.sentAt,
        archived: billingDocuments.archived,
        archivedAt: billingDocuments.archivedAt,
        createdByName: employees.name,
      })
      .from(billingDocuments)
      .leftJoin(employees, eq(employees.id, billingDocuments.createdById))
      .where(where)
      .orderBy(desc(billingDocuments.docDate), desc(billingDocuments.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(billingDocuments)
      .where(where),
  ]);

  const today = todayISO();
  return {
    total: countRows[0]?.n ?? 0,
    rows: rows.map((r) => ({
      id: r.id,
      docType: r.docType,
      docNo: r.docNo,
      finYear: r.finYear,
      docDate: r.docDate,
      dueDate: r.dueDate,
      status: r.status,
      entityId: r.entityId,
      customerId: r.customerId,
      customerName: r.customerName,
      customerEmail: r.customerEmail,
      taxableValue: num(r.taxableValue),
      taxTotal: num(r.cgst) + num(r.sgst) + num(r.igst),
      total: num(r.total),
      gstMode: r.gstMode,
      createdByName: r.createdByName ?? null,
      sourceDocNo: r.sourceDocNo,
      sourceDocType: r.sourceDocType,
      sentAt: r.sentAt,
      archived: r.archived === true,
      isOverdue:
        (r.status === "generated" || r.status === "sent") && !!r.dueDate && r.dueDate < today,
    })),
  };
}

export interface BillingSummary {
  byType: Record<BillingDocType, { count: number; value: number }>;
  outstandingValue: number;
  outstandingCount: number;
  overdueValue: number;
  overdueCount: number;
  paidValue: number;
}

/** The tiles above the list — one grouped query, not one query per tile. */
export async function billingSummary(
  filters: Partial<BillingListFilters> = {},
): Promise<BillingSummary> {
  const where = whereFromFilters(filters);
  const rows = await db
    .select({
      docType: billingDocuments.docType,
      status: billingDocuments.status,
      dueDate: billingDocuments.dueDate,
      total: billingDocuments.total,
    })
    .from(billingDocuments)
    .where(where);

  const today = todayISO();
  const byType = {
    quotation: { count: 0, value: 0 },
    proforma_invoice: { count: 0, value: 0 },
    tax_invoice: { count: 0, value: 0 },
  } as BillingSummary["byType"];

  let outstandingValue = 0;
  let outstandingCount = 0;
  let overdueValue = 0;
  let overdueCount = 0;
  let paidValue = 0;

  for (const r of rows) {
    const value = num(r.total);
    const bucket = byType[r.docType];
    if (bucket && r.status !== "cancelled") {
      bucket.count += 1;
      bucket.value += value;
    }
    if (r.status === "generated" || r.status === "sent") {
      outstandingValue += value;
      outstandingCount += 1;
      if (r.dueDate && r.dueDate < today) {
        overdueValue += value;
        overdueCount += 1;
      }
    }
    if (r.status === "paid") paidValue += value;
  }

  return { byType, outstandingValue, outstandingCount, overdueValue, overdueCount, paidValue };
}

export interface BillingDocumentDetail {
  document: BillingDocument;
  lines: BillingDocumentLine[];
  events: { id: string; eventType: string; meta: Record<string, unknown> | null; createdAt: Date; actorName: string | null }[];
  emails: { id: string; recipient: string; subject: string; status: string; error: string | null; sentAt: Date }[];
  /** The document this one was converted FROM. */
  source: { id: string; docNo: string | null; docType: BillingDocType; status: string } | null;
  /** The document converted FROM this one (at most one live child). */
  child: { id: string; docNo: string | null; docType: BillingDocType; status: string } | null;
  createdByName: string | null;
}

export async function getBillingDocument(id: string): Promise<BillingDocumentDetail | null> {
  const [document] = await db.select().from(billingDocuments).where(eq(billingDocuments.id, id)).limit(1);
  if (!document) return null;

  const [lines, events, emails, children, creator] = await Promise.all([
    db
      .select()
      .from(billingDocumentLines)
      .where(eq(billingDocumentLines.documentId, id))
      .orderBy(asc(billingDocumentLines.sortOrder), asc(billingDocumentLines.createdAt)),
    db
      .select({
        id: billingDocumentEvents.id,
        eventType: billingDocumentEvents.eventType,
        meta: billingDocumentEvents.meta,
        createdAt: billingDocumentEvents.createdAt,
        actorName: employees.name,
      })
      .from(billingDocumentEvents)
      .leftJoin(employees, eq(employees.id, billingDocumentEvents.actorId))
      .where(eq(billingDocumentEvents.documentId, id))
      .orderBy(desc(billingDocumentEvents.createdAt))
      .limit(60),
    db
      .select({
        id: billingEmailLog.id,
        recipient: billingEmailLog.recipient,
        subject: billingEmailLog.subject,
        status: billingEmailLog.status,
        error: billingEmailLog.error,
        sentAt: billingEmailLog.sentAt,
      })
      .from(billingEmailLog)
      .where(eq(billingEmailLog.documentId, id))
      .orderBy(desc(billingEmailLog.sentAt))
      .limit(25),
    db
      .select({
        id: billingDocuments.id,
        docNo: billingDocuments.docNo,
        docType: billingDocuments.docType,
        status: billingDocuments.status,
      })
      .from(billingDocuments)
      .where(
        and(eq(billingDocuments.sourceDocumentId, id), ne(billingDocuments.status, "cancelled")),
      )
      .limit(1),
    document.createdById
      ? db
          .select({ name: employees.name })
          .from(employees)
          .where(eq(employees.id, document.createdById))
          .limit(1)
      : Promise.resolve([] as { name: string }[]),
  ]);

  let source: BillingDocumentDetail["source"] = null;
  if (document.sourceDocumentId) {
    const [row] = await db
      .select({
        id: billingDocuments.id,
        docNo: billingDocuments.docNo,
        docType: billingDocuments.docType,
        status: billingDocuments.status,
      })
      .from(billingDocuments)
      .where(eq(billingDocuments.id, document.sourceDocumentId))
      .limit(1);
    source = row ?? null;
  }

  return {
    document,
    lines,
    events,
    emails,
    source,
    child: children[0] ?? null,
    createdByName: creator[0]?.name ?? null,
  };
}

// ── Masters the form reads ─────────────────────────────────────────────────

export async function listBillingCustomers(includeInactive = false): Promise<BillingCustomer[]> {
  const rows = await db
    .select()
    .from(billingCustomers)
    .where(includeInactive ? undefined : eq(billingCustomers.isActive, true))
    .orderBy(asc(billingCustomers.name));
  // TWO fallbacks, at two levels.
  //   · No customers at all → the whole dummy set.
  //   · Customers that exist but are NAMES ONLY → their empty fields filled,
  //     per field, never overwriting anything real. Without this a real
  //     customer has no state, and with no state there is no GST decision to
  //     make, so every invoice comes out untaxed.
  return withDummyFallback(rows, DUMMY_CUSTOMERS).map(withDummyCustomerDetail);
}

// Declared in lib/billing/master/types.ts and re-exported here so the existing
// imports of this name keep working. It moved to break an import CYCLE — see
// that file; the cycle made this module hang at evaluation.
// The `import` is separate because `export … from` re-exports without binding
// the name locally, and the signatures below use it.
export type { BillableProduct } from "@/lib/billing/master/types";

export async function listBillableProducts(): Promise<BillableProduct[]> {
  const rows = await db
    .select({
      id: outstandingProducts.id,
      name: outstandingProducts.name,
      code: outstandingProducts.code,
      description: outstandingProducts.description,
      sacCode: outstandingProducts.sacCode,
      defaultRate: outstandingProducts.defaultRate,
      defaultGstRate: outstandingProducts.defaultGstRate,
    })
    .from(outstandingProducts)
    .where(and(eq(outstandingProducts.isActive, true), eq(outstandingProducts.isBillable, true)))
    .orderBy(asc(outstandingProducts.sortOrder), asc(outstandingProducts.name));
  return withDummyFallback(rows, DUMMY_PRODUCTS);
}

export async function listPaymentTerms(includeInactive = false): Promise<BillingPaymentTerm[]> {
  const rows = await db
    .select()
    .from(billingPaymentTerms)
    .where(includeInactive ? undefined : eq(billingPaymentTerms.isActive, true))
    .orderBy(asc(billingPaymentTerms.sortOrder), asc(billingPaymentTerms.label));
  return withDummyFallback(rows, DUMMY_PAYMENT_TERMS);
}

export async function listSacCodes(includeInactive = false): Promise<BillingSacCode[]> {
  const rows = await db
    .select()
    .from(billingSacCodes)
    .where(includeInactive ? undefined : eq(billingSacCodes.isActive, true))
    .orderBy(asc(billingSacCodes.sortOrder), asc(billingSacCodes.code));
  return withDummyFallback(rows, DUMMY_SAC_CODES);
}

export async function listEntityBillingProfiles(): Promise<BillingEntityProfile[]> {
  const rows = await db
    .select()
    .from(billingEntityProfiles)
    .orderBy(asc(billingEntityProfiles.entityId));
  return withDummyFallback(rows, DUMMY_ENTITY_PROFILES);
}

export async function getEntityBillingProfile(
  entityId: string,
): Promise<BillingEntityProfile | null> {
  const [row] = await db
    .select()
    .from(billingEntityProfiles)
    .where(eq(billingEntityProfiles.entityId, entityId))
    .limit(1);
  if (row) return row;
  // No profile for this entity. The fallback is looked up BY ENTITY, so an
  // entity the dummy master does not describe stays null and the seller block
  // falls back to the code registry — rather than borrowing Altus Corp's PAN,
  // GSTIN and bank account, which is the one mistake this must never make.
  const [dummy] = withDummyFallback([], DUMMY_ENTITY_PROFILES).filter(
    (p) => p.entityId === entityId,
  );
  return dummy ?? null;
}

/** The resolved, printable seller block for one entity (registry + profile). */
export async function resolveSellerSnapshot(entityId: string): Promise<BillingSellerSnapshot> {
  const [profile, [org]] = await Promise.all([
    getEntityBillingProfile(entityId),
    db.select({ logoUrl: orgSettings.logoUrl }).from(orgSettings).limit(1),
  ]);
  return buildSellerSnapshot(entityId, profile, org?.logoUrl ?? null);
}

/** Every entity's resolved seller block, keyed by id — the form's company card
 *  switches between these without a round trip. */
export async function resolveAllSellerSnapshots(
  entityIds: string[],
): Promise<Record<string, BillingSellerSnapshot>> {
  const [profiles, [org]] = await Promise.all([
    db.select().from(billingEntityProfiles).where(inArray(billingEntityProfiles.entityId, entityIds)),
    db.select({ logoUrl: orgSettings.logoUrl }).from(orgSettings).limit(1),
  ]);
  // Per ENTITY, not per query: a real profile for one entity must not suppress
  // the dummy profile for another, or filling in Unleashed would blank out
  // Altus Corp's bank details mid-changeover.
  const byId = new Map(profiles.map((p) => [p.entityId, p]));
  for (const d of withDummyFallback([], DUMMY_ENTITY_PROFILES)) {
    if (!byId.has(d.entityId)) byId.set(d.entityId, d);
  }
  const out: Record<string, BillingSellerSnapshot> = {};
  for (const id of entityIds) {
    out[id] = buildSellerSnapshot(id, byId.get(id) ?? null, org?.logoUrl ?? null);
  }
  return out;
}

export interface ConvertibleSource {
  id: string;
  docNo: string | null;
  docType: BillingDocType;
  docDate: string;
  customerName: string;
  total: number;
}

/**
 * Documents that may still be converted INTO `toType`: live, un-cancelled, and
 * without a live child already. Excluding the already-converted is what stops a
 * quotation being billed twice.
 */
export async function listConvertibleSources(toType: BillingDocType): Promise<ConvertibleSource[]> {
  const fromTypes = (Object.keys(CONVERSION_TARGETS) as BillingDocType[]).filter((t) =>
    CONVERSION_TARGETS[t].includes(toType),
  );
  if (fromTypes.length === 0) return [];

  const child = db
    .select({ sourceId: billingDocuments.sourceDocumentId })
    .from(billingDocuments)
    .where(
      and(
        sql`${billingDocuments.sourceDocumentId} is not null`,
        ne(billingDocuments.status, "cancelled"),
      ),
    );

  const rows = await db
    .select({
      id: billingDocuments.id,
      docNo: billingDocuments.docNo,
      docType: billingDocuments.docType,
      docDate: billingDocuments.docDate,
      customerName: billingDocuments.customerName,
      total: billingDocuments.total,
    })
    .from(billingDocuments)
    .where(
      and(
        inArray(billingDocuments.docType, fromTypes),
        inArray(billingDocuments.status, ["generated", "sent", "paid"]),
        sql`${billingDocuments.id} not in ${child}`,
      ),
    )
    .orderBy(desc(billingDocuments.docDate))
    .limit(100);

  return rows.map((r) => ({ ...r, total: num(r.total) }));
}

/** Everything the create/edit form needs, in one round trip. */
export async function getBillingFormData(entityIds: string[]) {
  /* SEQUENTIAL on purpose. Firing all five (each with its own child queries)
     at once against the Supabase pooler repeatedly left one statement stalled
     or cancelled ("statement timeout", ECONNRESET) and the New Document page
     stuck on "Loading…". Each read is tens of milliseconds; in a row they are
     still well under a second. */
  // Bill To offers ONLY Customer Master rows — a customer is onboarded in
  // New Customer KYC before anything can be billed to them.
  const customers = await listBillToCustomers();
  const products = await listBillableProducts();
  const terms = await listPaymentTerms();
  const sacCodes = await listSacCodes();
  const sellers = await resolveAllSellerSnapshots(entityIds);
  return { customers, products, terms, sacCodes, sellers };
}

/**
 * The SERVICE list for a document line — the Service Description master (the
 * `service_description` lookup list) first, then any
 * description already used on a past document, de-duplicated.
 */
export async function listServiceDescriptions(limit = 40): Promise<string[]> {
  let master: { value: string }[] = [];
  try {
    master = await db
      .select({ value: billingLookups.value })
      .from(billingLookups)
      .where(
        and(
          eq(billingLookups.kind, "service_description"),
          eq(billingLookups.active, true),
          isNull(billingLookups.deletedAt),
        ),
      )
      .orderBy(asc(billingLookups.sortOrder), asc(billingLookups.value));
  } catch {
    master = [];
  }
  const used = await db
    .selectDistinct({ value: billingDocuments.serviceDescription })
    .from(billingDocuments)
    .where(sql`${billingDocuments.serviceDescription} is not null and ${billingDocuments.serviceDescription} <> ''`)
    .limit(limit);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of [...master.map((m) => m.value), ...used.map((u) => u.value ?? "")]) {
    const t = v.trim();
    if (t && !seen.has(t.toLowerCase())) {
      seen.add(t.toLowerCase());
      out.push(t);
    }
  }
  return out;
}

export async function listSeriesDefaults() {
  return db
    .select()
    .from(billingSeriesDefaults)
    .orderBy(asc(billingSeriesDefaults.entityId), asc(billingSeriesDefaults.docType));
}

/* ─────────────────── Bill To — the New Document form ───────────────────── */

export interface BillToCustomer {
  id: string;
  name: string;
  legalName: string | null;
  clientCode: string | null;
  contactName: string | null;
  contactDesignation: string | null;
  email: string | null;
  whatsapp: string | null;
  phone: string | null;
  pan: string | null;
  gstin: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  stateName: string | null;
  stateCode: string | null;
  pincode: string | null;
  paymentTerms: string | null;
  creditDays: string | null;
  shippingAddress: string | null;
}

/**
 * Lives HERE, not in lib/queries/billing-customers.ts: importing that module
 * from this one made the New Document page hang forever at module load (the
 * import-cycle trap described above `BillableProduct`).
 *
 * THE ONLY CUSTOMERS A DOCUMENT CAN BE RAISED AGAINST — live Customer Master
 * rows (onboarded through New Customer KYC, not deleted, not deactivated).
 * Deliberately no dummy fallback: an empty master means "onboard a customer
 * first", not a list of made-up ones.
 *
 * The primary KYC contact wins over the flat `contact_name`, and the first
 * shipping address rides along so the form can show where goods go.
 */
export async function listBillToCustomers(): Promise<BillToCustomer[]> {
  const rows = await db
    .select()
    .from(billingCustomers)
    .where(and(isNull(billingCustomers.deletedAt), eq(billingCustomers.isActive, true)))
    .orderBy(asc(billingCustomers.name));
  if (rows.length === 0) return [];

  /* ONE AT A TIME, and only for these customers. Firing the two child reads
     in parallel with the rest of the New Document page's queries left one of
     them stalled on the pooler connection (active / ClientRead in
     pg_stat_activity) and the page on "Loading…" forever. */
  const ids = rows.map((r) => r.id);
  const contacts = await db
    .select()
    .from(billingCustomerContacts)
    .where(inArray(billingCustomerContacts.customerId, ids))
    .orderBy(asc(billingCustomerContacts.sortOrder));
  const shipping = await db
    .select()
    .from(billingCustomerAddresses)
    .where(
      and(
        inArray(billingCustomerAddresses.customerId, ids),
        eq(billingCustomerAddresses.kind, "shipping"),
      ),
    )
    .orderBy(asc(billingCustomerAddresses.sortOrder));
  const primary = new Map<string, (typeof contacts)[number]>();
  for (const c of contacts) if (!primary.has(c.customerId)) primary.set(c.customerId, c);
  const ship = new Map<string, string>();
  for (const a of shipping) {
    if (ship.has(a.customerId)) continue;
    const text = [a.line1, a.line2, a.line3, a.line4, [a.city, a.stateName, a.pincode].filter(Boolean).join(", ")]
      .filter(Boolean)
      .join(", ");
    if (text) ship.set(a.customerId, text);
  }

  return rows.map((r) => {
    const p = primary.get(r.id);
    const contactName = p ? [p.firstName, p.lastName].filter(Boolean).join(" ").trim() : "";
    return {
      id: r.id,
      name: r.name,
      legalName: r.legalName,
      clientCode: r.clientCode,
      contactName: contactName || r.contactName,
      contactDesignation: p?.designation ?? null,
      email: p?.email || r.email,
      whatsapp: r.whatsapp,
      phone: p?.phone || r.phone,
      pan: r.pan,
      gstin: r.gstin,
      addressLine1: r.addressLine1,
      addressLine2: r.addressLine2,
      city: r.city,
      stateName: r.stateName,
      stateCode: r.stateCode,
      pincode: r.pincode,
      paymentTerms: r.paymentTerms,
      creditDays: r.creditDays,
      shippingAddress: ship.get(r.id) ?? null,
    };
  });
}
