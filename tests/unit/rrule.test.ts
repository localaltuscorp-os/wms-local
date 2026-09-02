import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { parseRRule, generateOccurrences, ymd } from "@/lib/recurrence/rrule";

function utc(yyyy: number, mm: number, dd: number): Date {
  return new Date(Date.UTC(yyyy, mm - 1, dd));
}

describe("parseRRule", () => {
  it("returns null on garbage", () => {
    expect(parseRRule("")).toBeNull();
    expect(parseRRule("nonsense")).toBeNull();
    // No FREQ → null (we treat FREQ as required, matching the picker).
    expect(parseRRule("BYDAY=MO")).toBeNull();
  });

  it("parses FREQ=DAILY", () => {
    const r = parseRRule("FREQ=DAILY")!;
    expect(r.freq).toBe("DAILY");
  });

  it("parses weekly weekday list", () => {
    const r = parseRRule("FREQ=WEEKLY;BYDAY=MO,WE,FR")!;
    expect(r.freq).toBe("WEEKLY");
    expect(r.byDay).toEqual(["MO", "WE", "FR"]);
  });

  it("parses monthly nth-weekday", () => {
    const r = parseRRule("FREQ=MONTHLY;BYDAY=2MO")!;
    expect(r.freq).toBe("MONTHLY");
    expect(r.monthlyNth).toBe(2);
    expect(r.monthlyWeekday).toBe("MO");
  });

  it("parses monthly nth-weekday with -1 (last)", () => {
    const r = parseRRule("FREQ=MONTHLY;BYDAY=-1FR")!;
    expect(r.monthlyNth).toBe(-1);
    expect(r.monthlyWeekday).toBe("FR");
  });

  it("parses monthly day-of-month", () => {
    const r = parseRRule("FREQ=MONTHLY;BYMONTHDAY=15")!;
    expect(r.byMonthDay).toBe(15);
  });

  it("parses UNTIL in yyyy-mm-dd form", () => {
    const r = parseRRule("FREQ=DAILY;UNTIL=2026-12-31")!;
    expect(r.until).toBe("2026-12-31");
  });

  it("parses UNTIL in yyyymmdd form too", () => {
    const r = parseRRule("FREQ=DAILY;UNTIL=20261231")!;
    expect(r.until).toBe("2026-12-31");
  });
});

describe("generateOccurrences", () => {
  it("emits each subsequent calendar day for DAILY", () => {
    const r = parseRRule("FREQ=DAILY")!;
    const out = generateOccurrences(r, utc(2026, 6, 1), utc(2026, 6, 5));
    // Strictly AFTER anchor; ends inclusive.
    expect(out).toEqual(["2026-06-02", "2026-06-03", "2026-06-04", "2026-06-05"]);
  });

  it("emits the matching weekdays inside the window for WEEKLY", () => {
    // Anchor 2026-06-01 is a Monday. Want MWF.
    const r = parseRRule("FREQ=WEEKLY;BYDAY=MO,WE,FR")!;
    const out = generateOccurrences(r, utc(2026, 6, 1), utc(2026, 6, 14));
    // Strictly-after-Monday means the next emitted day is the Wed.
    expect(out).toEqual([
      "2026-06-03", // Wed
      "2026-06-05", // Fri
      "2026-06-08", // Mon
      "2026-06-10", // Wed
      "2026-06-12", // Fri
    ]);
  });

  it("falls back to anchor's weekday when WEEKLY BYDAY is missing", () => {
    // Anchor 2026-06-01 is a Monday → weekly without BYDAY → Mondays.
    const r = parseRRule("FREQ=WEEKLY")!;
    const out = generateOccurrences(r, utc(2026, 6, 1), utc(2026, 6, 30));
    expect(out).toEqual(["2026-06-08", "2026-06-15", "2026-06-22", "2026-06-29"]);
  });

  it("emits the nth weekday of each month for MONTHLY BYDAY", () => {
    // First Monday of each month
    const r = parseRRule("FREQ=MONTHLY;BYDAY=1MO")!;
    const out = generateOccurrences(r, utc(2026, 6, 1), utc(2026, 9, 30));
    // First Mondays: Jun 1 (anchor → skipped), Jul 6, Aug 3, Sep 7.
    expect(out).toEqual(["2026-07-06", "2026-08-03", "2026-09-07"]);
  });

  it("emits the last weekday of each month for MONTHLY BYDAY=-1xx", () => {
    const r = parseRRule("FREQ=MONTHLY;BYDAY=-1FR")!;
    const out = generateOccurrences(r, utc(2026, 6, 1), utc(2026, 8, 31));
    // Last Fridays: Jun 26, Jul 31, Aug 28.
    expect(out).toEqual(["2026-06-26", "2026-07-31", "2026-08-28"]);
  });

  it("emits day-of-month for MONTHLY BYMONTHDAY", () => {
    const r = parseRRule("FREQ=MONTHLY;BYMONTHDAY=15")!;
    // Anchor 2026-06-01; the 15th of June is strictly after the anchor
    // and is the next occurrence — emit it.
    const out = generateOccurrences(r, utc(2026, 6, 1), utc(2026, 9, 30));
    expect(out).toEqual(["2026-06-15", "2026-07-15", "2026-08-15", "2026-09-15"]);
  });

  it("skips months that can't honour the rule (Feb 30 etc.)", () => {
    const r = parseRRule("FREQ=MONTHLY;BYMONTHDAY=31")!;
    const out = generateOccurrences(r, utc(2026, 1, 1), utc(2026, 6, 30));
    // 2026 is not a leap year. Anchor is Jan 1, so Jan 31 (>1) counts;
    // Feb (no day 31) skipped; Mar 31; Apr (no 31) skipped; May 31;
    // Jun (no 31) skipped.
    expect(out).toEqual(["2026-01-31", "2026-03-31", "2026-05-31"]);
  });

  it("emits same month+day next year for YEARLY", () => {
    const r = parseRRule("FREQ=YEARLY")!;
    const out = generateOccurrences(r, utc(2026, 6, 1), utc(2029, 1, 1));
    expect(out).toEqual(["2027-06-01", "2028-06-01"]);
  });

  it("respects UNTIL (inclusive)", () => {
    const r = parseRRule("FREQ=DAILY;UNTIL=2026-06-03")!;
    const out = generateOccurrences(r, utc(2026, 6, 1), utc(2026, 6, 10));
    expect(out).toEqual(["2026-06-02", "2026-06-03"]);
  });

  it("returns empty when the window is before the anchor", () => {
    const r = parseRRule("FREQ=DAILY")!;
    const out = generateOccurrences(r, utc(2026, 6, 10), utc(2026, 6, 1));
    expect(out).toEqual([]);
  });

  it("caps at MAX_OCCURRENCES so a buggy rule can't spawn thousands", () => {
    // 365-day window on a daily rule generates 365 → cap at 200.
    const r = parseRRule("FREQ=DAILY")!;
    const out = generateOccurrences(r, utc(2026, 1, 1), utc(2027, 1, 1));
    expect(out.length).toBe(200);
  });

  // ── INTERVAL (Google "Repeat every N …") ──────────────────────────────
  it("honours INTERVAL for DAILY (every 2 days)", () => {
    const r = parseRRule("FREQ=DAILY;INTERVAL=2")!;
    expect(r.interval).toBe(2);
    const out = generateOccurrences(r, utc(2026, 6, 1), utc(2026, 6, 9));
    expect(out).toEqual(["2026-06-03", "2026-06-05", "2026-06-07", "2026-06-09"]);
  });

  it("honours INTERVAL for WEEKLY (every 2 weeks on Mon)", () => {
    // Anchor Mon 2026-06-01. Active weeks: anchor week, +2, +4 …
    const r = parseRRule("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO")!;
    const out = generateOccurrences(r, utc(2026, 6, 1), utc(2026, 7, 31));
    // Mondays: Jun 8 (week+1 → skipped), Jun 15 (week+2 → kept), Jun 29, Jul 13, Jul 27.
    expect(out).toEqual(["2026-06-15", "2026-06-29", "2026-07-13", "2026-07-27"]);
  });

  it("honours INTERVAL for MONTHLY (every 2 months on day 1)", () => {
    const r = parseRRule("FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=1")!;
    const out = generateOccurrences(r, utc(2026, 6, 1), utc(2026, 12, 31));
    // Jun (anchor), Aug, Oct, Dec.
    expect(out).toEqual(["2026-08-01", "2026-10-01", "2026-12-01"]);
  });

  it("honours INTERVAL for YEARLY (every 2 years)", () => {
    const r = parseRRule("FREQ=YEARLY;INTERVAL=2")!;
    const out = generateOccurrences(r, utc(2026, 6, 1), utc(2032, 12, 31));
    expect(out).toEqual(["2028-06-01", "2030-06-01", "2032-06-01"]);
  });

  // ── COUNT (Google "After N occurrences") ──────────────────────────────
  it("honours COUNT — anchor is #1, so emits at most count-1 more", () => {
    const r = parseRRule("FREQ=DAILY;COUNT=3")!;
    expect(r.count).toBe(3);
    const out = generateOccurrences(r, utc(2026, 6, 1), utc(2026, 6, 30));
    // #1 = anchor (Jun 1), #2 = Jun 2, #3 = Jun 3 → only 2 generated.
    expect(out).toEqual(["2026-06-02", "2026-06-03"]);
  });

  it("COUNT and INTERVAL combine", () => {
    const r = parseRRule("FREQ=DAILY;INTERVAL=2;COUNT=3")!;
    const out = generateOccurrences(r, utc(2026, 6, 1), utc(2026, 6, 30));
    // every 2 days, 3 total incl anchor → Jun 3, Jun 5.
    expect(out).toEqual(["2026-06-03", "2026-06-05"]);
  });
});

describe("ymd", () => {
  it("zero-pads month and day", () => {
    expect(ymd(utc(2026, 1, 9))).toBe("2026-01-09");
    expect(ymd(utc(2026, 12, 31))).toBe("2026-12-31");
  });
});
