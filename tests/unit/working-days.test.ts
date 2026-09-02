import { describe, it, expect } from "vitest";
import { countWorkingDays } from "@/lib/transforms/working-days";

const d = (s: string) => new Date(`${s}T00:00:00Z`);

describe("countWorkingDays (Sunday off, 6-day week)", () => {
  it("Mon–Sat = 6 working days, Sunday excluded", () => {
    // 2026-06-15 is a Monday … 2026-06-21 is a Sunday
    expect(countWorkingDays(d("2026-06-15"), d("2026-06-21"), new Set())).toBe(6);
  });
  it("excludes holidays in range", () => {
    expect(
      countWorkingDays(d("2026-06-15"), d("2026-06-21"), new Set(["2026-06-17"])),
    ).toBe(5);
  });
  it("single Sunday = 0", () => {
    expect(countWorkingDays(d("2026-06-21"), d("2026-06-21"), new Set())).toBe(0);
  });
  it("single Saturday counts (6-day week)", () => {
    expect(countWorkingDays(d("2026-06-20"), d("2026-06-20"), new Set())).toBe(1);
  });
});
