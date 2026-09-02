import { describe, it, expect } from "vitest";
import { rollingAverage } from "@/lib/transforms/rolling-average";

describe("rollingAverage", () => {
  it("returns a same-length array with leading partial windows", () => {
    expect(rollingAverage([10, 20, 30, 40], 2)).toEqual([10, 15, 25, 35]);
  });
  it("handles a window larger than the input", () => {
    expect(rollingAverage([5, 5], 4)).toEqual([5, 5]);
  });
  it("rounds to one decimal", () => {
    expect(rollingAverage([1, 2, 3], 3)).toEqual([1, 1.5, 2]);
  });
  it("returns [] for empty input", () => {
    expect(rollingAverage([], 4)).toEqual([]);
  });
});
