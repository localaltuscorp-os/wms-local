// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import type { BillingDocument, BillingDocumentLine } from "@/db/schema";
import { buildInvoiceViewModel, invoiceFilename } from "@/lib/billing/view-model";
import { InvoiceView } from "@/components/billing/invoice-view";

/**
 * THE PREVIEW IS THE INVOICE.
 *
 * The screen and the PDF are fed by one `buildInvoiceViewModel`, so what is
 * asserted here is what the customer receives. Every claim below is one the
 * brief makes and that arithmetic tests cannot check:
 *
 *   · a non-GST document prints NO tax rows — not a row of 0.00
 *   · the tax labels carry HALF the rate intra-state and the full rate across
 *     a state line
 *   · an unregistered customer prints "Unregistered", not a blank
 *   · the service description is not printed above a line of the same name
 *   · the seller's PAN, GSTIN, bank and signatory come off the snapshot
 *   · a quotation says, in as many words, that it is not a tax invoice
 */

const SELLER = {
  entityId: "altus-corp",
  displayName: "Altus Corp",
  legalName: "Altus Corp",
  pan: "ACPPV1393L",
  gstin: "27ACPPV1393L1ZQ",
  stateName: "Maharashtra",
  stateCode: "27",
  addressLine: "Sacred Space, C-6, Goregaon (E), Mumbai 63",
  email: "billing@example.com",
  phone: "+91 80970 10410",
  whatsapp: null,
  website: "www.example.com",
  logoUrl: null,
  bankName: "Kotak Mahindra Bank",
  bankAccountName: "Altus Corp (Current Account)",
  bankAccountNo: "6812028980",
  bankIfsc: "KKBK0000646",
  bankBranch: "Malad East",
  upiId: null,
  signatoryName: "The Proprietor",
  signatoryDesignation: "Proprietor",
  signatureImageUrl: null,
  interestClause: "Interest at 24% p.a. after the due date.",
  invoiceFooterNote: null,
};

const CUSTOMER = {
  name: "Anant Avinya Technologies LLP",
  legalName: null,
  contactName: "The Director",
  email: "accounts@example.com",
  whatsapp: "+919833288638",
  phone: null,
  pan: null,
  gstin: "27ACEFA9263B1ZJ",
  addressLine1: "A299, Mahape MIDC",
  addressLine2: null,
  city: "Navi Mumbai",
  stateName: "Maharashtra",
  stateCode: "27",
  pincode: "400710",
  country: "India",
};

function doc(over: Partial<BillingDocument> = {}): BillingDocument {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    docType: "tax_invoice",
    docNo: "10001-26-27",
    finYear: "26-27",
    seq: 10001,
    docDate: "2026-08-03",
    dueDate: "2026-08-03",
    status: "generated",
    entityId: "altus-corp",
    entityProfileId: null,
    sellerSnapshot: SELLER,
    customerId: null,
    customerSnapshot: CUSTOMER,
    customerName: CUSTOMER.name,
    customerContactName: CUSTOMER.contactName,
    customerEmail: CUSTOMER.email,
    customerWhatsapp: CUSTOMER.whatsapp,
    customerGstin: CUSTOMER.gstin,
    placeOfSupplyState: "Maharashtra",
    placeOfSupplyCode: "27",
    serviceDescription: "Fees for Technical Services",
    sacCode: "998311",
    paymentTermsId: null,
    paymentTermsLabel: "Immediate",
    remarks: null,
    gstMode: "cgst_sgst",
    gstApplicable: true,
    isReverseCharge: false,
    subtotal: "75000.00",
    discountTotal: "0.00",
    taxableValue: "75000.00",
    cgstAmount: "6750.00",
    sgstAmount: "6750.00",
    igstAmount: "0.00",
    roundOff: "0.00",
    total: "88500.00",
    amountInWords: "Rupees Eighty Eight Thousand Five Hundred Only",
    currency: "INR",
    sourceDocumentId: null,
    sourceDocNo: null,
    sourceDocType: null,
    generatedAt: new Date(),
    sentAt: null,
    lastSentTo: null,
    paidAt: null,
    paidAmount: null,
    cancelledAt: null,
    cancelReason: null,
    pdfStoragePath: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdById: null,
    updatedById: null,
    ...over,
  } as BillingDocument;
}

function line(over: Partial<BillingDocumentLine> = {}): BillingDocumentLine {
  return {
    id: "00000000-0000-0000-0000-0000000000a1",
    documentId: "00000000-0000-0000-0000-000000000001",
    productId: null,
    code: null,
    name: "Fees for Technical Services",
    description: null,
    sacCode: "998311",
    hsnCode: null,
    quantity: "1",
    unit: null,
    rate: "75000.00",
    discountPct: null,
    discountAmount: "0.00",
    amount: "75000.00",
    gstRate: "18.00",
    cgstAmount: "6750.00",
    sgstAmount: "6750.00",
    igstAmount: "0.00",
    lineTotal: "88500.00",
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  } as BillingDocumentLine;
}

function show(d: BillingDocument, lines: BillingDocumentLine[]) {
  render(<InvoiceView vm={buildInvoiceViewModel(d, lines)} />);
}

afterEach(cleanup);

describe("InvoiceView — an intra-state tax invoice", () => {
  it("prints the title, number, parties and the halved tax labels", () => {
    show(doc(), [line()]);
    expect(screen.getByText("TAX INVOICE")).toBeTruthy();
    expect(screen.getAllByText("10001-26-27").length).toBeGreaterThan(0);
    expect(screen.getByText("Anant Avinya Technologies LLP")).toBeTruthy();
    expect(screen.getByText("The Director")).toBeTruthy();
    expect(screen.getByText("27ACEFA9263B1ZJ")).toBeTruthy();
    expect(screen.getByText("CGST@9%")).toBeTruthy();
    expect(screen.getByText("SGST@9%")).toBeTruthy();
    expect(screen.getByText("Total Amount Payable")).toBeTruthy();
    expect(screen.getByText("88,500.00")).toBeTruthy();
  });

  it("prints the seller's identity and bank block off the snapshot", () => {
    show(doc(), [line()]);
    expect(screen.getByText("Rupees Eighty Eight Thousand Five Hundred Only")).toBeTruthy();
    expect(screen.getByText("ACPPV1393L")).toBeTruthy();
    expect(screen.getByText("27ACPPV1393L1ZQ")).toBeTruthy();
    expect(screen.getByText("998311")).toBeTruthy();
    expect(screen.getByText("6812028980 — Kotak Mahindra Bank")).toBeTruthy();
    expect(screen.getByText("KKBK0000646 (Malad East)")).toBeTruthy();
    expect(screen.getByText("Immediate")).toBeTruthy();
    expect(screen.getByText("For Altus Corp")).toBeTruthy();
    expect(screen.getByText("Proprietor")).toBeTruthy();
  });

  it("does not print the service description above a line of the same name", () => {
    show(doc(), [line()]);
    // One occurrence, not two: the reference document says it once.
    expect(screen.getAllByText("Fees for Technical Services")).toHaveLength(1);
  });
});

describe("InvoiceView — GST modes", () => {
  it("labels IGST at the full rate across a state line", () => {
    show(
      doc({
        gstMode: "igst",
        cgstAmount: "0.00",
        sgstAmount: "0.00",
        igstAmount: "13500.00",
        placeOfSupplyCode: "29",
      }),
      [line({ cgstAmount: "0.00", sgstAmount: "0.00", igstAmount: "13500.00" })],
    );
    expect(screen.getByText("IGST@18%")).toBeTruthy();
    // All three rows print whenever GST applies at all — the reader checks the
    // sheet against a shape they know, and two rows where they expect three
    // raises the question of which one was dropped. See buildInvoiceViewModel.
    expect(screen.getByText("CGST@9%")).toBeTruthy();
  });

  it("prints NO tax rows at all when GST does not apply", () => {
    show(
      doc({
        gstMode: "none",
        gstApplicable: false,
        cgstAmount: "0.00",
        sgstAmount: "0.00",
        igstAmount: "0.00",
        total: "75000.00",
        amountInWords: "Rupees Seventy Five Thousand Only",
      }),
      [line({ gstRate: "0.00", cgstAmount: "0.00", sgstAmount: "0.00", lineTotal: "75000.00" })],
    );
    expect(screen.queryByText(/CGST/)).toBeNull();
    expect(screen.queryByText(/SGST/)).toBeNull();
    expect(screen.queryByText(/IGST/)).toBeNull();
    expect(screen.getByText("GST is not applicable on this document.")).toBeTruthy();
  });

  it("says 'Unregistered' rather than leaving the customer GSTIN blank", () => {
    show(doc({ customerSnapshot: { ...CUSTOMER, gstin: null } }), [line()]);
    expect(screen.getByText("Unregistered")).toBeTruthy();
  });
});

describe("InvoiceView — the other two document types", () => {
  /* 2026-09-20: both riders were dropped by name — the quotation's "Prices are
     valid subject to confirmation" and the proforma's "This is not a tax
     invoice". The TITLE is what says which document this is. */
  it("a quotation carries its own title and no rider", () => {
    show(doc({ docType: "quotation", docNo: "90001-26-27" }), [line()]);
    expect(screen.getByText("QUOTATION")).toBeTruthy();
    expect(screen.queryByText(/not a tax invoice/i)).toBeNull();
  });

  it("a proforma carries its own title and no rider either", () => {
    show(doc({ docType: "proforma_invoice", docNo: "90001-26-27" }), [line()]);
    expect(screen.getByText("PROFORMA INVOICE")).toBeTruthy();
    expect(screen.queryByText(/not a tax invoice/i)).toBeNull();
  });

  it("a converted document shows where it came from", () => {
    show(
      doc({ sourceDocNo: "90001-26-27", sourceDocType: "quotation" }),
      [line()],
    );
    expect(screen.getByText("Ref: Quotation No. 90001-26-27")).toBeTruthy();
  });

  it("a cancelled document says so on its face", () => {
    show(doc({ status: "cancelled", cancelReason: "wrong entity" }), [line()]);
    expect(screen.getByText("CANCELLED")).toBeTruthy();
  });
});

describe("InvoiceView — the line grid", () => {
  it("switches to the full grid when a line has a quantity or a discount", () => {
    show(
      doc({
        serviceDescription: "Retainer and advisory",
        subtotal: "60000.00",
        discountTotal: "6000.00",
        taxableValue: "54000.00",
      }),
      [
      line({
        name: "Strategy retainer",
        code: "P90",
        quantity: "3",
        unit: "mo",
        rate: "20000.00",
        discountAmount: "6000.00",
        amount: "54000.00",
        }),
      ],
    );
    // Grid-only column headings.
    expect(screen.getByText("Qty")).toBeTruthy();
    expect(screen.getByText("Rate")).toBeTruthy();
    expect(screen.getByText("Discount")).toBeTruthy();
    expect(screen.getByText("Retainer and advisory")).toBeTruthy();
  });
});

describe("invoiceFilename", () => {
  it("is safe to attach to an email", () => {
    expect(invoiceFilename(doc())).toBe(
      "Tax-Invoice-10001-26-27-Anant-Avinya-Technologies-LLP.pdf",
    );
  });

  it("names an unnumbered draft without pretending it has a number", () => {
    expect(invoiceFilename(doc({ docNo: null }))).toContain("draft-");
  });
});
