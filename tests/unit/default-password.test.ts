import { describe, it, expect } from "vitest";
import { generateInvitePassword } from "@/lib/auth/default-password";

describe("generateInvitePassword", () => {
  it("satisfies Firebase's minimum length (>= 6)", () => {
    expect(generateInvitePassword().length).toBeGreaterThanOrEqual(6);
  });

  it("contains an upper, lower, digit and symbol (strength)", () => {
    const pw = generateInvitePassword();
    expect(pw).toMatch(/[A-Z]/);
    expect(pw).toMatch(/[a-z]/);
    expect(pw).toMatch(/[0-9]/);
    expect(pw).toMatch(/[^A-Za-z0-9]/);
  });

  it("avoids ambiguous characters (0/O/1/l/I)", () => {
    expect(generateInvitePassword()).not.toMatch(/[0O1lI]/);
  });

  it("is random — two calls don't collide", () => {
    expect(generateInvitePassword()).not.toBe(generateInvitePassword());
  });
});
