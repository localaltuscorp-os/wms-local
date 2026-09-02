import { describe, it, expect } from "vitest";
import { lateDeductionCrossed } from "@/lib/attendance/status";

describe("lateDeductionCrossed", () => {
  it("fires when the count lands exactly on a multiple of 3 (2→3)", () => {
    expect(lateDeductionCrossed(2, 3)).toBe(true);
  });

  it("does NOT fire when the count is unchanged at a boundary (3→3)", () => {
    expect(lateDeductionCrossed(3, 3)).toBe(false);
  });

  it("does NOT fire when the count moves past a boundary (3→4)", () => {
    expect(lateDeductionCrossed(3, 4)).toBe(false);
  });

  it("fires on the next boundary (5→6)", () => {
    expect(lateDeductionCrossed(5, 6)).toBe(true);
  });

  it("fires when jumping straight onto a boundary (0→3)", () => {
    expect(lateDeductionCrossed(0, 3)).toBe(true);
  });
});
