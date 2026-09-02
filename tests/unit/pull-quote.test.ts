import { describe, it, expect } from "vitest";
import { generatePullQuote } from "@/lib/transforms/pull-quote";

describe("generatePullQuote", () => {
  it("contains the count when momentum is positive", () => {
    const quote = generatePullQuote({
      doneThisWeek: 84,
      doneLastWeek: 75,
      topPerformerName: "Ankit Sharma",
      topPerformerCount: 12,
    });
    expect(quote).toContain("84");
    expect(quote).toContain("12");
  });

  it("reflects negative trend with downward language", () => {
    const quote = generatePullQuote({
      doneThisWeek: 50,
      doneLastWeek: 80,
      topPerformerName: "Priya",
      topPerformerCount: 8,
    });
    expect(/(slower|down|lower|less)/.test(quote.toLowerCase())).toBe(true);
  });

  it("handles zero baseline gracefully", () => {
    const quote = generatePullQuote({
      doneThisWeek: 10,
      doneLastWeek: 0,
      topPerformerName: "Ravi",
      topPerformerCount: 4,
    });
    expect(quote).toContain("10");
    expect(quote).not.toContain("Infinity");
    expect(quote).not.toContain("NaN");
  });
});
