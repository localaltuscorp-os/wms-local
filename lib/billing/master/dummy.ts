/**
 * THE DUMMY ADMIN MASTER — billing's stand-in until the real one is filled.
 *
 * Manan, 2026-09-16: "do in that already have billing module section and admin
 * master create inside the billing module just for fetching data from there,
 * and also once my sir add all data to original admin master then I will remove
 * the dummy one and then fetch the data from already have admin master."
 *
 * WHAT THIS IS NOT. It is not a second billing system and not a mock layer the
 * UI knows about. The Admin Master already exists — five screens under
 * /admin/billing-* writing five real tables — and the billing module already
 * reads them. The only thing missing is ROWS: nobody has entered the company
 * profile, the customers, the payment terms or the SAC codes yet, so every
 * dropdown in the billing form opens empty and no invoice can be raised.
 *
 * So this supplies those rows, and nothing else.
 *
 * EVERY RECORD IS TYPED AS THE REAL TABLE ROW — `BillingCustomer`,
 * `BillingPaymentTerm`, `BillingSacCode`, `BillingEntityProfile`. Not a
 * lookalike interface, the actual `$inferSelect` type. That is the whole design:
 * nothing downstream can tell a dummy row from an admin-entered one, so no
 * component, query, tax calculation or PDF field had to be written twice, and
 * none of them has to change when this goes away.
 *
 * HOW IT GOES AWAY. See ./index.ts — the resolver prefers the real table and
 * only falls back per-master when that table is empty. So the day the company
 * profile is entered in the Admin Panel, the real profile wins on the next
 * request, with nothing to deploy. When all five are filled, deleting this file
 * and the fallbacks in lib/queries/billing-documents.ts is the entire removal.
 *
 * THE VALUES come from the handwritten notes and the sample Tax Invoice. They
 * are DEVELOPMENT DATA, and two of them are worth flagging to whoever enters
 * the real ones:
 *   · the bank account number reads 6812028980 on the sample invoice, but the
 *     brief transcribed it as 681208980 (one digit shorter). The invoice image
 *     is used here; confirm before anyone banks on it.
 *   · the sample shows PAN "ACPPV 1393 L" spaced and GSTIN 27ACPPV1393L1ZQ,
 *     which agree with each other. The brief also lists a second PAN,
 *     ACPPV1393L, for the same company — same value, different spacing.
 */

import type {
  BillingCustomer,
  BillingEntityProfile,
  BillingPaymentTerm,
  BillingSacCode,
} from "@/db/schema";
import type { BillableProduct } from "./types";

/** Stable ids so a draft saved against a dummy row still resolves after a
 *  reload. Prefixed and obviously synthetic — they are never written to the
 *  database, and a stray one in a saved document is greppable. */
const id = (n: string) => `dummy-${n}`;

const NOW = new Date(0);

/** Fields every real row carries that mean nothing for a synthetic one. */
const AUDIT = {
  createdAt: NOW,
  updatedAt: NOW,
  createdById: null,
  updatedById: null,
} as const;

/* ───────────────────────── COMPANY · BANK · SIGNATURE ─────────────────────
 *
 * One row per issuing entity, keyed by the slug from lib/hr/entities.ts. Only
 * Altus Corp is filled in: it is the one the sample invoice is drawn on, and
 * inventing a GSTIN or a bank account for the other four entities would put
 * fabricated tax identifiers on a document that prints as if they were real.
 * The others resolve to name + logo from the registry and cannot issue a tax
 * invoice until someone enters their PAN and GSTIN — which is the correct
 * refusal, not a gap.
 */
export const DUMMY_ENTITY_PROFILES: BillingEntityProfile[] = [
  {
    ...AUDIT,
    id: id("entity-altus-corp"),
    entityId: "altus-corp",
    payingEntityId: null,
    legalName: "Altus Corp",
    pan: "ACPPV1393L",
    gstin: "27ACPPV1393L1ZQ",
    // 27 is Maharashtra. This is what decides CGST+SGST vs IGST against the
    // customer's state — see lib/billing/tax.ts.
    stateName: "Maharashtra",
    stateCode: "27",
    addressLine: "Sacred Space, C-6, Gambhir Estates, Kotkar Road, Goregaon (E), Mumbai 63",
    email: "manan@altuscorp.in",
    whatsapp: "+918097010410",
    phone: "+91 80970 10410",
    website: "www.altuscorp.in",
    // The mark Manan supplied (images/image.png, installed as
    // public/logos/altus-corp.png) — the red chevron with ALTUS CORP set
    // beneath it, exactly as it appears on the reference invoice.
    logoUrl: "/logos/altus-corp.png",
    bankName: "Kotak Mahindra Bank",
    bankAccountName: "Altus Corp (Current Account)",
    bankAccountNo: "6812028980",
    bankIfsc: "KKBK0000646",
    bankBranch: "Malad East, Mumbai 400097",
    upiId: null,
    defaultSacCode: "998311",
    signatoryName: null,
    // NULL although the signatory IS the proprietor — because the signature
    // image below already has the word "Proprietor" written into it, under the
    // hand-signed line, and the PDF draws this designation as a separate line
    // beneath that image. Setting it would print "Proprietor" twice, one above
    // the other. The reference invoice shows it once, from the image.
    signatoryDesignation: null,
    signatureImageUrl: "/signatures/altus-corp.png",
    defaultPaymentTermsId: id("term-immediate"),
    interestClause:
      "Interest will be charged at 24% p.a. at actuals for delay in payment after due date.",
    invoiceFooterNote: null,
    isActive: true,
  },
];

/* ───────────────────────────── PAYMENT TERMS ─────────────────────────────
 * "Payment Terms: DD" in the notes. `dueDays: null` means no computable due
 * date, which is why "Against Documents" is not 0 — 0 would print a due date of
 * the invoice date and start the interest clock. */
export const DUMMY_PAYMENT_TERMS: BillingPaymentTerm[] = [
  { ...AUDIT, id: id("term-immediate"), label: "Immediate", dueDays: 0, isDefault: true, isActive: true, sortOrder: 10 },
  { ...AUDIT, id: id("term-7"), label: "7 Days", dueDays: 7, isDefault: false, isActive: true, sortOrder: 20 },
  { ...AUDIT, id: id("term-15"), label: "15 Days", dueDays: 15, isDefault: false, isActive: true, sortOrder: 30 },
  { ...AUDIT, id: id("term-30"), label: "30 Days", dueDays: 30, isDefault: false, isActive: true, sortOrder: 40 },
  { ...AUDIT, id: id("term-45"), label: "45 Days", dueDays: 45, isDefault: false, isActive: true, sortOrder: 50 },
  { ...AUDIT, id: id("term-dp"), label: "Against Documents", dueDays: null, isDefault: false, isActive: true, sortOrder: 60 },
];

/* ─────────────────────────────── SAC CODES ───────────────────────────────
 * 998311 is the one on the sample invoice; the rest are the neighbouring
 * professional-services codes so the dropdown is a real choice rather than a
 * single fixed value wearing a dropdown's clothes. */
export const DUMMY_SAC_CODES: BillingSacCode[] = [
  { ...AUDIT, id: id("sac-998311"), code: "998311", description: "Fees for Technical Services", defaultGstRate: "18.00", isActive: true, sortOrder: 10 },
  { ...AUDIT, id: id("sac-998312"), code: "998312", description: "Business consulting services", defaultGstRate: "18.00", isActive: true, sortOrder: 20 },
  { ...AUDIT, id: id("sac-998314"), code: "998314", description: "Engineering advisory services", defaultGstRate: "18.00", isActive: true, sortOrder: 30 },
  { ...AUDIT, id: id("sac-998221"), code: "998221", description: "Accounting and bookkeeping services", defaultGstRate: "18.00", isActive: true, sortOrder: 40 },
  { ...AUDIT, id: id("sac-998222"), code: "998222", description: "Financial auditing services", defaultGstRate: "18.00", isActive: true, sortOrder: 50 },
  { ...AUDIT, id: id("sac-999293"), code: "999293", description: "Commercial training and coaching", defaultGstRate: "18.00", isActive: true, sortOrder: 60 },
];

/* ──────────────────────────── PRODUCT / SERVICE ───────────────────────────
 * "Product Code → Admin Panel", with PS0 / B350 / B355 / R10 / LOM / Billing in
 * the margin. These resolve through `outstanding_products` in the real system
 * (the billing columns on the product master), so the dummy rows are shaped as
 * `BillableProduct` — the projection the form actually consumes. */
export const DUMMY_PRODUCTS: BillableProduct[] = [
  { id: id("prod-ps0"), code: "PS0", name: "Professional Services", description: "Fees for Technical Services", sacCode: "998311", defaultRate: "75000.00", defaultGstRate: "18.00" },
  { id: id("prod-b350"), code: "B350", name: "Business Advisory — Standard", description: "Business consulting and advisory retainer", sacCode: "998312", defaultRate: "35000.00", defaultGstRate: "18.00" },
  { id: id("prod-b355"), code: "B355", name: "Business Advisory — Extended", description: "Extended business consulting retainer", sacCode: "998312", defaultRate: "55000.00", defaultGstRate: "18.00" },
  { id: id("prod-r10"), code: "R10", name: "Retainer — Monthly", description: "Monthly professional retainer", sacCode: "998311", defaultRate: "25000.00", defaultGstRate: "18.00" },
  { id: id("prod-lom"), code: "LOM", name: "Letter of Management", description: "Preparation of management representation letter", sacCode: "998222", defaultRate: "15000.00", defaultGstRate: "18.00" },
  { id: id("prod-billing"), code: "BILLING", name: "Billing & Accounting Support", description: "Bookkeeping and billing support services", sacCode: "998221", defaultRate: "18000.00", defaultGstRate: "18.00" },
  { id: id("prod-train"), code: "TRN", name: "Training & Coaching", description: "Commercial training and coaching programme", sacCode: "999293", defaultRate: "40000.00", defaultGstRate: "18.00" },
];

/* ───────────────────────────── CUSTOMERS ─────────────────────────────────
 * The entity list from the notes. ANANT AVINYA is complete because the sample
 * invoice gives every field; the rest carry only what the notes actually say.
 *
 * DELIBERATELY UNEVEN. Several have no GSTIN — Parvez Khan, Dattaram Kap and
 * the two Rauts are named as people, not registered firms. That is not missing
 * data to be filled in with a plausible-looking number: an unregistered
 * customer is the case the tax rules have to handle (no GST lines at all, per
 * "if no GST → no GST lines" in the notes), and a dummy master where every
 * customer is registered would hide that path completely.
 */
const customer = (
  c: Partial<BillingCustomer> & Pick<BillingCustomer, "id" | "name">,
): BillingCustomer => ({
  ...AUDIT,
  legalName: null,
  contactName: null,
  email: null,
  whatsapp: null,
  businessCategory: null,
  natureOfBusiness: null,
  linkedinUrl: null,
  instagramHandle: null,
  subscription: null,
  emi: null,
  moduleWisePayment: null,
  introducer: null,
  phone: null,
  pan: null,
  gstin: null,
  addressLine1: null,
  addressLine2: null,
  city: null,
  stateName: null,
  stateCode: null,
  pincode: null,
  country: "India",
  clientId: null,
  outstandingEntityId: null,
  notes: null,
  isActive: true,

  /* The KYC fields (migration 0233). Empty rather than invented: the notes
     this fixture is built from say nothing about anyone's grade, credit limit
     or sales person, and a dummy master that guessed at them would put figures
     on screen that look like data and are not. The arrays are `[]` because the
     columns are NOT NULL — a customer with no tags has no tags, not unknown
     ones. */
  clientCode: null,
  grade: null,
  tags: [],
  customerTypes: [],
  industryTypes: [],
  productTypes: [],
  salesPersonId: null,
  isExport: false,
  msmeNo: null,
  gstRegType: null,
  currency: "INR",
  paymentTerms: null,
  freightCharges: null,
  creditDays: null,
  creditLimit: null,
  transporter: null,
  quantityDeviation: null,
  otherReferences: null,
  deletedAt: null,
  deletedById: null,
  ...c,
});

export const DUMMY_CUSTOMERS: BillingCustomer[] = [
  customer({
    id: id("cust-anant-avinya"),
    name: "Anant Avinya Technologies LLP",
    legalName: "ANANT AVINYA TECHNOLOGIES LLP",
    contactName: "Rajiv Sheth",
    phone: "9833288638",
    whatsapp: "9833288638",
    gstin: "27ACEFA9263B1ZJ",
    // Derived from the GSTIN's first two digits, not typed separately — same
    // state as the seller, so this customer bills CGST + SGST.
    stateName: "Maharashtra",
    stateCode: "27",
    addressLine1: "A299, Mahape MIDC",
    addressLine2: "Next to Gajanan Chemicals",
    city: "Navi Mumbai",
  }),
  customer({
    id: id("cust-anavs"),
    name: "ANAVS Corp",
    legalName: "ANAVS CORP",
    stateName: "Maharashtra",
    stateCode: "27",
    city: "Mumbai",
  }),
  customer({
    id: id("cust-unleashed"),
    name: "Unleashed",
    contactName: "Manan Vasa",
    email: "manan@unleashed.in",
    stateName: "Maharashtra",
    stateCode: "27",
    city: "Mumbai",
  }),
  customer({
    id: id("cust-perfect-blend"),
    name: "The Perfect Blend",
    stateName: "Maharashtra",
    stateCode: "27",
    city: "Mumbai",
  }),
  customer({
    id: id("cust-legacy-creators"),
    name: "Legacy Creators",
    stateName: "Maharashtra",
    stateCode: "27",
    city: "Mumbai",
  }),
  customer({
    id: id("cust-gainmakers"),
    name: "Gainmakers",
    stateName: "Maharashtra",
    stateCode: "27",
    city: "Mumbai",
  }),
  // ── Individuals. No GSTIN on purpose; see the note above. ────────────────
  customer({ id: id("cust-parvez-khan"), name: "Parvez Khan", contactName: "Parvez Khan", stateName: "Maharashtra", stateCode: "27", city: "Mumbai" }),
  customer({ id: id("cust-dattaram-kap"), name: "Dattaram Kap", contactName: "Dattaram Kap", stateName: "Maharashtra", stateCode: "27", city: "Mumbai" }),
  customer({ id: id("cust-smita-raut"), name: "Smita Raut", contactName: "Smita Raut", stateName: "Maharashtra", stateCode: "27", city: "Mumbai" }),
  customer({ id: id("cust-sunil-raut"), name: "Sunil Raut", contactName: "Sunil Raut", stateName: "Maharashtra", stateCode: "27", city: "Mumbai" }),
];

/** Every dummy id in one place, so a caller can ask whether a saved document is
 *  pointing at synthetic master data. */
export function isDummyMasterId(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith("dummy-");
}

/* ───────────────────── FIELD-LEVEL DETAIL FOR REAL ROWS ──────────────────
 *
 * Manan, 2026-09-16, against the Customers table on Billing → Admin Master
 * showing a column of "unregistered" and dashes: "add this also dummy".
 *
 * THE PROBLEM THE PER-MASTER RULE CREATES. `withDummyFallback` is all-or-
 * nothing per master, and the customers table HAS rows — so the real ones win
 * and DUMMY_CUSTOMERS above is never reached. But those real rows are names and
 * nothing else: no contact, no GSTIN, no state, no phone. A customer with no
 * state cannot be given GST at all (the CGST/SGST-vs-IGST decision is seller
 * state vs place of supply), so every invoice raised against them comes out with
 * no tax lines and the whole tax engine is untestable.
 *
 * So detail — and ONLY detail — falls back per FIELD. A real value is never
 * overwritten; only a null one is filled.
 *
 * ── THE FABRICATED GSTIN, AND WHY IT SAYS "DUMMY" ────────────────────────
 * This is the hazard I flagged when the per-master rule was written: a real
 * customer row carrying an invented tax identifier, on a document that prints
 * as a real tax invoice, is a filing problem rather than a cosmetic one. A
 * plausible-looking 27ABCDE1234F1Z5 would be indistinguishable from a real
 * GSTIN at a glance and would survive right through to a PDF.
 *
 * So the synthetic ones are built to be UNMISTAKABLE: `27DUMMY0001X1ZZ`. Still
 * fifteen characters, still parses, still exercises every code path that reads
 * a GSTIN — and nobody reads that on an invoice and thinks it is real. Known
 * customers from the handwritten notes keep their real-looking identifiers,
 * because those came from Manan rather than from this file.
 */

const norm = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");

/** The notes' customers, by normalised name — their detail is from the brief. */
const KNOWN_DETAIL = new Map(DUMMY_CUSTOMERS.map((c) => [norm(c.name), c]));

/** A stable small integer from a name, so a given customer always gets the same
 *  synthetic identifiers instead of new ones on every render. */
function nameSeed(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 9973;
  return h;
}

/**
 * Fill a customer's EMPTY fields from the dummy set. Never overwrites.
 *
 * Returns the row unchanged when it is already complete, so a fully-entered
 * customer is untouched and `enrichedAnyCustomer` below reports false for it.
 */
export function withDummyCustomerDetail(c: BillingCustomer): BillingCustomer {
  const known = KNOWN_DETAIL.get(norm(c.name));
  const seed = nameSeed(c.name);
  const four = String(seed).padStart(4, "0").slice(-4);

  const fallback = {
    contactName: known?.contactName ?? c.name,
    // See the note above: obviously synthetic by construction.
    gstin: known?.gstin ?? `27DUMMY${four}X1ZZ`,
    pan: known?.pan ?? `DUMMY${four}X`,
    stateName: known?.stateName ?? "Maharashtra",
    stateCode: known?.stateCode ?? "27",
    phone: known?.phone ?? `90000${four}0`,
    whatsapp: known?.whatsapp ?? `90000${four}0`,
    email: known?.email ?? `${norm(c.name).slice(0, 18) || "customer"}@example.invalid`,
    addressLine1: known?.addressLine1 ?? "Sample address line 1",
    addressLine2: known?.addressLine2 ?? null,
    city: known?.city ?? "Mumbai",
    pincode: known?.pincode ?? "400097",
  };

  return {
    ...c,
    contactName: c.contactName ?? fallback.contactName,
    gstin: c.gstin ?? fallback.gstin,
    pan: c.pan ?? fallback.pan,
    stateName: c.stateName ?? fallback.stateName,
    stateCode: c.stateCode ?? fallback.stateCode,
    phone: c.phone ?? fallback.phone,
    whatsapp: c.whatsapp ?? fallback.whatsapp,
    email: c.email ?? fallback.email,
    addressLine1: c.addressLine1 ?? fallback.addressLine1,
    addressLine2: c.addressLine2 ?? fallback.addressLine2,
    city: c.city ?? fallback.city,
    pincode: c.pincode ?? fallback.pincode,
  };
}

/**
 * Is any row carrying synthetic detail? Drives the "Sample data" badge.
 *
 * Detected from the MARKER in the value, not from a null, because by the time
 * anything reads these rows `withDummyCustomerDetail` has already run and there
 * are no nulls left to count. That is also why the synthetic identifiers spell
 * DUMMY: it makes them self-describing to the code as well as to the reader.
 */
export function enrichedAnyCustomer(
  rows: Pick<BillingCustomer, "id" | "gstin" | "pan">[],
): boolean {
  return rows.some(
    (c) =>
      isDummyMasterId(c.id) ||
      (c.gstin?.includes("DUMMY") ?? false) ||
      (c.pan?.includes("DUMMY") ?? false),
  );
}

/* ─────────────────────────── EMAIL CONFIGURATION ─────────────────────────
 *
 * "BCC → admin@unleashed.in, CC → manan@unleashed.in" in the handwritten
 * notes, restated by Manan on 2026-09-16: these are the DEFAULTS the compose
 * screen opens with, not a fixed routing rule — the sender can edit or clear
 * either before sending.
 *
 * WHY THIS IS MASTER DATA AND NOT TWO CONSTANTS IN THE COMPOSER. Who is copied
 * on every outgoing invoice is an accounting policy, and it changes when the
 * person handling the books changes. Put it in the component and the next
 * change is a code edit and a deploy; put it here and it moves with the rest of
 * the Admin Master — which is where the brief already filed it, under "Email
 * Configuration".
 *
 * There is no `billing_email_config` table yet, so unlike the five masters
 * above this one has no real row to be overtaken by. When that table arrives,
 * the swap is the same shape: read it, and fall back to this.
 */
export interface BillingEmailConfig {
  /** Copied openly — the sender sees these on every document they send. */
  cc: string;
  /** Copied silently — the audit trail, not a participant in the thread. */
  bcc: string;
}

export const DUMMY_EMAIL_CONFIG: BillingEmailConfig = {
  cc: "manan@unleashed.in",
  bcc: "admin@unleashed.in",
};
