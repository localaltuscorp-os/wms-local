import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  INCENTIVE_FIELDS,
  MULTISELECT_SEPARATOR,
  optionsFor,
  splitMultiValue,
  validateIncentiveDetails,
  visibleIncentiveFields,
  type IncentiveField,
} from "@/lib/incentive-fields";

/**
 * THE SALES PITCH FORM.
 *
 * Five things changed here, and each one is a rule that can silently regress
 * into "the field is still free text" or "the products are a list in the
 * component again":
 *
 *   1. "Workshop Name" on THIS form is the INTRODUCER's workshop.
 *   2. Product Sold is a MULTISELECT sourced from Admin → Products.
 *   3. It refuses anything the Product Master does not have.
 *   4. Shift is sourced from Admin → Shift Types.
 *   5. CTC per Month is READ-ONLY (a `static` display), so it cannot be typed
 *      into, cannot be submitted, and cannot block a save.
 */

const CTX = {
  productNames: ["PS", "BSS", "OS", "Retainer", "Key Note", "2-Day Workshop", "Inhouse PS"],
  shiftTypeNames: ["Morning", "Evening"],
};

const salesPitch = (key: string): IncentiveField => {
  const f = (INCENTIVE_FIELDS.sales_pitch ?? []).find((x) => x.key === key);
  if (!f) throw new Error(`sales_pitch has no "${key}" field`);
  return f;
};

const valid = (over: Record<string, string> = {}) => ({
  introducer_first_name: "Ana",
  introducer_last_name: "Rao",
  workshop: "Colloquium",
  batch_no: "12",
  prospect_first_name: "Dev",
  prospect_last_name: "Shah",
  organisation: "Acme",
  products: "PS, BSS",
  opportunity_type: "PS Potential",
  notes: "Pitched the 2-day",
  incentive_date: "2026-08-01",
  shift: "Morning",
  cell: "9876543210",
  email: "ana@example.com",
  ...over,
});

describe("Sales Pitch — the fields themselves", () => {
  it("names the workshop field for the introducer, not a generic workshop", () => {
    expect(salesPitch("workshop").label).toBe("Introducer Workshop Name");
  });

  it("offers Product Sold as a multiselect fed by the Product Master", () => {
    const products = salesPitch("products");
    expect(products.type).toBe("multiselect");
    expect(products.optionsFrom).toBe("products");
    // No hardcoded list on the field itself — the master is the only source.
    expect(products.options).toBeUndefined();
    expect(optionsFor(products, CTX)).toEqual(CTX.productNames);
  });

  it("sources Shift from the Shift Types master", () => {
    const shift = salesPitch("shift");
    expect(shift.type).toBe("select");
    expect(shift.optionsFrom).toBe("shiftTypes");
    // No hardcoded list on the field either.
    expect(shift.options).toBeUndefined();
    expect(optionsFor(shift, CTX)).toEqual(["Morning", "Evening"]);
  });

  it("shows CTC per Month as a read-only display, not an input", () => {
    const ctc = salesPitch("ctc_per_month");
    expect(ctc.type).toBe("static");
    expect(ctc.displayFrom).toBe("monthlyCtc");
  });

  it("puts the shift, cell, email and CTC block at the END of the form", () => {
    const keys = (INCENTIVE_FIELDS.sales_pitch ?? []).map((f) => f.key);
    const tail = keys.slice(-4);
    expect(tail).toEqual(["shift", "cell", "email", "ctc_per_month"]);
  });
});

describe("Product Sold — multiple selection", () => {
  it("accepts several products and stores them in master order", () => {
    // Picked out of order, saved in the master's order: the same picks must
    // always produce the same stored value.
    const r = validateIncentiveDetails("sales_pitch", valid({ products: "BSS, PS" }), CTX);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.details.products).toBe(`PS${MULTISELECT_SEPARATOR}BSS`);
    expect(splitMultiValue(r.details.products!)).toEqual(["PS", "BSS"]);
  });

  it("collapses a duplicate pick instead of refusing the save", () => {
    const r = validateIncentiveDetails("sales_pitch", valid({ products: "PS, PS" }), CTX);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.details.products).toBe("PS");
  });

  it("refuses a product the master does not have", () => {
    const r = validateIncentiveDetails("sales_pitch", valid({ products: "PS, Mystery" }), CTX);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("Mystery");
    expect(r.error).toContain("product master");
  });

  it("requires at least one product", () => {
    const r = validateIncentiveDetails("sales_pitch", valid({ products: "" }), CTX);
    expect(r.ok).toBe(false);
  });

  it("keeps readings of legacy free-text values", () => {
    // Rows written before the multiselect stored "PS, BSS" too, so both read
    // the same way.
    expect(splitMultiValue("PS, BSS ,OS")).toEqual(["PS", "BSS", "OS"]);
  });
});

describe("Shift", () => {
  it("accepts a master shift and refuses anything else", () => {
    expect(validateIncentiveDetails("sales_pitch", valid({ shift: "Evening" }), CTX).ok).toBe(true);
    expect(validateIncentiveDetails("sales_pitch", valid({ shift: "Night" }), CTX).ok).toBe(false);
  });

  it("fails closed when the shift master was not loaded", () => {
    const r = validateIncentiveDetails("sales_pitch", valid(), { productNames: CTX.productNames });
    expect(r.ok).toBe(false);
  });
});

describe("CTC per Month", () => {
  it("is not submitted, even when the browser sends one", () => {
    const r = validateIncentiveDetails(
      "sales_pitch",
      { ...valid(), ctc_per_month: "999999" },
      CTX,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.details.ctc_per_month).toBeUndefined();
  });

  it("never blocks a save", () => {
    // A static field can hold anything (or nothing) — it is display only.
    const r = validateIncentiveDetails("sales_pitch", valid(), CTX);
    expect(r.ok).toBe(true);
    expect(visibleIncentiveFields("sales_pitch", valid()).some((f) => f.key === "ctc_per_month")).toBe(
      true,
    );
  });
});
