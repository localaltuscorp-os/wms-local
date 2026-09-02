import { describe, it, expect } from "vitest";
import { parseLegacyDate } from "@/lib/import/parse-date";

describe("parseLegacyDate", () => {
  it("treats yyyy-mm-dd as IST midnight (Asia/Kolkata)", () => {
    // 2025-11-04 00:00 IST = 2025-11-03 18:30 UTC
    const d = parseLegacyDate("2025-11-04");
    expect(d.toISOString()).toBe("2025-11-03T18:30:00.000Z");
  });

  it("trims whitespace around the date", () => {
    const d = parseLegacyDate("  2025-11-04  ");
    expect(d.toISOString()).toBe("2025-11-03T18:30:00.000Z");
  });

  it("falls back to native Date for non-yyyy-mm-dd inputs", () => {
    const d = parseLegacyDate("2025-11-04T12:00:00Z");
    expect(d.toISOString()).toBe("2025-11-04T12:00:00.000Z");
  });
});
