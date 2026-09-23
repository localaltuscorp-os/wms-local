import { describe, it, expect } from "vitest";
import { MAX_MINUTES, MINUTES_WORDS, hoursText, minutesText, parseMinutes, totalMinutes } from "@/lib/compliance/minutes";

/**
 * WCC's Mins (account holder, 2026-09-19): "Insert Mins — I want to see total
 * Compliance Mins also of all Dailys + all Mondays + all Tuesdays etc."
 */

describe("reading Mins as typed, or from a sheet", () => {
  const ok = (value: number | null) => ({ ok: true, value });
  const bad = { ok: false, error: MINUTES_WORDS };

  it("takes a whole number of minutes", () => {
    expect(parseMinutes(15)).toEqual(ok(15));
    expect(parseMinutes("15")).toEqual(ok(15));
    expect(parseMinutes(" 45 ")).toEqual(ok(45));
    expect(parseMinutes("15.0")).toEqual(ok(15));
    expect(parseMinutes(MAX_MINUTES)).toEqual(ok(MAX_MINUTES));
  });

  it("takes minutes and hours written out", () => {
    expect(parseMinutes("15 mins")).toEqual(ok(15));
    expect(parseMinutes("15m")).toEqual(ok(15));
    expect(parseMinutes("20 Minutes")).toEqual(ok(20));
    expect(parseMinutes("1 h")).toEqual(ok(60));
    expect(parseMinutes("1.5 hours")).toEqual(ok(90));
    expect(parseMinutes("1h 30m")).toEqual(ok(90));
    expect(parseMinutes("2 hrs 15 mins")).toEqual(ok(135));
    expect(parseMinutes("1:30")).toEqual(ok(90));
  });

  it("reads a time typed into Excel — a fraction of a day", () => {
    expect(parseMinutes(30 / 1440)).toEqual(ok(30));
    expect(parseMinutes(0.0625)).toEqual(ok(90));
  });

  it("reads blank as not set", () => {
    expect(parseMinutes("")).toEqual(ok(null));
    expect(parseMinutes("   ")).toEqual(ok(null));
    expect(parseMinutes(null)).toEqual(ok(null));
    expect(parseMinutes(undefined)).toEqual(ok(null));
  });

  it("refuses nothing, too much, part-minutes and words", () => {
    expect(parseMinutes(0)).toEqual(bad);
    expect(parseMinutes("0")).toEqual(bad);
    expect(parseMinutes(MAX_MINUTES + 1)).toEqual(bad);
    expect(parseMinutes("25 hours")).toEqual(bad);
    expect(parseMinutes(12.5)).toEqual(bad);
    expect(parseMinutes(-5)).toEqual(bad);
    expect(parseMinutes("quick")).toEqual(bad);
    expect(parseMinutes("15 secs")).toEqual(bad);
  });
});

describe("Mins in words", () => {
  it("says minutes, and hours beside them from an hour up", () => {
    expect(minutesText(1)).toBe("1 min");
    expect(minutesText(45)).toBe("45 mins");
    expect(minutesText(60)).toBe("60 mins (1 h)");
    expect(minutesText(90)).toBe("90 mins (1 h 30 m)");
    expect(minutesText(185)).toBe("185 mins (3 h 5 m)");
    expect(hoursText(40)).toBe("40 m");
  });
});

describe("adding Mins up", () => {
  it("totals the rows that have Mins and counts the ones that do not", () => {
    expect(totalMinutes([{ minutes: 30 }, { minutes: null }, { minutes: 15 }])).toEqual({ total: 45, timed: 2, untimed: 1 });
    expect(totalMinutes([])).toEqual({ total: 0, timed: 0, untimed: 0 });
  });
});
