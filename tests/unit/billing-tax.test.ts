import { describe, it, expect } from "vitest";
import {
  computeLine,
  computeTotals,
  resolveGstMode,
  taxRows,
  gstModeLabel,
  round2,
} from "@/lib/billing/tax";

/**
 * THE GST ENGINE IS THE INVOICE.
 *
 * Every figure a customer reads comes out of these two functions, and the same
 * code runs in the browser (live totals) and on the server (the authoritative
 * recompute). So the cases below are the ones the business actually issues: an
 * intra-state 18% service, the same service across a state line, a customer
 * with no GSTIN at all, and a discount.
 */

describe("resolveGstMode", () => {
  it("is 'none' when the seller has no GSTIN, whatever the user asked for", () => {
    expect(
      resolveGstMode({
        sellerGstin: null,
        sellerStateCode: "27",
        customerStateCode: "27",
        gstApplicable: true,
      }),
    ).toBe("none");
  });

  it("is 'none' when the user switches GST off", () => {
    expect(
      resolveGstMode({
        sellerGstin: "27ACPPV1393L1ZQ",
        sellerStateCode: "27",
        customerStateCode: "27",
        gstApplicable: false,
      }),
    ).toBe("none");
  });

  it("is CGST+SGST within one state and IGST across a state line", () => {
    const base = { sellerGstin: "27ACPPV1393L1ZQ", sellerStateCode: "27", gstApplicable: true };
    expect(resolveGstMode({ ...base, customerStateCode: "27" })).toBe("cgst_sgst");
    expect(resolveGstMode({ ...base, customerStateCode: "29" })).toBe("igst");
  });

  it("treats an unknown place of supply as inter-state", () => {
    // IGST is the safe default: CGST+SGST charged across a state line cannot be
    // corrected without a credit note.
    expect(
      resolveGstMode({
        sellerGstin: "27ACPPV1393L1ZQ",
        sellerStateCode: "27",
        customerStateCode: null,
        gstApplicable: true,
      }),
    ).toBe("igst");
  });
});

describe("computeTotals — the shape of the reference document", () => {
  const line = { quantity: 1, rate: 75000, gstRate: 18 };

  it("splits 18% intra-state into CGST 9% + SGST 9% and totals 88,500", () => {
    const t = computeTotals([line], "cgst_sgst");
    expect(t.taxableValue).toBe(75000);
    expect(t.cgstAmount).toBe(6750);
    expect(t.sgstAmount).toBe(6750);
    expect(t.igstAmount).toBe(0);
    expect(t.total).toBe(88500);
    expect(t.roundOff).toBe(0);
  });

  it("charges the same base as a single IGST 18% across a state line", () => {
    const t = computeTotals([line], "igst");
    expect(t.igstAmount).toBe(13500);
    expect(t.cgstAmount).toBe(0);
    expect(t.total).toBe(88500);
  });

  it("charges nothing at all with GST off — no zero tax rows either", () => {
    const t = computeTotals([line], "none");
    expect(t.cgstAmount + t.sgstAmount + t.igstAmount).toBe(0);
    expect(t.total).toBe(75000);
    expect(taxRows(t)).toEqual([]);
  });

  it("sums several lines and rounds the payable exactly once", () => {
    const t = computeTotals(
      [
        { quantity: 3, rate: 1999.99, gstRate: 18 },
        { quantity: 1, rate: 450.55, gstRate: 18 },
      ],
      "cgst_sgst",
    );
    expect(t.taxableValue).toBe(round2(3 * 1999.99 + 450.55));
    expect(round2(t.cgstAmount + t.sgstAmount)).toBe(t.taxTotal);
    expect(Number.isInteger(t.total)).toBe(true);
    expect(round2(t.taxableValue + t.taxTotal + t.roundOff)).toBe(t.total);
  });

  it("applies a percentage discount before tax", () => {
    const c = computeLine({ quantity: 2, rate: 1000, discountPct: 10, gstRate: 18 }, "cgst_sgst");
    expect(c.gross).toBe(2000);
    expect(c.discountAmount).toBe(200);
    expect(c.amount).toBe(1800);
    expect(c.cgstAmount).toBe(162);
    expect(c.sgstAmount).toBe(162);
    expect(c.lineTotal).toBe(2124);
  });

  it("never discounts a line below zero", () => {
    const c = computeLine({ quantity: 1, rate: 500, discountAmount: 900, gstRate: 18 }, "igst");
    expect(c.discountAmount).toBe(500);
    expect(c.amount).toBe(0);
  });

  it("keeps the two halves summing to the tax on an odd paisa", () => {
    const c = computeLine({ quantity: 1, rate: 333.33, gstRate: 5 }, "cgst_sgst");
    expect(round2(c.cgstAmount + c.sgstAmount)).toBe(round2((333.33 * 5) / 100));
  });
});

describe("taxRows + labels", () => {
  it("labels the halves at half the rate", () => {
    const t = computeTotals([{ quantity: 1, rate: 1000, gstRate: 18 }], "cgst_sgst");
    expect(taxRows(t).map((r) => r.label)).toEqual(["CGST @ 9%", "SGST @ 9%"]);
    expect(gstModeLabel(t.mode, t.rates)).toBe("Intra-state — CGST 9% + SGST 9%");
  });

  it("labels IGST at the full rate", () => {
    const t = computeTotals([{ quantity: 1, rate: 1000, gstRate: 18 }], "igst");
    expect(taxRows(t).map((r) => r.label)).toEqual(["IGST @ 18%"]);
  });

  it("drops the decimals nobody writes", () => {
    const t = computeTotals([{ quantity: 1, rate: 1000, gstRate: 5 }], "cgst_sgst");
    expect(taxRows(t)[0]!.label).toBe("CGST @ 2.5%");
  });
});
