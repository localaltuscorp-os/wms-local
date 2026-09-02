import { describe, expect, it } from "vitest";
import {
  activityWindow,
  daysBefore,
  toActivityPeriod,
  DEFAULT_ACTIVITY_PERIOD,
  calendarDaysBetween,
  computeActivityTargets,
} from "@/lib/dashboard/manager-activity-contract";

/**
 * The board's window is the one piece of this feature with no visible failure
 * mode: a month that starts a day late still renders a plausible-looking table,
 * it is just wrong. These pin the boundaries.
 */
describe("activityWindow", () => {
  it("counts rolling windows INCLUSIVE of both ends", () => {
    // 3 days ending the 20th = 18, 19, 20 — not the 17th.
    expect(activityWindow("3d", "2026-08-20")).toEqual({
      from: "2026-08-18",
      to: "2026-08-20",
    });
    expect(activityWindow("7d", "2026-08-20")).toEqual({
      from: "2026-08-14",
      to: "2026-08-20",
    });
  });

  it("anchors This Month to the 1st, not 30 days back", () => {
    expect(activityWindow("month", "2026-08-20")).toEqual({
      from: "2026-08-01",
      to: "2026-08-20",
    });
    // On the 1st the window is a single day, not an empty or inverted range.
    expect(activityWindow("month", "2026-08-01")).toEqual({
      from: "2026-08-01",
      to: "2026-08-01",
    });
  });

  it("anchors This Year to 1 January", () => {
    expect(activityWindow("year", "2026-08-20")).toEqual({
      from: "2026-01-01",
      to: "2026-08-20",
    });
    expect(activityWindow("year", "2026-01-01")).toEqual({
      from: "2026-01-01",
      to: "2026-01-01",
    });
  });

  it("crosses month and year boundaries without drifting", () => {
    // 7 days ending 2 Jan reaches back into the previous year.
    expect(activityWindow("7d", "2026-01-02")).toEqual({
      from: "2025-12-27",
      to: "2026-01-02",
    });
    // Leap day: 3 days ending 1 Mar 2028 must include 29 Feb.
    expect(activityWindow("3d", "2028-03-01")).toEqual({
      from: "2028-02-28",
      to: "2028-03-01",
    });
  });
});

describe("daysBefore", () => {
  it("widens a window back across a month boundary", () => {
    // Weekly goals whose Monday fell before the window still overlap it.
    expect(daysBefore("2026-08-01", 6)).toBe("2026-07-26");
  });
});

describe("toActivityPeriod", () => {
  it("accepts the four real periods", () => {
    for (const p of ["3d", "7d", "month", "year"]) {
      expect(toActivityPeriod(p)).toBe(p);
    }
  });

  it("falls back to the default rather than throwing on junk", () => {
    // A stale bookmark should show the default board, not an error page.
    for (const junk of ["30d", "", null, undefined, 7, {}]) {
      expect(toActivityPeriod(junk)).toBe(DEFAULT_ACTIVITY_PERIOD);
    }
  });
});

describe("activityWindow — custom range", () => {
  it("uses the supplied bounds", () => {
    expect(
      activityWindow("custom", "2026-08-21", { from: "2026-08-10", to: "2026-08-21" }),
    ).toEqual({ from: "2026-08-10", to: "2026-08-21" });
  });

  it("falls back to the default rather than serving an inverted range", () => {
    // An inverted or half-filled range must not reach the query: it would
    // return nothing and look like the filter had been applied.
    const fallback = activityWindow(DEFAULT_ACTIVITY_PERIOD, "2026-08-21");
    expect(activityWindow("custom", "2026-08-21", { from: "2026-08-21", to: "2026-08-10" })).toEqual(fallback);
    expect(activityWindow("custom", "2026-08-21", null)).toEqual(fallback);
  });

  it("accepts a single-day range", () => {
    expect(
      activityWindow("custom", "2026-08-21", { from: "2026-08-21", to: "2026-08-21" }),
    ).toEqual({ from: "2026-08-21", to: "2026-08-21" });
  });
});

describe("pro-rated targets", () => {
  it("counts calendar days inclusively", () => {
    expect(calendarDaysBetween("2026-08-10", "2026-08-21")).toBe(12);
    expect(calendarDaysBetween("2026-08-21", "2026-08-21")).toBe(1);
    // Inverted input is 0, not negative — a negative target would invert the
    // attainment colour rather than just being wrong.
    expect(calendarDaysBetween("2026-08-21", "2026-08-10")).toBe(0);
  });

  it("scales each family by its own rate", () => {
    // 7 calendar days, 6 working: goals 3/7 x 7 = 3; tasks and commitments 5 x 6.
    const t = computeActivityTargets(7, 6);
    expect(t.goals).toBe(3);
    expect(t.tasks).toBe(30);
    expect(t.commitments).toBe(30);
  });

  it("never yields a zero target for a non-empty window", () => {
    // 3/7 x 1 day rounds to 0; a 0 target would make every attainment read as
    // met, so it floors at 1.
    expect(computeActivityTargets(1, 1).goals).toBe(1);
  });

  it("yields zero for an empty window", () => {
    const t = computeActivityTargets(0, 0);
    expect([t.goals, t.tasks, t.commitments]).toEqual([0, 0, 0]);
  });
});
