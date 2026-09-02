import { describe, it, expect } from "vitest";
import { computeCommission, round2 } from "@/lib/ambassadors/commission";

describe("computeCommission", () => {
  it("percent of the deal amount", () => {
    const r = computeCommission({ payoutType: "percent", payoutValue: 10, dealAmount: 50000 });
    expect(r.amount).toBe(5000);
    expect(r.basis).toBe("percent 10%");
  });

  it("flat fee ignores deal amount", () => {
    const r = computeCommission({ payoutType: "flat", payoutValue: 5000, dealAmount: 999999 });
    expect(r.amount).toBe(5000);
    expect(r.basis).toBe("flat ₹5000");
  });

  it("percent with no deal amount is zero", () => {
    const r = computeCommission({ payoutType: "percent", payoutValue: 10, dealAmount: null });
    expect(r.amount).toBe(0);
  });

  it("override beats both percent and flat", () => {
    const r = computeCommission({ payoutType: "percent", payoutValue: 10, dealAmount: 50000, override: 7500 });
    expect(r.amount).toBe(7500);
    expect(r.basis).toContain("override");
  });

  it("rounds to paise", () => {
    const r = computeCommission({ payoutType: "percent", payoutValue: 12.5, dealAmount: 1333 });
    expect(r.amount).toBe(round2(1333 * 0.125));
    expect(r.amount).toBe(166.63);
  });
});
