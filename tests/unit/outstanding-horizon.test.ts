import { describe, it, expect } from "vitest";
import { rollingHorizon, todayISO } from "@/lib/outstanding/horizon";

describe("rollingHorizon", () => {
  it("returns the first of the month 18 months ahead", () => {
    expect(rollingHorizon("2026-06-13")).toBe("2027-12-01");
  });

  it("rolls the year over correctly", () => {
    // Jan 2026 + 18 months = Jul 2027.
    expect(rollingHorizon("2026-01-15")).toBe("2027-07-01");
    // Dec 2026 + 18 months = Jun 2028.
    expect(rollingHorizon("2026-12-01")).toBe("2028-06-01");
  });
});

describe("todayISO", () => {
  it("returns a YYYY-MM-DD shaped string", () => {
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
