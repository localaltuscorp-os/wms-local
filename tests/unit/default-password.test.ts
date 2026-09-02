import { describe, it, expect } from "vitest";
import { DEFAULT_INVITE_PASSWORD } from "@/lib/auth/default-password";

describe("DEFAULT_INVITE_PASSWORD", () => {
  it("satisfies Firebase's minimum length (>= 6)", () => {
    expect(DEFAULT_INVITE_PASSWORD.length).toBeGreaterThanOrEqual(6);
  });

  it("contains at least one letter and one digit", () => {
    expect(DEFAULT_INVITE_PASSWORD).toMatch(/[A-Za-z]/);
    expect(DEFAULT_INVITE_PASSWORD).toMatch(/[0-9]/);
  });

  it("is exactly the agreed default", () => {
    expect(DEFAULT_INVITE_PASSWORD).toBe("Wms@123");
  });
});
