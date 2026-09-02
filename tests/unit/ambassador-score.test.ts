import { describe, it, expect } from "vitest";
import { computePartnerScore, tierFor } from "@/lib/ambassadors/score";

describe("computePartnerScore", () => {
  it("a brand-new inactive partner scores ~0", () => {
    const s = computePartnerScore({ referrals: 0, conversionRate: 0, revenue: 0, daysSinceActivity: Infinity, paidRatio: 0 });
    expect(s).toBe(0);
  });

  it("a maxed-out partner scores 100", () => {
    const s = computePartnerScore({ referrals: 20, conversionRate: 1, revenue: 1_000_000, daysSinceActivity: 0, paidRatio: 1 });
    expect(s).toBe(100);
  });

  it("signals saturate (no overflow past 100)", () => {
    const s = computePartnerScore({ referrals: 999, conversionRate: 5, revenue: 9e9, daysSinceActivity: -10, paidRatio: 9 });
    expect(s).toBe(100);
  });

  it("recency decays over the window", () => {
    const fresh = computePartnerScore({ referrals: 0, conversionRate: 0, revenue: 0, daysSinceActivity: 0, paidRatio: 0 });
    const stale = computePartnerScore({ referrals: 0, conversionRate: 0, revenue: 0, daysSinceActivity: 90, paidRatio: 0 });
    expect(fresh).toBeGreaterThan(stale);
    expect(stale).toBe(0);
  });
});

describe("tierFor", () => {
  it("bands at 75 / 50", () => {
    expect(tierFor(80)).toBe("elite");
    expect(tierFor(75)).toBe("elite");
    expect(tierFor(74)).toBe("gold");
    expect(tierFor(50)).toBe("gold");
    expect(tierFor(49)).toBe("silver");
    expect(tierFor(0)).toBe("silver");
  });
});
