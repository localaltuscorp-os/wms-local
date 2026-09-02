import { describe, it, expect } from "vitest";
import { generatePassword } from "@/lib/auth/generate-password";

describe("generatePassword", () => {
  it("returns the requested length", () => {
    expect(generatePassword(16)).toHaveLength(16);
  });

  it("defaults to length 16", () => {
    expect(generatePassword()).toHaveLength(16);
  });

  it("includes at least one lowercase, uppercase, digit, and symbol", () => {
    for (let i = 0; i < 50; i++) {
      const pw = generatePassword();
      expect(pw).toMatch(/[a-z]/);
      expect(pw).toMatch(/[A-Z]/);
      expect(pw).toMatch(/[0-9]/);
      expect(pw).toMatch(/[!@#$%^&*\-_]/);
    }
  });

  it("produces different values on successive calls", () => {
    expect(generatePassword()).not.toBe(generatePassword());
  });
});
