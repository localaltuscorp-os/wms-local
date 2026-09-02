import { describe, it, expect } from "vitest";
import { ResetPasswordSchema } from "@/lib/validators/employee";

describe("ResetPasswordSchema", () => {
  it("accepts an 8+ char password", () => {
    const r = ResetPasswordSchema.safeParse({ password: "abcd1234" });
    expect(r.success).toBe(true);
  });

  it("rejects a password shorter than 8 chars", () => {
    const r = ResetPasswordSchema.safeParse({ password: "abc123" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.message).toMatch(/at least 8/i);
    }
  });

  it("rejects a password longer than 128 chars", () => {
    const r = ResetPasswordSchema.safeParse({ password: "a".repeat(129) });
    expect(r.success).toBe(false);
  });
});
