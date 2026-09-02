// tests/unit/founder.test.ts
import { describe, it, expect } from "vitest";
import { isFounderEmail, FOUNDER_EMAIL } from "@/lib/auth/founder";

describe("isFounderEmail", () => {
  it("matches Manan (case/space-insensitive)", () => {
    expect(isFounderEmail(FOUNDER_EMAIL)).toBe(true);
    expect(isFounderEmail("  Manan@Unleashed.in ")).toBe(true);
  });
  it("rejects everyone else incl. other super-admins", () => {
    expect(isFounderEmail("hetesh@example.com")).toBe(false);
    expect(isFounderEmail(null)).toBe(false);
  });
});
