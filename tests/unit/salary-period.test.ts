import { describe, expect, it } from "vitest";
import { daysInMonth, fyForMonth } from "@/lib/salary/period";

describe("fyForMonth", () => {
  it("Apr starts a new FY", () => {
    expect(fyForMonth("2026-04")).toBe("FY 26-27");
  });
  it("Mar belongs to the prior FY", () => {
    expect(fyForMonth("2027-03")).toBe("FY 26-27");
  });
  it("Dec belongs to the FY that started that April", () => {
    expect(fyForMonth("2026-12")).toBe("FY 26-27");
  });
});

describe("daysInMonth", () => {
  it("non-leap February", () => {
    expect(daysInMonth("2026-02")).toBe(28);
  });
  it("leap February", () => {
    expect(daysInMonth("2024-02")).toBe(29);
  });
  it("30-day month", () => {
    expect(daysInMonth("2026-04")).toBe(30);
  });
});
