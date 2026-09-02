import { describe, it, expect } from "vitest";

function pct(count: number, denom: number): string {
  if (denom === 0) return "0.0%";
  return `${((count / denom) * 100).toFixed(1)}%`;
}

describe("status distribution percentage", () => {
  it("uses (total - approved) as the denominator", () => {
    const counts = { not_started: 4, done: 2, approved: 4 };
    const denom = (counts.not_started + counts.done + counts.approved) - counts.approved;
    expect(denom).toBe(6);
    expect(pct(counts.not_started, denom)).toBe("66.7%");
  });
  it("returns 0.0% when denominator is zero", () => {
    expect(pct(0, 0)).toBe("0.0%");
  });
});
