import { describe, it, expect } from "vitest";
import {
  MAX_CUSTOM_DATES,
  firstUpcomingCustomDate,
  nextOccurrence,
  normaliseCustomDates,
} from "@/lib/ecos/recurrence";

const d = (iso: string) => new Date(iso);

describe("nextOccurrence — daily and weekly", () => {
  it("steps one day", () => {
    const prev = d("2026-09-15T04:00:00Z");
    expect(nextOccurrence(prev, "daily", prev)?.toISOString()).toBe("2026-09-16T04:00:00.000Z");
  });

  it("steps one week", () => {
    const prev = d("2026-09-01T04:00:00Z");
    expect(nextOccurrence(prev, "weekly", d("2026-09-01T04:00:01Z"))?.toISOString()).toBe(
      "2026-09-08T04:00:00.000Z",
    );
  });

  it("catches up with ONE step past now instead of a burst", () => {
    const prev = d("2026-09-10T04:00:00Z");
    const now = d("2026-09-15T05:00:00Z");
    expect(nextOccurrence(prev, "daily", now)?.toISOString()).toBe("2026-09-16T04:00:00.000Z");
  });
});

describe("nextOccurrence — monthly and annually keep the first day of the month", () => {
  it("31 Jan → 28 Feb → 31 Mar (does not drift to the 28th)", () => {
    const anchor = d("2026-01-31T04:00:00Z"); // 09:30 IST
    const feb = nextOccurrence(anchor, "monthly", anchor, { anchor })!;
    expect(feb.toISOString()).toBe("2026-02-28T04:00:00.000Z");
    const mar = nextOccurrence(feb, "monthly", feb, { anchor })!;
    expect(mar.toISOString()).toBe("2026-03-31T04:00:00.000Z");
  });

  it("uses the India calendar day, not the UTC one", () => {
    // 00:30 IST on 31 Jan is 19:00 UTC on 30 Jan.
    const anchor = d("2026-01-30T19:00:00Z");
    const next = nextOccurrence(anchor, "monthly", anchor, { anchor })!;
    // 00:30 IST on 28 Feb.
    expect(next.toISOString()).toBe("2026-02-27T19:00:00.000Z");
  });

  it("29 Feb → 28 Feb in ordinary years → 29 Feb in the next leap year", () => {
    const anchor = d("2028-02-29T04:00:00Z");
    let at = anchor;
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) {
      at = nextOccurrence(at, "annually", at, { anchor })!;
      seen.push(at.toISOString().slice(0, 10));
    }
    expect(seen).toEqual(["2029-02-28", "2030-02-28", "2031-02-28", "2032-02-29"]);
  });

  it("a one-time broadcast has no next occurrence", () => {
    const prev = d("2026-09-15T04:00:00Z");
    expect(nextOccurrence(prev, "none", prev)).toBeNull();
  });
});

describe("custom dates", () => {
  const list = [
    "2026-10-01T04:00:00Z",
    "not a date",
    "2026-09-01T04:00:00Z",
    "2026-12-25T04:00:00Z",
    "2026-10-01T04:00:00.000Z",
    42,
  ];

  it("are cleaned: valid, unique, sorted", () => {
    expect(normaliseCustomDates(list)).toEqual([
      "2026-09-01T04:00:00.000Z",
      "2026-10-01T04:00:00.000Z",
      "2026-12-25T04:00:00.000Z",
    ]);
    expect(normaliseCustomDates(null)).toEqual([]);
  });

  it("are capped", () => {
    const many = Array.from({ length: MAX_CUSTOM_DATES + 10 }, (_, i) =>
      new Date(Date.UTC(2027, 0, 1 + i)).toISOString(),
    );
    expect(normaliseCustomDates(many)).toHaveLength(MAX_CUSTOM_DATES);
  });

  it("go out on the next listed date after both the last send and now", () => {
    const now = d("2026-09-15T00:00:00Z");
    expect(firstUpcomingCustomDate(list, now)?.toISOString()).toBe("2026-10-01T04:00:00.000Z");
    const afterOct = nextOccurrence(d("2026-10-01T04:00:00Z"), "custom", now, { customDates: list });
    expect(afterOct?.toISOString()).toBe("2026-12-25T04:00:00.000Z");
  });

  it("stop when the list runs out", () => {
    const now = d("2026-09-15T00:00:00Z");
    expect(nextOccurrence(d("2026-12-25T04:00:00Z"), "custom", now, { customDates: list })).toBeNull();
  });
});
