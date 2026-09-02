import { describe, it, expect } from "vitest";
import { withTimeout, withTimeoutOr, DbTimeoutError } from "@/lib/db/with-timeout";

const wait = <T>(ms: number, value: T) => new Promise<T>((r) => setTimeout(() => r(value), ms));
const hang = <T = never>() => new Promise<T>(() => {}); // never settles

describe("withTimeout", () => {
  it("resolves with the value when work finishes before the deadline", async () => {
    await expect(withTimeout(wait(5, "ok"), 100, "fast")).resolves.toBe("ok");
  });

  it("rejects with DbTimeoutError when work hangs past the deadline", async () => {
    await expect(withTimeout(hang(), 20, "hang")).rejects.toBeInstanceOf(DbTimeoutError);
  });

  it("propagates the underlying rejection (not swallowed)", async () => {
    const boom = Promise.reject(new Error("boom"));
    await expect(withTimeout(boom, 100, "err")).rejects.toThrow("boom");
  });
});

describe("withTimeoutOr", () => {
  it("returns the value on success", async () => {
    await expect(withTimeoutOr(wait(5, 42), 100, -1, "fast")).resolves.toBe(42);
  });

  it("returns the fallback on timeout (never rejects)", async () => {
    await expect(withTimeoutOr(hang<number>(), 20, -1, "hang")).resolves.toBe(-1);
  });

  it("returns the fallback on error too", async () => {
    await expect(withTimeoutOr(Promise.reject(new Error("x")), 100, "fb", "err")).resolves.toBe("fb");
  });
});
