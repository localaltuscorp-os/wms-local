import { describe, it, expect } from "vitest";
import { deriveShortId, nextShortIdCandidate } from "@/lib/import/short-id";

describe("deriveShortId", () => {
  it("returns the first 10 hex chars of a UUID, dashes stripped", () => {
    expect(deriveShortId("a8888888-8888-4888-8888-888888888013")).toBe("a888888888");
  });
  it("is deterministic for the same UUID", () => {
    const id = "11111111-2222-4333-8444-555566667777";
    expect(deriveShortId(id)).toBe(deriveShortId(id));
  });
  it("is URL-safe (only hex chars)", () => {
    const out = deriveShortId("a8888888-8888-4888-8888-888888888013");
    expect(out).toMatch(/^[0-9a-f]+$/);
    expect(out).toHaveLength(10);
  });
});

describe("nextShortIdCandidate", () => {
  it("returns sequential 10-char slices of the dashless UUID", () => {
    const id = "11112222-3333-4444-5555-666677778888";
    expect(nextShortIdCandidate(id, 0)).toBe("1111222233");
    expect(nextShortIdCandidate(id, 1)).toBe("1112222333");
    expect(nextShortIdCandidate(id, 2)).toBe("1122223333");
  });
  it("returns null when the offset would exceed the UUID length", () => {
    // 32 hex chars - 10 = 23 max offset.
    const id = "11112222-3333-4444-5555-666677778888";
    expect(nextShortIdCandidate(id, 22)).not.toBeNull();
    expect(nextShortIdCandidate(id, 23)).toBeNull();
  });
});
