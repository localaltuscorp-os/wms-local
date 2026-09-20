import { describe, it, expect } from "vitest";
import {
  financialYear,
  financialYearRange,
  recentFinancialYears,
  formatDocNo,
  dueDateFor,
  canConvert,
  CONVERSION_TARGETS,
} from "@/lib/billing/numbering";

/**
 * The financial-year boundary is the one date bug that silently corrupts a
 * whole series: get 31 March wrong and April's invoices continue last year's
 * numbering. Both sides of it are pinned here.
 */
describe("financialYear", () => {
  it("rolls over on 1 April, not 1 January", () => {
    expect(financialYear("2026-03-31")).toBe("25-26");
    expect(financialYear("2026-04-01")).toBe("26-27");
    expect(financialYear("2027-03-31")).toBe("26-27");
    expect(financialYear("2027-04-01")).toBe("27-28");
  });

  it("produces the suffix the business already writes", () => {
    expect(financialYear("2026-08-03")).toBe("26-27");
  });

  it("maps a label back to its 1 Apr – 31 Mar range", () => {
    expect(financialYearRange("26-27")).toEqual({ from: "2026-04-01", to: "2027-03-31" });
  });

  it("lists recent years newest first", () => {
    expect(recentFinancialYears(3, "2026-08-03")).toEqual(["26-27", "25-26", "24-25"]);
  });
});

describe("formatDocNo", () => {
  it("is <sequence>-<financial year> by default", () => {
    expect(formatDocNo({ prefix: "", seq: 90001, padWidth: 0, finYear: "26-27" })).toBe("90001-26-27");
    expect(formatDocNo({ prefix: "", seq: 90002, padWidth: 0, finYear: "26-27" })).toBe("90002-26-27");
  });

  it("honours a configured prefix and padding", () => {
    expect(formatDocNo({ prefix: "PI-", seq: 42, padWidth: 4, finYear: "26-27" })).toBe("PI-0042-26-27");
  });
});

describe("dueDateFor", () => {
  it("adds the term's days as plain calendar arithmetic", () => {
    expect(dueDateFor("2026-08-03", 30)).toBe("2026-09-02");
    expect(dueDateFor("2026-08-03", 0)).toBe("2026-08-03");
  });

  it("crosses a month and a year end without drifting", () => {
    expect(dueDateFor("2026-12-20", 15)).toBe("2027-01-04");
    expect(dueDateFor("2026-01-31", 30)).toBe("2026-03-02");
  });

  it("has no due date for a term that has no computable one (DP)", () => {
    expect(dueDateFor("2026-08-03", null)).toBeNull();
  });
});

describe("conversion rules", () => {
  it("moves forward down the chain", () => {
    expect(canConvert("quotation", "proforma_invoice")).toBe(true);
    expect(canConvert("quotation", "tax_invoice")).toBe(true);
    expect(canConvert("proforma_invoice", "tax_invoice")).toBe(true);
  });

  /* 2026-09-20: a tax invoice is no longer the end of the line. It converts
     into a proforma or a quotation — into a NEW draft, with the invoice itself
     frozen as `converted` and its number and figures untouched. */
  it("moves back out of a tax invoice", () => {
    expect(canConvert("tax_invoice", "proforma_invoice")).toBe(true);
    expect(canConvert("tax_invoice", "quotation")).toBe(true);
    expect(CONVERSION_TARGETS.tax_invoice).toEqual(["proforma_invoice", "quotation"]);
  });

  it("never moves sideways, and a proforma still does not go back to a quotation", () => {
    expect(canConvert("proforma_invoice", "quotation")).toBe(false);
    expect(canConvert("quotation", "quotation")).toBe(false);
    expect(canConvert("proforma_invoice", "proforma_invoice")).toBe(false);
    expect(canConvert("tax_invoice", "tax_invoice")).toBe(false);
  });
});
