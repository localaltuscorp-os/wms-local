import { describe, it, expect } from "vitest";
import { buildInvoiceViewModel } from "@/lib/billing/view-model";
import { sellerBankRows } from "@/lib/billing/seller";

/**
 * THE PRINTED SHEET'S STRUCTURE, pinned to the reference invoice.
 *
 * Manan, 2026-09-16: "I want same template structure only."
 *
 * These assert the SHAPE — which rows exist and in what order — rather than the
 * values, because that is what the reference fixes and what a later change is
 * most likely to drift.
 */

const SELLER = {
  entityId: "altus-corp",
  legalName: "Altus Corp",
  pan: "ACPPV1393L",
  gstin: "27ACPPV1393L1ZQ",
  bankAccountName: "Altus Corp (Current Account)",
  bankName: "Kotak Mahindra Bank",
  bankAccountNo: "6812028980",
  bankIfsc: "KKBK0000646",
  bankBranch: "Malad East, Mumbai 400097",
  upiId: null,
};

function doc(over: Record<string, unknown> = {}) {
  return {
    docType: "tax_invoice",
    docNo: "55/26-27",
    docDate: "2026-08-03",
    dueDate: "2026-09-02",
    status: "generated",
    sellerSnapshot: SELLER,
    customerSnapshot: {
      name: "Anant Avinya Technologies LLP",
      contactName: "Rajiv Sheth",
      phone: "9833288638",
      email: "rajiv@anantavinya.example",
      gstin: "27ACEFA9263B1ZJ",
      addressLine1: "A299, Mahape MIDC",
      addressLine2: "Next to Gajanan Chemicals",
      city: "Navi Mumbai",
    },
    gstMode: "cgst_sgst",
    cgstAmount: "6750.00",
    sgstAmount: "6750.00",
    igstAmount: "0.00",
    amountInWords: "Rupees Eighty Eight Thousand Five Hundred Only",
    sacCode: "998311",
    paymentTermsLabel: "Immediate",
    ...over,
  } as never;
}

const line = {
  name: "Fees for Technical Services",
  description: null,
  code: null,
  sacCode: "998311",
  quantity: 1,
  unit: null,
  rate: "75000.00",
  // `amount` and `discountAmount` are what the view model reads — the rate is
  // carried for display only, so a stub without these lands a zero-value line
  // and the tax labels come out unrated.
  amount: "75000.00",
  discountAmount: "0",
  gstRate: "18.00",
} as never;

describe("printed sheet structure", () => {
  it("addresses the customer with the reference's five rows, and no email", () => {
    const vm = buildInvoiceViewModel(doc(), [line]);
    expect(vm.billTo.map((r) => r.label)).toEqual([
      "To",
      "Kind Attn.",
      "Address",
      "Contact No.",
      "GSTIN",
    ]);
  });

  it("prints all three tax rows when GST applies, including the zero one", () => {
    const vm = buildInvoiceViewModel(doc(), [line]);
    expect(vm.taxRows.map((r) => r.label)).toEqual(["CGST@9%", "SGST@9%", "IGST@18%"]);
  });

  it("prints the same three for an inter-state invoice", () => {
    const vm = buildInvoiceViewModel(
      doc({ gstMode: "igst", cgstAmount: "0.00", sgstAmount: "0.00", igstAmount: "13500.00" }),
      [line],
    );
    expect(vm.taxRows.map((r) => r.label)).toEqual(["CGST@9%", "SGST@9%", "IGST@18%"]);
  });

  it("prints NO tax rows for an unregistered customer", () => {
    const vm = buildInvoiceViewModel(doc({ gstMode: "none" }), [line]);
    expect(vm.taxRows).toHaveLength(0);
  });

  it("lays the bank block out in the reference's order", () => {
    expect(sellerBankRows(SELLER as never).map((r) => r.label)).toEqual([
      "Cheque to be issued in favour of",
      "Account name for online transfer",
      "Bank Account Number",
      "Bank IFS Code",
    ]);
  });

  it("makes cheques to the legal name and transfers to the account name", () => {
    const rows = sellerBankRows(SELLER as never);
    expect(rows[0]!.value).toBe("Altus Corp");
    expect(rows[1]!.value).toBe("Altus Corp (Current Account)");
  });

  it("keeps the identity block in the reference's order", () => {
    const vm = buildInvoiceViewModel(doc(), [line]);
    expect(vm.identityRows.map((r) => r.label)).toEqual([
      "Total Amount in Words",
      "Permanent Account Number",
      "GSTIN",
      "SAC Code",
    ]);
  });

  it("ends the payment block with Payment Terms", () => {
    const vm = buildInvoiceViewModel(doc(), [line]);
    expect(vm.paymentRows.at(-1)!.label).toBe("Payment Terms");
  });
});
