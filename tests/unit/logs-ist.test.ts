import { describe, expect, it } from "vitest";
import { istDateKey, istTodayKey, toIst } from "@/lib/logs/ist";

/**
 * The daily-session boundary is the IST calendar day, not UTC and not server
 * time. These pin that an instant one second after 23:59:59 IST lands on the
 * NEXT day's session.
 */
describe("istDateKey", () => {
  it("maps 18:30:00Z to the next IST day (00:00 IST)", () => {
    // 2026-09-21T18:30:00Z == 2026-09-22T00:00:00 IST
    expect(istDateKey(new Date("2026-09-21T18:30:00.000Z"))).toBe("2026-09-22");
  });

  it("maps one second earlier to the previous IST day (23:59:59 IST)", () => {
    expect(istDateKey(new Date("2026-09-21T18:29:59.000Z"))).toBe("2026-09-21");
  });

  it("agrees across the UTC midnight boundary", () => {
    // 2026-09-21T23:30:00Z is still 2026-09-22 IST morning.
    expect(istDateKey(new Date("2026-09-21T23:30:00.000Z"))).toBe("2026-09-22");
  });
});

describe("istTodayKey", () => {
  it("is the IST date of the given instant", () => {
    expect(istTodayKey(new Date("2026-09-21T18:30:00.000Z"))).toBe("2026-09-22");
  });
});

describe("toIst", () => {
  it("shifts by +05:30", () => {
    const shifted = toIst(new Date("2026-09-21T18:30:00.000Z"));
    expect(shifted.toISOString()).toBe("2026-09-22T00:00:00.000Z");
  });
});
