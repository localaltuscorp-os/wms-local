import { describe, it, expect } from "vitest";
import { buildInvoiceViewModel } from "@/lib/billing/view-model";
import type { BillingDocType } from "@/db/enums";

/**
 * The printed meta block — Code / No / Date.
 *
 * Manan, 2026-09-16: the Code carries the document-type letter ("if the tax
 * invoice, then code front I want I55"), and the sheet shows no due date.
 */
function docOf(docType: BillingDocType, docNo: string | null) {
  return {
    docType,
    docNo,
    docDate: "2026-08-03",
    // Deliberately PRESENT: the assertion is that a stored due date still does
    // not reach the printed sheet, not that there is nothing to print.
    dueDate: "2026-09-02",
    status: "generated",
    sellerSnapshot: { entityId: "altus-corp", legalName: "Altus Corp" },
    customerSnapshot: { name: "Anant Avinya Technologies LLP", gstin: "27ACEFA9263B1ZJ" },
    gstMode: "none",
  } as never;
}

describe("invoice meta block", () => {
  it("prefixes the Code with the document-type letter", () => {
    const cases: Array<[BillingDocType, string]> = [
      ["tax_invoice", "I55/26-27"],
      ["proforma_invoice", "P55/26-27"],
      ["quotation", "Q55/26-27"],
    ];
    for (const [type, expected] of cases) {
      const vm = buildInvoiceViewModel(docOf(type, "55/26-27"), []);
      expect(vm.meta.find((m) => m.label === "Code")?.value).toBe(expected);
    }
  });

  it("leaves the document number itself unprefixed", () => {
    const vm = buildInvoiceViewModel(docOf("tax_invoice", "55/26-27"), []);
    expect(vm.meta.find((m) => m.label === "Tax Invoice No")?.value).toBe("55/26-27");
  });

  it("never prints a Due Date row, even when one is stored", () => {
    for (const t of ["quotation", "proforma_invoice", "tax_invoice"] as BillingDocType[]) {
      const vm = buildInvoiceViewModel(docOf(t, "55/26-27"), []);
      expect(vm.meta.map((m) => m.label)).not.toContain("Due Date");
    }
  });

  it("still shows a draft placeholder when unnumbered", () => {
    const vm = buildInvoiceViewModel(docOf("tax_invoice", null), []);
    expect(vm.meta.find((m) => m.label === "Number")?.value).toContain("Draft");
  });
});
