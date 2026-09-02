import { describe, it, expect } from "vitest";
import {
  expandRecurrence,
  weekdayOf,
  weekdayLabels,
  MAX_SERIES_DATES,
  MAX_HORIZON_DAYS,
} from "@/lib/attendance/recurrence";

/**
 * REPEATING REMOTE-WORK REQUESTS (0209).
 *
 * The expansion is the whole feature: one row per date is what approval, the
 * (employee, date) unique index and the 0205 `attendance_logs` trigger all
 * assume. If this function is wrong, a person is granted days nobody agreed to
 * — or refused days they were.
 *
 * 2026-09-24 is a THURSDAY. Every fixture below is anchored to it.
 */

describe("expandRecurrence", () => {
  it("no repeat is just the anchor", () => {
    const r = expandRecurrence({ anchor: "2026-09-24", mode: "none" });
    expect(r).toEqual({ ok: true, dates: ["2026-09-24"] });
  });

  it("daily covers every date to the end, inclusive", () => {
    const r = expandRecurrence({
      anchor: "2026-09-24",
      mode: "daily",
      repeatUntil: "2026-09-27",
    });
    expect(r.ok && r.dates).toEqual([
      "2026-09-24",
      "2026-09-25",
      "2026-09-26",
      "2026-09-27",
    ]);
  });

  it("weekdays skips the weekend", () => {
    const r = expandRecurrence({
      anchor: "2026-09-24", // Thu
      mode: "weekdays",
      repeatUntil: "2026-09-29", // Tue
    });
    // Sat 26th and Sun 27th are absent.
    expect(r.ok && r.dates).toEqual(["2026-09-24", "2026-09-25", "2026-09-28", "2026-09-29"]);
  });

  it("weekly repeats on the anchor's own weekday", () => {
    const r = expandRecurrence({
      anchor: "2026-09-24",
      mode: "weekly",
      repeatUntil: "2026-10-15",
    });
    expect(r.ok && r.dates).toEqual(["2026-09-24", "2026-10-01", "2026-10-08", "2026-10-15"]);
  });

  it("custom takes the chosen weekdays", () => {
    const r = expandRecurrence({
      anchor: "2026-09-28", // Mon
      mode: "custom",
      weekdays: [1, 3], // Mon, Wed
      repeatUntil: "2026-10-07",
    });
    expect(r.ok && r.dates).toEqual([
      "2026-09-28",
      "2026-09-30",
      "2026-10-05",
      "2026-10-07",
    ]);
  });

  it("the ANCHOR is always included, even when the pattern excludes it", () => {
    // Mondays and Wednesdays, starting on a Thursday. Dropping the date the
    // person typed would read as the request having failed.
    const r = expandRecurrence({
      anchor: "2026-09-24", // Thu
      mode: "custom",
      weekdays: [1, 3],
      repeatUntil: "2026-09-30",
    });
    expect(r.ok && r.dates).toEqual(["2026-09-24", "2026-09-28", "2026-09-30"]);
  });

  it("a weekend anchor survives a weekdays repeat", () => {
    const r = expandRecurrence({
      anchor: "2026-09-26", // Sat
      mode: "weekdays",
      repeatUntil: "2026-09-29",
    });
    expect(r.ok && r.dates).toEqual(["2026-09-26", "2026-09-28", "2026-09-29"]);
  });

  it("a repeat with no end date is refused, in words", () => {
    const r = expandRecurrence({ anchor: "2026-09-24", mode: "weekly" });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/end on/i);
  });

  it("an end before the start is refused", () => {
    const r = expandRecurrence({
      anchor: "2026-09-24",
      mode: "daily",
      repeatUntil: "2026-09-20",
    });
    expect(r.ok).toBe(false);
  });

  it("custom with no weekdays chosen is refused", () => {
    const r = expandRecurrence({
      anchor: "2026-09-24",
      mode: "custom",
      weekdays: [],
      repeatUntil: "2026-10-24",
    });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/at least one day/i);
  });

  it("refuses a repeat reaching past the horizon", () => {
    const r = expandRecurrence({
      anchor: "2026-01-01",
      mode: "weekly",
      repeatUntil: "2027-01-01",
    });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(new RegExp(String(MAX_HORIZON_DAYS)));
  });

  it("refuses a repeat that would claim more than the cap", () => {
    // Daily for 100 days is inside the 180-day horizon but far past the
    // per-submission cap — every one of those is a row somebody must decide.
    const r = expandRecurrence({
      anchor: "2026-01-01",
      mode: "daily",
      repeatUntil: "2026-04-10",
    });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(new RegExp(String(MAX_SERIES_DATES)));
  });

  it("accepts a repeat exactly at the cap", () => {
    // 2026-01-01 + 59 days = 2026-03-01, i.e. 60 dates inclusive.
    const r = expandRecurrence({
      anchor: "2026-01-01",
      mode: "daily",
      repeatUntil: "2026-03-01",
    });
    expect(r.ok).toBe(true);
    expect(r.ok && r.dates.length).toBe(MAX_SERIES_DATES);
  });

  it("a malformed anchor is refused rather than producing garbage dates", () => {
    expect(expandRecurrence({ anchor: "24-09-2026", mode: "none" }).ok).toBe(false);
  });

  it("crossing a month and a year boundary stays correct", () => {
    const r = expandRecurrence({
      anchor: "2026-12-30", // Wed
      mode: "weekly",
      repeatUntil: "2027-01-13",
    });
    expect(r.ok && r.dates).toEqual(["2026-12-30", "2027-01-06", "2027-01-13"]);
  });
});

// 2026-09-24 is a Thursday. 2026-09-04 is the first Friday of Sep 2026.
describe("calendar-style extensions", () => {
  it("every 2 days", () => {
    const r = expandRecurrence({ anchor: "2026-09-24", mode: "custom", unit: "day", interval: 2, repeatUntil: "2026-09-30" });
    expect(r.ok && r.dates).toEqual(["2026-09-24", "2026-09-26", "2026-09-28", "2026-09-30"]);
  });
  it("every 2 weeks on Mon+Fri, Monday-anchored fortnights", () => {
    const r = expandRecurrence({ anchor: "2026-09-21", mode: "custom", unit: "week", interval: 2, weekdays: [1, 5], repeatUntil: "2026-10-19" });
    // week of Sep 21 (Mon 21, Fri 25), skip week of Sep 28, week of Oct 5 (Mon 5, Fri 9), skip Oct 12, Mon Oct 19
    expect(r.ok && r.dates).toEqual(["2026-09-21", "2026-09-25", "2026-10-05", "2026-10-09", "2026-10-19"]);
  });
  it("monthly on the 15th", () => {
    const r = expandRecurrence({ anchor: "2026-09-15", mode: "custom", unit: "month", monthly: { kind: "day", day: 15 }, repeatUntil: "2026-12-31" });
    expect(r.ok && r.dates).toEqual(["2026-09-15", "2026-10-15", "2026-11-15", "2026-12-15"]);
  });
  it("the 31st skips short months", () => {
    const r = expandRecurrence({ anchor: "2026-08-31", mode: "custom", unit: "month", monthly: { kind: "day", day: 31 }, repeatUntil: "2027-01-31" });
    // Sep/Nov have 30 days — skipped. Oct 31, Dec 31, Jan 31.
    expect(r.ok && r.dates).toEqual(["2026-08-31", "2026-10-31", "2026-12-31", "2027-01-31"]);
  });
  it("first Monday of every month", () => {
    const r = expandRecurrence({ anchor: "2026-09-07", mode: "custom", unit: "month", monthly: { kind: "weekday", ordinal: 1, weekday: 1 }, repeatUntil: "2026-12-31" });
    expect(r.ok && r.dates).toEqual(["2026-09-07", "2026-10-05", "2026-11-02", "2026-12-07"]);
  });
  it("last Friday of every month", () => {
    const r = expandRecurrence({ anchor: "2026-09-25", mode: "custom", unit: "month", monthly: { kind: "weekday", ordinal: -1, weekday: 5 }, repeatUntil: "2026-12-31" });
    expect(r.ok && r.dates).toEqual(["2026-09-25", "2026-10-30", "2026-11-27", "2026-12-25"]);
  });
  it("last Sunday of every 2 months", () => {
    const r = expandRecurrence({ anchor: "2026-09-27", mode: "custom", unit: "month", interval: 2, monthly: { kind: "weekday", ordinal: -1, weekday: 0 }, repeatUntil: "2027-01-31" });
    expect(r.ok && r.dates).toEqual(["2026-09-27", "2026-11-29", "2027-01-31"]);
  });
  it("ends after N occurrences, anchor counted", () => {
    const r = expandRecurrence({ anchor: "2026-09-24", mode: "weekly", end: "count", count: 3 });
    expect(r.ok && r.dates).toEqual(["2026-09-24", "2026-10-01", "2026-10-08"]);
  });
  it("weekly every 3 weeks with a count", () => {
    const r = expandRecurrence({ anchor: "2026-09-24", mode: "weekly", interval: 3, end: "count", count: 3 });
    expect(r.ok && r.dates).toEqual(["2026-09-24", "2026-10-15", "2026-11-05"]);
  });
  it("never = quiet cap, no error", () => {
    const r = expandRecurrence({ anchor: "2026-09-24", mode: "daily", end: "never" });
    expect(r.ok).toBe(true);
    expect(r.ok && r.dates.length).toBe(MAX_SERIES_DATES);
  });
  it("never on weekly stays inside the horizon", () => {
    const r = expandRecurrence({ anchor: "2026-09-24", mode: "weekly", end: "never" });
    expect(r.ok && r.dates.length).toBe(26); // 180 days / 7 + anchor
  });
  it("count beyond the cap is refused in words", () => {
    const r = expandRecurrence({ anchor: "2026-09-24", mode: "daily", end: "count", count: 99 });
    expect(r.ok).toBe(false);
  });
  it("count without a number is refused", () => {
    const r = expandRecurrence({ anchor: "2026-09-24", mode: "daily", end: "count" });
    expect(r.ok).toBe(false);
  });
  it("monthly without a pattern is refused", () => {
    const r = expandRecurrence({ anchor: "2026-09-24", mode: "custom", unit: "month", repeatUntil: "2026-12-31" });
    expect(r.ok).toBe(false);
  });
  it("anchor still always included when it misses the pattern", () => {
    const r = expandRecurrence({ anchor: "2026-09-24", mode: "custom", unit: "month", monthly: { kind: "day", day: 1 }, repeatUntil: "2026-11-02" });
    expect(r.ok && r.dates).toEqual(["2026-09-24", "2026-10-01", "2026-11-01"]);
  });
});

describe("weekdayOf", () => {
  it("is UTC-stable and matches Date.getUTCDay", () => {
    expect(weekdayOf("2026-09-24")).toBe(4); // Thursday
    expect(weekdayOf("2026-09-27")).toBe(0); // Sunday
  });
});

describe("weekdayLabels", () => {
  it("sorts and names the chosen days", () => {
    expect(weekdayLabels([3, 1, 5])).toBe("Mon, Wed, Fri");
  });
  it("ignores anything outside 0–6", () => {
    expect(weekdayLabels([1, 9, -2])).toBe("Mon");
  });
});
