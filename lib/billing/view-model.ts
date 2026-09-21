/**
 * BILLING — one description of a printed document, read by two renderers.
 *
 * The on-screen preview (components/billing/invoice-view.tsx) and the PDF
 * (lib/billing/invoice-pdf.ts) both consume `buildInvoiceViewModel`, which is
 * the only way to be sure that what the user approves on screen is what the
 * customer receives. Any field that appears in one and not the other is a bug
 * in this file, not in a renderer.
 *
 * PURE — client-safe, no DB, no pdfkit.
 */

import { BILLING_DOC_TYPE_LABELS, type BillingDocType, type BillingGstMode } from "@/db/enums";
import type {
  BillingCustomerSnapshot,
  BillingDocument,
  BillingDocumentLine,
  BillingSellerSnapshot,
} from "@/db/schema";
import { fmtRate, round2 } from "@/lib/billing/tax";
/**
 * The letter in front of the Code, per document type.
 *
 * Deliberately NOT derived from the label's first character: "Proforma Invoice"
 * and "Tax Invoice" both begin with letters that collide with each other or
 * with Quotation once abbreviated, and two document types sharing a code is
 * exactly the confusion the prefix exists to prevent.
 */
const DOC_CODE_PREFIX: Record<BillingDocType, string> = {
  quotation: "Q",
  proforma_invoice: "P",
  tax_invoice: "I",
};

import { sellerBankRows } from "@/lib/billing/seller";

export interface InvoiceLineVM {
  index: number;
  name: string;
  description: string | null;
  code: string | null;
  sacCode: string | null;
  quantity: number;
  unit: string | null;
  rate: number;
  discountAmount: number;
  gstRate: number;
  amount: number;
}

export interface LabelledValue {
  label: string;
  value: string;
}

export interface InvoiceViewModel {
  /** "TAX INVOICE" / "PROFORMA INVOICE" / "QUOTATION". */
  title: string;
  docType: BillingDocType;
  /* NO RIDER (2026-09-20). A quotation carried "This is a quotation, not a
     tax invoice. Prices are valid subject to confirmation." and a proforma
     "This is not a tax invoice. It is a proforma issued for advance
     reference."; both were dropped by name. The title printed at the top of
     the sheet — QUOTATION, PROFORMA INVOICE, TAX INVOICE — is what says which
     document this is, and it said it first. */
  status: BillingDocument["status"];

  seller: BillingSellerSnapshot;
  customer: BillingCustomerSnapshot;

  /** The right-hand meta column: Code / Invoice No / Invoice Date / Due Date. */
  meta: LabelledValue[];
  /** The left-hand address block: To / Kind Attn. / Address / Contact / GSTIN. */
  billTo: LabelledValue[];

  serviceDescription: string | null;
  /**
   * False when the description is simply the line's own name — the reference
   * document prints "Fees for Technical Services" once, not above itself.
   */
  showServiceDescription: boolean;
  lines: InvoiceLineVM[];
  /** True when every line is a bare service with no quantity/rate worth showing
   *  — the reference document prints a single "Service Description / Amount"
   *  pair rather than a five-column grid. */
  isSimpleService: boolean;
  /**
   * The NOUN in that pair's first caption: "Service", "Product", or
   * "Product / Service" when the document carries both.
   *
   * Manan, 2026-09-20: "if i select product then i want service description
   * place i want product description." A line picked as Product on the form
   * carries a `productId`; one picked as Service does not. The caption was
   * hardcoded to Service, so a document of products was labelled as services.
   *
   * The renderers compose the caption themselves — the PDF breaks it over two
   * lines, the email keeps it on one — so only the noun lives here.
   */
  descriptionNoun: "Service" | "Product" | "Product / Service";

  subtotal: number;
  discountTotal: number;
  taxableValue: number;
  taxRows: LabelledValue[];
  roundOff: number;
  total: number;
  amountInWords: string;
  gstMode: BillingGstMode;

  /** Amount in words · PAN · GSTIN · SAC — the block under the totals ladder. */
  identityRows: LabelledValue[];
  /** Bank + payment terms + interest clause. */
  paymentRows: LabelledValue[];
  interestClause: string | null;

  remarks: string | null;
  lineage: string | null;
  footerNote: string | null;
  /** "Altus Corp · +91 … · manan@… · www.…" */
  contactLine: string;
  /** The same parts unjoined. The printed footer sets a red ▶ between them, so
   *  it needs the pieces rather than one pre-joined string. */
  contactParts: string[];
}

const num = (v: string | number | null | undefined): number => {
  if (v === null || v === undefined) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const clean = (v: string | null | undefined): string | null => {
  const t = v?.trim();
  return t ? t : null;
};

/** "01 Jan 2026" without pulling a date library into a client bundle. */
export function fmtDocDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${String(d).padStart(2, "0")} ${MONTHS[m - 1]} ${y}`;
}

/** Indian grouping, always 2dp — every figure on a document is tabular. */
export function fmtMoney(n: number): string {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function customerAddressLines(c: BillingCustomerSnapshot): string[] {
  const cityBits = [c.city, c.stateName, c.pincode].filter(Boolean).join(", ");
  return [c.addressLine1, c.addressLine2, cityBits || null]
    .map(clean)
    .filter((v): v is string => Boolean(v));
}

export function buildInvoiceViewModel(
  document: BillingDocument,
  lines: BillingDocumentLine[],
): InvoiceViewModel {
  const seller = document.sellerSnapshot;
  const customer = document.customerSnapshot;
  const title = BILLING_DOC_TYPE_LABELS[document.docType].toUpperCase();

  const vmLines: InvoiceLineVM[] = lines.map((l, i) => ({
    index: i + 1,
    name: l.name,
    // A SERVICE line carries the service text as both its name and its
    // description; printing it twice ("Fees … — Fees …") is noise.
    description: clean(l.description) === l.name.trim() ? null : clean(l.description),
    code: clean(l.code),
    sacCode: clean(l.sacCode),
    quantity: num(l.quantity),
    unit: clean(l.unit),
    rate: num(l.rate),
    discountAmount: num(l.discountAmount),
    gstRate: num(l.gstRate),
    amount: num(l.amount),
  }));

  // The reference document is a single professional-fees line: one row, qty 1,
  // no discount. When that is the shape, print it that way rather than padding
  // a grid with "1" and a repeated rate.
  //
  // SERVICE DOCUMENTS use it by definition: a line picked as "Service" on the
  // form has no product behind it, so a document made only of those prints
  // as Service Description / Total Amount Due (Manan's reference template).
  // Guarded by qty 1 / no discount so an older typed-in line with a real
  // quantity keeps its grid.
  const isSimpleService =
    vmLines.length > 0 &&
    vmLines.every(
      (l, i) => l.quantity === 1 && l.discountAmount === 0 && (!l.unit || !lines[i]!.productId),
    );

  /* Products and services are told apart by `productId`, which only a line
     picked as Product on the form has. A mixed document says so rather than
     picking one of the two and mislabelling the other half. */
  const anyProduct = lines.some((l) => Boolean(l.productId));
  const anyService = lines.some((l) => !l.productId);
  const descriptionNoun: InvoiceViewModel["descriptionNoun"] =
    anyProduct && anyService ? "Product / Service" : anyProduct ? "Product" : "Service";

  const meta: LabelledValue[] = [];
  if (document.docNo) {
    // CODE CARRIES THE TYPE LETTER; the number below it does not.
    //
    // Manan, 2026-09-16: "there is a code — so if the tax invoice, then code
    // front I want I55, like that for rest one." On the reference invoice both
    // rows read 55/26-27, which makes Code a duplicate of the number and tells
    // the reader nothing. Prefixed, one glance at the Code says which of the
    // three documents this is — I55/26-27 could not be mistaken for the
    // quotation Q55/26-27 that preceded it, and the two stay in step because
    // both are the same underlying series number.
    meta.push({ label: "Code", value: `${DOC_CODE_PREFIX[document.docType]}${document.docNo}` });
    meta.push({ label: `${BILLING_DOC_TYPE_LABELS[document.docType]} No`, value: document.docNo });
  } else {
    meta.push({ label: "Number", value: "Draft — assigned on generate" });
  }
  meta.push({
    label: `${BILLING_DOC_TYPE_LABELS[document.docType]} Date`,
    value: fmtDocDate(document.docDate),
  });
  // NO DUE DATE ROW. Asked for by name ("don't add due date in template") and
  // the reference invoice has none: the payment terms further down already say
  // when it is owed ("Immediate"), so a second, derived date beside the invoice
  // date is a fact that can disagree with the terms it was computed from.
  // `document.dueDate` is still STORED and still drives the overdue badge in
  // the list — it is only absent from the printed sheet.

  const billTo: LabelledValue[] = [
    { label: "To", value: clean(customer.legalName) ?? customer.name },
  ];
  if (customer.contactName) billTo.push({ label: "Kind Attn.", value: customer.contactName });
  const addr = customerAddressLines(customer);
  if (addr.length > 0) billTo.push({ label: "Address", value: addr.join("\n") });
  const phone = clean(customer.phone) ?? clean(customer.whatsapp);
  if (phone) billTo.push({ label: "Contact No.", value: phone });
  // NO EMAIL ROW. The reference addresses the customer with five lines — To,
  // Kind Attn., Address, Contact No., GSTIN — and an email printed among them
  // is a sixth that shifts every row below it. The address is still held on the
  // customer and is still what the Email screen sends to; it is simply not part
  // of this sheet.
  billTo.push({ label: "GSTIN", value: customer.gstin ?? "Unregistered" });

  // THE THREE-ROW LADDER, exactly as the reference prints it:
  //
  //   CGST@9%    6,750.00
  //   SGST@9%    6,750.00
  //   IGST@18%       0.00
  //
  // All three ALWAYS, whenever GST applies at all — including the one that does
  // not. That is the opposite of what this block used to do (it printed only
  // the applicable pair, on the reasoning that a 0.00 row reads as a mistake),
  // and the reference settles it: the reader is checking an invoice against a
  // shape they know, and a sheet with two tax rows where they expect three
  // raises the question of which one was dropped and why.
  //
  // A document with NO GST still prints no rows at all — that is the separate
  // "if no GST → no GST lines" rule from the brief, and it is about a customer
  // who is not registered, not about which half of a registered charge applies.
  const taxRowsOut: LabelledValue[] = [];
  const rates = [...new Set(vmLines.filter((l) => l.amount > 0 && l.gstRate > 0).map((l) => l.gstRate))];
  const singleRate = rates.length === 1 ? rates[0]! : null;
  const half = singleRate !== null ? `@${fmtRate(singleRate / 2)}%` : "";
  const full = singleRate !== null ? `@${fmtRate(singleRate)}%` : "";
  if (document.gstMode === "cgst_sgst" || document.gstMode === "igst") {
    taxRowsOut.push({ label: `CGST${half}`, value: fmtMoney(num(document.cgstAmount)) });
    taxRowsOut.push({ label: `SGST${half}`, value: fmtMoney(num(document.sgstAmount)) });
    taxRowsOut.push({ label: `IGST${full}`, value: fmtMoney(num(document.igstAmount)) });
  } else if (document.gstMode === "exempt") {
    taxRowsOut.push({ label: "GST (exempt) @ 0%", value: fmtMoney(0) });
  }

  const identityRows: LabelledValue[] = [];
  if (document.amountInWords) {
    identityRows.push({ label: "Total Amount in Words", value: document.amountInWords });
  }
  if (seller.pan) identityRows.push({ label: "Permanent Account Number", value: seller.pan });
  if (seller.gstin) identityRows.push({ label: "GSTIN", value: seller.gstin });
  const sac = clean(document.sacCode) ?? clean(vmLines.find((l) => l.sacCode)?.sacCode ?? null);
  if (sac) identityRows.push({ label: "SAC Code", value: sac });

  const paymentRows: LabelledValue[] = sellerBankRows(seller);
  if (document.paymentTermsLabel) {
    paymentRows.push({ label: "Payment Terms", value: document.paymentTermsLabel });
  }

  const lineage =
    document.sourceDocNo && document.sourceDocType
      ? `Ref: ${BILLING_DOC_TYPE_LABELS[document.sourceDocType]} No. ${document.sourceDocNo}`
      : null;

  const contactParts = [seller.phone, seller.email, seller.website]
    .map(clean)
    .filter((v): v is string => Boolean(v));
  const contactLine = contactParts.join("  ·  ");

  return {
    title,
    docType: document.docType,
    status: document.status,
    seller,
    customer,
    meta,
    billTo,
    serviceDescription: clean(document.serviceDescription),
    showServiceDescription:
      Boolean(clean(document.serviceDescription)) &&
      !vmLines.some((l) => l.name.trim() === clean(document.serviceDescription)),
    lines: vmLines,
    isSimpleService,
    descriptionNoun,
    subtotal: num(document.subtotal),
    discountTotal: num(document.discountTotal),
    taxableValue: num(document.taxableValue),
    taxRows: taxRowsOut,
    roundOff: round2(num(document.roundOff)),
    total: num(document.total),
    amountInWords: document.amountInWords ?? "",
    gstMode: document.gstMode,
    identityRows,
    paymentRows,
    contactParts,
    interestClause: clean(seller.interestClause),
    remarks: clean(document.remarks),
    lineage,
    footerNote: clean(seller.invoiceFooterNote),
    contactLine,
  };
}

/** `Tax-Invoice-10004-26-27-Acme.pdf` — safe on every filesystem and mail client. */
export function invoiceFilename(document: Pick<BillingDocument, "docType" | "docNo" | "customerName" | "id">): string {
  const type = BILLING_DOC_TYPE_LABELS[document.docType].replace(/\s+/g, "-");
  const no = document.docNo ?? `draft-${document.id.slice(0, 8)}`;
  const who = document.customerName.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 40);
  return `${type}-${no}${who ? `-${who}` : ""}.pdf`;
}
