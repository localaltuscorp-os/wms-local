import { describe, expect, it } from "vitest";
import {
  parseBillingMonth,
  parseRupees,
  mapBillingDeals,
  aggregateBilling,
} from "@/lib/billing/sheet";

describe("parseBillingMonth", () => {
  it("parses DD-Mon-YYYY", () => {
    expect(parseBillingMonth("18-Apr-2025")).toBe("2025-04");
    expect(parseBillingMonth("1 Jan 2026")).toBe("2026-01");
  });
  it("parses numeric date forms", () => {
    expect(parseBillingMonth("2025-04-18")).toBe("2025-04");
    expect(parseBillingMonth("18/04/2025")).toBe("2025-04");
  });
  it("returns null for junk", () => {
    expect(parseBillingMonth("")).toBeNull();
    expect(parseBillingMonth("PSO Date")).toBeNull();
  });
});

describe("parseRupees", () => {
  it("strips ₹/commas, blanks → 0", () => {
    expect(parseRupees("₹5,84,100")).toBe(584100);
    expect(parseRupees("")).toBe(0);
    expect(parseRupees("abc")).toBe(0);
  });
});

describe("mapBillingDeals + aggregateBilling", () => {
  function row(o: { date?: string; client?: string; sp?: string; billed?: string; paid?: string }): unknown[] {
    const r: unknown[] = [];
    r[2] = o.date ?? "";
    r[7] = o.client ?? "";
    r[32] = o.sp ?? "";
    r[34] = o.billed ?? "";
    r[36] = o.paid ?? "";
    return r;
  }

  it("drops rows without a salesperson and computes outstanding", () => {
    const deals = mapBillingDeals([
      row({ date: "18-Apr-2025", client: "Neha", sp: "", billed: "₹10,000" }), // no sp → drop
      row({ date: "10-May-2026", client: "X Co", sp: "Satish Sonawane", billed: "₹66,300", paid: "₹47,070" }),
    ]);
    expect(deals).toHaveLength(1);
    expect(deals[0]!.outstanding).toBe(66300 - 47070);
  });

  it("aggregates per-salesperson sorted by billed, plus totals + monthly", () => {
    const deals = mapBillingDeals([
      row({ date: "01-Mar-2026", sp: "Moushmi Kalbere", billed: "₹5,84,100", paid: "₹5,84,100" }),
      row({ date: "10-May-2026", sp: "Satish Sonawane", billed: "₹66,300", paid: "₹47,070" }),
      row({ date: "11-May-2026", sp: "Moushmi Kalbere", billed: "₹0", paid: "₹0" }),
    ]);
    const s = aggregateBilling(deals);
    expect(s.totals.deals).toBe(3);
    expect(s.totals.billed).toBe(584100 + 66300);
    expect(s.perSalesperson[0]!.name).toBe("Moushmi Kalbere"); // highest billed
    expect(s.perSalesperson[0]!.deals).toBe(2);
    expect(s.monthly.map((m) => m.month)).toEqual(["2026-03", "2026-05"]);
  });
});
