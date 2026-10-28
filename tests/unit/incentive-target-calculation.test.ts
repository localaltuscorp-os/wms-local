import { describe, expect, it } from "vitest";
import {
  effectiveIncentiveTarget,
  monthlyIncentiveTarget,
  periodTargetBase,
} from "@/lib/incentive/target-calculation";

describe("incentive target calculation", () => {
  it("uses 10% of monthly salary as monthly base", () => {
    expect(monthlyIncentiveTarget(50_000)).toBe(5_000);
    expect(periodTargetBase(50_000, "month")).toBe(5_000);
  });

  it("scales base target by period", () => {
    expect(periodTargetBase(50_000, "quarter")).toBe(15_000);
    expect(periodTargetBase(50_000, "year")).toBe(60_000);
  });

  it("uses entered stretched target for each period", () => {
    expect(effectiveIncentiveTarget(50_000, "month", 8_000)).toBe(8_000);
    expect(effectiveIncentiveTarget(50_000, "quarter", 22_000)).toBe(22_000);
    expect(effectiveIncentiveTarget(50_000, "year", 100_000)).toBe(100_000);
  });

  it("falls back to scaled base when stretched target is missing", () => {
    expect(effectiveIncentiveTarget(50_000, "month")).toBe(5_000);
    expect(effectiveIncentiveTarget(50_000, "quarter")).toBe(15_000);
    expect(effectiveIncentiveTarget(50_000, "year")).toBe(60_000);
  });
});
