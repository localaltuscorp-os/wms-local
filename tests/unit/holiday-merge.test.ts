import { describe, it, expect } from "vitest";
import {
  daysBetween,
  isSunday,
  mergeUpcomingHolidays,
  type MergeableHoliday,
} from "@/lib/attendance/holiday-merge";

// 21 Aug 2026 is a Friday — the day in the screenshot this was reported from.
const TODAY = "2026-08-21";

const h = (date: string, label: string, optional = false): MergeableHoliday => ({
  date,
  label,
  optional,
});

describe("no horizon — the next day off, however far away", () => {
  it("still finds a holiday more than a year out", () => {
    // The old reader capped at the current year + 1, so this came back empty
    // and the panel read "No holidays coming up".
    const out = mergeUpcomingHolidays([h("2028-01-26", "Republic Day")], [], TODAY, 5);
    expect(out).toHaveLength(1);
    expect(out[0]?.date).toBe("2028-01-26");
    expect(out[0]?.inDays).toBe(daysBetween(TODAY, "2028-01-26"));
    expect(out[0]?.inDays).toBeGreaterThan(365);
  });

  it("picks the CLOSEST upcoming one, not the first row handed to it", () => {
    const out = mergeUpcomingHolidays(
      [h("2027-03-01", "Holi"), h("2026-10-20", "Diwali"), h("2026-12-25", "Christmas")],
      [],
      TODAY,
      1,
    );
    expect(out.map((x) => x.label)).toEqual(["Diwali"]);
  });

  it("drops anything already past, and keeps today itself", () => {
    const out = mergeUpcomingHolidays(
      [h("2026-08-15", "Independence Day"), h(TODAY, "Today Off"), h("2026-09-02", "Later")],
      [],
      TODAY,
      5,
    );
    expect(out.map((x) => x.label)).toEqual(["Today Off", "Later"]);
    expect(out[0]?.inDays).toBe(0);
  });
});

describe("Sundays are never listed", () => {
  it("skips a holiday that lands on a Sunday", () => {
    // 2026-08-23 is a Sunday; 2026-08-24 is the Monday after it.
    expect(isSunday("2026-08-23")).toBe(true);
    const out = mergeUpcomingHolidays(
      [h("2026-08-23", "Sunday Festival"), h("2026-08-24", "Monday Festival")],
      [],
      TODAY,
      5,
    );
    expect(out.map((x) => x.label)).toEqual(["Monday Festival"]);
  });

  it("skips Sundays coming from the admin calendar too", () => {
    const out = mergeUpcomingHolidays([], [h("2026-08-23", "Sunday Festival")], TODAY, 5);
    expect(out).toEqual([]);
  });

  it("still surfaces the next NON-Sunday when a run of Sundays is listed", () => {
    const out = mergeUpcomingHolidays(
      [
        h("2026-08-23", "Sun A"),
        h("2026-08-30", "Sun B"),
        h("2026-09-06", "Sun C"),
        h("2026-09-14", "Real Holiday"),
      ],
      [],
      TODAY,
      5,
    );
    expect(out.map((x) => x.label)).toEqual(["Real Holiday"]);
  });

  it("does not let a Sunday in one calendar mask a real holiday in the other", () => {
    // Same date in both — but it is a Sunday, so neither may surface it.
    const out = mergeUpcomingHolidays(
      [h("2026-08-23", "Master Sunday")],
      [h("2026-08-23", "Admin Sunday")],
      TODAY,
      5,
    );
    expect(out).toEqual([]);
  });

  it("identifies Sundays correctly across month and year boundaries", () => {
    expect(isSunday("2027-01-31")).toBe(true);
    expect(isSunday("2026-08-21")).toBe(false); // the Friday in the screenshot
  });
});

describe("the two calendars are merged", () => {
  it("shows holidays from the Admin Panel list and the Events Master together", () => {
    const out = mergeUpcomingHolidays(
      [h("2026-10-20", "Diwali")],
      [h("2026-09-14", "Ganesh Chaturthi")],
      TODAY,
      5,
    );
    expect(out.map((x) => x.label)).toEqual(["Ganesh Chaturthi", "Diwali"]);
  });

  it("collapses a date both calendars claim, preferring the Events Master name", () => {
    // The Holiday List page renders the Master's name — the two screens must not
    // disagree one click apart.
    const out = mergeUpcomingHolidays(
      [h("2026-10-20", "Deepavali")],
      [h("2026-10-20", "Diwali")],
      TODAY,
      5,
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.label).toBe("Deepavali");
  });

  it("works when only the admin calendar has anything", () => {
    const out = mergeUpcomingHolidays([], [h("2026-09-14", "Company Day")], TODAY, 5);
    expect(out.map((x) => x.label)).toEqual(["Company Day"]);
  });

  it("returns nothing when both are empty, rather than throwing", () => {
    expect(mergeUpcomingHolidays([], [], TODAY, 5)).toEqual([]);
  });
});

describe("shape of the result", () => {
  it("is date-sorted and cut to the limit", () => {
    const out = mergeUpcomingHolidays(
      [h("2027-01-01", "D"), h("2026-09-14", "A"), h("2026-12-25", "C"), h("2026-10-20", "B")],
      [],
      TODAY,
      3,
    );
    expect(out.map((x) => x.label)).toEqual(["A", "B", "C"]);
  });

  it("carries the optional flag through, defaulting to false", () => {
    const out = mergeUpcomingHolidays(
      [h("2026-09-14", "Optional Day", true)],
      [h("2026-10-20", "Company Day")],
      TODAY,
      5,
    );
    expect(out[0]?.optional).toBe(true);
    expect(out[1]?.optional).toBe(false);
  });

  it("counts days without drifting across a DST-style boundary", () => {
    expect(daysBetween(TODAY, "2026-08-22")).toBe(1);
    expect(daysBetween("2026-10-25", "2026-10-26")).toBe(1);
    expect(daysBetween("2026-12-31", "2027-01-01")).toBe(1);
  });

  it("tolerates a zero limit without throwing", () => {
    expect(mergeUpcomingHolidays([h("2026-09-14", "A")], [], TODAY, 0)).toEqual([]);
  });
});
