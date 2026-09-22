import { describe, expect, it } from "vitest";
import { isPlainLogValue, sanitizeForLog } from "@/lib/logs/sanitize";

/**
 * The log must never capture a credential. These pin that secret-shaped values
 * are redacted at every depth, whatever casing the key uses.
 */
describe("sanitizeForLog", () => {
  it("redacts top-level secret keys", () => {
    const out = sanitizeForLog({ password: "hunter2", token: "tok", name: "Om" });
    expect(out).toEqual({ password: "[redacted]", token: "[redacted]", name: "Om" });
  });

  it("redacts secret keys nested in objects and arrays", () => {
    const out = sanitizeForLog({
      meta: { refreshToken: "abc", safe: 1 },
      list: [{ apiKey: "k" }, { ok: true }],
    });
    expect(out).toEqual({
      meta: { refreshToken: "[redacted]", safe: 1 },
      list: [{ apiKey: "[redacted]" }, { ok: true }],
    });
  });

  it("matches case-insensitively", () => {
    expect(sanitizeForLog({ API_KEY: "k" })).toEqual({ API_KEY: "[redacted]" });
  });

  it("leaves primitives and safe objects untouched", () => {
    expect(sanitizeForLog("plain")).toBe("plain");
    expect(sanitizeForLog([1, 2, 3])).toEqual([1, 2, 3]);
  });
});

describe("isPlainLogValue", () => {
  it("accepts plain JSON values and rejects functions", () => {
    expect(isPlainLogValue({ a: [1, "x", null] })).toBe(true);
    expect(isPlainLogValue(() => {})).toBe(false);
  });
});
