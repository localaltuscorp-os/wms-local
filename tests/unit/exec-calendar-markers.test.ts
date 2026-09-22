import { describe, expect, it } from "vitest";
import {
  chipDate,
  expandRange,
  isYmd,
  markerSpan,
  markersByDay,
  normaliseDates,
} from "@/lib/exec-calendar/day-markers";
import { CALENDAR_VIEWS, isCalendarView, isNow, periodLabel, periodRange, stepPeriod } from "@/lib/exec-calendar/period";

describe("Day Marker dates", () => {
  it("expands a period to every day in it, in either order", () => {
    expect(expandRange("2026-09-28", "2026-10-02")).toEqual([
      "2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02",
    ]);
    expect(expandRange("2026-10-02", "2026-09-30")).toEqual(["2026-09-30", "2026-10-01", "2026-10-02"]);
  });

  it("caps a period at a year", () => {
    expect(expandRange("2026-01-01", "2030-01-01")).toHaveLength(366);
  });

  it("keeps individual days unique, valid and sorted", () => {
    expect(normaliseDates(["2026-10-04", "2026-09-18", "2026-09-18", "2026-02-30", "nope", "2026-09-21"])).toEqual([
      "2026-09-18", "2026-09-21", "2026-10-04",
    ]);
    expect(isYmd("2026-02-29")).toBe(false);
    expect(isYmd("2028-02-29")).toBe(true);
  });

  it("formats chips as '18 Sep 2026'", () => {
    expect(chipDate("2026-09-18")).toBe("18 Sep 2026");
  });

  it("describes what a marker covers", () => {
    expect(markerSpan({ mode: "day", dates: ["2026-09-18"] })).toBe("18 Sep 2026");
    expect(markerSpan({ mode: "range", dates: ["2026-09-18", "2026-09-19", "2026-09-20"] })).toBe("18 Sep 2026 – 20 Sep 2026");
    expect(markerSpan({ mode: "dates", dates: ["2026-09-18", "2026-10-04"] })).toBe("2 days");
  });

  it("indexes markers by day for the views", () => {
    const m = markersByDay([
      { id: "a", label: "Exam week", mode: "range", dates: ["2026-09-18", "2026-09-19"] },
      { id: "b", label: "Diwali", mode: "day", dates: ["2026-09-19"] },
    ]);
    expect(m.get("2026-09-18")!.map((x) => x.label)).toEqual(["Exam week"]);
    expect(m.get("2026-09-19")!.map((x) => x.label)).toEqual(["Exam week", "Diwali"]);
  });
});

describe("the Weekly Grid view", () => {
  const today = "2026-09-18";

  it("sits left of Week in the switcher", () => {
    const keys = CALENDAR_VIEWS.map((v) => v.key);
    expect(keys.indexOf("grid")).toBe(keys.indexOf("week") - 1);
    expect(CALENDAR_VIEWS.find((v) => v.key === "grid")!.label).toBe("Weekly Grid");
    expect(isCalendarView("grid")).toBe(true);
  });

  it("loads the chosen week and the three after it", () => {
    expect(periodRange("grid", "2026-09-18")).toEqual({ from: "2026-09-14", to: "2026-10-11" });
  });

  it("navigates week by week, labelled like Week", () => {
    expect(stepPeriod("grid", "2026-09-18", 1)).toBe("2026-09-25");
    expect(periodLabel("grid", "2026-09-18", today)).toBe("This week");
    expect(periodLabel("grid", "2026-09-25", today)).toBe("Next week");
    expect(periodLabel("grid", "2026-09-11", today)).toBe("Last week");
    expect(isNow("grid", "2026-09-16", today)).toBe(true);
  });
});
