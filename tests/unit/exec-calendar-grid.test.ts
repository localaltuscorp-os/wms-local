import { describe, it, expect } from "vitest";
import {
  DEFAULT_GRID,
  FULL_DAY_GRID,
  addDays,
  durationLabel,
  gridHeight,
  isoWeek,
  isoWeekLabel,
  layoutDay,
  minToLabel,
  minToTop,
  monthWeeks,
  routineDays,
  rangeLabel,
  slotCount,
  topToMin,
  weekDays,
  weekStart,
  weekdayIndex,
  type GridConfig,
} from "@/lib/exec-calendar/grid";

/**
 * The grid engine. The window is configurable, which is the difference from the
 * module this replaces, so most of these pin behaviour ACROSS windows rather
 * than against one hard-coded day.
 */

describe("the configurable window", () => {
  it("shows 06:30–23:00 in half-hour rows (fixed, 2026-09-18)", () => {
    expect(DEFAULT_GRID).toEqual({ startMin: 390, endMin: 1380, slotMin: 30 });
    expect(slotCount(DEFAULT_GRID)).toBe(33); // 16.5 hours × 2
  });

  it("counts hourly rows when asked for hourly", () => {
    expect(slotCount({ startMin: 420, endMin: 1320, slotMin: 60 })).toBe(15);
  });

  it("still supports a full day for the odd 6am flight", () => {
    expect(slotCount(FULL_DAY_GRID)).toBe(48);
  });

  it("puts the window start at the top, whatever the window", () => {
    expect(minToTop(390, DEFAULT_GRID, 40)).toBe(0);
    expect(minToTop(0, FULL_DAY_GRID, 40)).toBe(0);
  });

  it("places an hour one slot-height down on an hourly grid", () => {
    const hourly: GridConfig = { startMin: 420, endMin: 1320, slotMin: 60 };
    expect(minToTop(480, hourly, 40)).toBe(40);
  });

  it("clamps anything before the window to the top edge rather than off-screen", () => {
    expect(minToTop(5 * 60, DEFAULT_GRID, 40)).toBe(0);
  });

  it("round-trips a drag back to the same minute", () => {
    const top = minToTop(15 * 60, DEFAULT_GRID, 48);
    expect(topToMin(top, DEFAULT_GRID, 48)).toBe(15 * 60);
  });

  it("snaps a sloppy drag to the nearest slot", () => {
    const cfg = DEFAULT_GRID;
    expect(topToMin(minToTop(9 * 60 + 7, cfg, 40), cfg, 40)).toBe(9 * 60);
  });

  it("is as tall as its rows", () => {
    expect(gridHeight(DEFAULT_GRID, 20)).toBe(660);
  });
});

describe("labels", () => {
  it("reads in 12-hour time like the sheet", () => {
    expect(minToLabel(0)).toBe("12:00 AM");
    expect(minToLabel(7 * 60)).toBe("7:00 AM");
    expect(minToLabel(12 * 60)).toBe("12:00 PM");
    expect(minToLabel(20 * 60 + 30)).toBe("8:30 PM");
  });

  it("shows a merged block's span", () => {
    expect(rangeLabel(15 * 60, 20 * 60)).toBe("3:00 PM – 8:00 PM");
  });

  it("reads durations as hours and minutes", () => {
    expect(durationLabel(30)).toBe("30m");
    expect(durationLabel(120)).toBe("2h");
    expect(durationLabel(330)).toBe("5h 30m");
  });
});

describe("days and ISO weeks", () => {
  it("starts the week on Monday", () => {
    expect(weekdayIndex("2026-09-14")).toBe(0); // a Monday
    expect(weekdayIndex("2026-09-20")).toBe(6); // the Sunday
    expect(weekStart("2026-09-17")).toBe("2026-09-14");
    expect(weekDays("2026-09-14").at(-1)).toBe("2026-09-20");
  });

  it("adds days across a month boundary", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("numbers the week the way the sheet does", () => {
    expect(isoWeekLabel("2026-09-17")).toBe("Week No 38");
  });

  it("gives every day of one week the same number", () => {
    const nums = weekDays("2026-09-14").map((d) => isoWeek(d).week);
    expect(new Set(nums).size).toBe(1);
  });

  it("puts a year boundary in the week that owns its Thursday", () => {
    // 1 Jan 2027 is a Friday, so it belongs to the last week of 2026.
    expect(isoWeek("2027-01-01")).toEqual({ week: 53, year: 2026 });
    // 31 Dec 2024 is a Tuesday — week 1 of 2025.
    expect(isoWeek("2024-12-31")).toEqual({ week: 1, year: 2025 });
  });
});

describe("a month as whole weeks, for the dual-month view", () => {
  const weeks = monthWeeks("2026-09-17");

  it("gives every row seven cells", () => {
    for (const w of weeks) expect(w.days).toHaveLength(7);
  });

  it("starts each row on a Monday", () => {
    for (const w of weeks) expect(weekdayIndex(w.days[0]!.ymd)).toBe(0);
  });

  it("marks the padding days as outside the month", () => {
    const first = weeks[0]!;
    expect(first.days.some((d) => !d.inMonth)).toBe(true);
    expect(first.days.filter((d) => d.inMonth).every((d) => d.ymd.startsWith("2026-09"))).toBe(true);
  });

  it("carries the ISO number on each row", () => {
    expect(weeks.map((w) => w.label)).toContain("Week No 38");
  });
});

/* ── §4C: multi-hour spans and overlap columns ───────────────────────────── */

const ev = (id: string, startMin: number, endMin: number, day = "2026-09-14") => ({
  id,
  day,
  startMin,
  endMin,
});

describe("laying out a day", () => {
  it("draws 15:00–20:00 as ONE tall block, not ten stacked cells", () => {
    const [b] = layoutDay([ev("a", 15 * 60, 20 * 60)], DEFAULT_GRID, 40);
    expect(b!.height).toBe(minToTop(20 * 60, DEFAULT_GRID, 40) - minToTop(15 * 60, DEFAULT_GRID, 40));
    expect(b!.columns).toBe(1);
  });

  it("puts two events that start together side by side", () => {
    const out = layoutDay([ev("a", 10 * 60, 12 * 60), ev("b", 10 * 60 + 15, 13 * 60)], DEFAULT_GRID, 40);
    expect(out.every((b) => b.columns === 2)).toBe(true);
    expect(new Set(out.map((b) => b.column))).toEqual(new Set([0, 1]));
  });

  it("nests an event that starts well into another instead of squeezing both", () => {
    const out = layoutDay([ev("a", 10 * 60, 12 * 60), ev("b", 11 * 60, 13 * 60)], DEFAULT_GRID, 40);
    const a = out.find((b) => b.event.id === "a")!;
    const b = out.find((b) => b.event.id === "b")!;
    expect(a.columns).toBe(1);
    expect(b.depth).toBe(1);
    expect(b.z).toBeGreaterThan(a.z);
  });

  it("does not widen events that merely touch", () => {
    const out = layoutDay([ev("a", 10 * 60, 11 * 60), ev("b", 11 * 60, 12 * 60)], DEFAULT_GRID, 40);
    expect(out.every((b) => b.columns === 1)).toBe(true);
  });

  it("keeps separate clusters from widening each other", () => {
    // Morning pair overlaps; the evening one is alone and must stay full width.
    const out = layoutDay(
      [ev("a", 8 * 60, 10 * 60), ev("b", 9 * 60, 11 * 60), ev("c", 18 * 60, 19 * 60)],
      DEFAULT_GRID,
      40,
    );
    expect(out.find((b) => b.event.id === "c")!.columns).toBe(1);
    expect(out.find((b) => b.event.id === "c")!.depth).toBe(0);
    expect(out.find((b) => b.event.id === "b")!.depth).toBe(1);
  });

  it("clamps an event that starts before the window instead of losing it", () => {
    const [b] = layoutDay([ev("early", 6 * 60, 8 * 60)], DEFAULT_GRID, 40);
    expect(b!.top).toBe(0);
    expect(b!.height).toBeGreaterThan(0);
  });

  it("pins what lies wholly outside the window to its edge instead of losing it", () => {
    const [late] = layoutDay([ev("night", 23 * 60, 23 * 60 + 30)], DEFAULT_GRID, 40);
    expect(late!.pinned).toBe("after");
    expect(late!.top + late!.height).toBe(gridHeight(DEFAULT_GRID, 40));
    const [early] = layoutDay([ev("dawn", 5 * 60, 6 * 60)], DEFAULT_GRID, 40);
    expect(early!.pinned).toBe("before");
    expect(early!.top).toBe(0);
  });

  it("ignores a zero-length or reversed block", () => {
    expect(layoutDay([ev("x", 10 * 60, 10 * 60), ev("y", 12 * 60, 11 * 60)], DEFAULT_GRID, 40)).toEqual([]);
  });

  it("gives even a 15-minute block a clickable height", () => {
    const [b] = layoutDay([ev("tiny", 10 * 60, 10 * 60 + 15)], DEFAULT_GRID, 40);
    expect(b!.height).toBeGreaterThanOrEqual(20);
  });
});

/* ── §4B: which days a routine stamps ────────────────────────────────────── */

describe("stamping a routine across a range", () => {
  it("takes only the chosen weekdays", () => {
    const days = routineDays("2026-09-14", "2026-09-27", [0, 4]); // Mondays + Fridays
    expect(days).toEqual([
      "2026-09-14", "2026-09-18", "2026-09-21", "2026-09-25",
    ]);
  });

  it("treats NO days picked as every day, not as no days", () => {
    expect(routineDays("2026-09-14", "2026-09-20", [])).toHaveLength(7);
  });

  it("includes both ends of the range", () => {
    const days = routineDays("2026-09-14", "2026-09-14", [0]);
    expect(days).toEqual(["2026-09-14"]);
  });

  it("crosses a month boundary without dropping a day", () => {
    const days = routineDays("2026-09-28", "2026-10-05", [0]); // Mondays
    expect(days).toEqual(["2026-09-28", "2026-10-05"]);
  });

  it("crosses a YEAR boundary too", () => {
    expect(routineDays("2026-12-28", "2027-01-04", [0])).toEqual(["2026-12-28", "2027-01-04"]);
  });

  it("gives nothing back when the range is inverted", () => {
    expect(routineDays("2026-09-20", "2026-09-14", [])).toEqual([]);
  });

  it("gives nothing back for a weekday that never falls in the range", () => {
    // 14–16 Sep 2026 is Mon–Wed; ask for Sunday.
    expect(routineDays("2026-09-14", "2026-09-16", [6])).toEqual([]);
  });
});

describe("padding months to one height for the year view", () => {
  it("leaves a month alone by default", () => {
    // Feb 2027 starts on a Monday and has exactly four weeks.
    expect(monthWeeks("2027-02-10")).toHaveLength(4);
  });

  it("pads every month to six rows when asked", () => {
    for (const m of ["2027-02-10", "2026-09-17", "2026-03-01"]) {
      expect(monthWeeks(m, 6)).toHaveLength(6);
    }
  });

  it("marks the padding rows as outside the month", () => {
    const rows = monthWeeks("2027-02-10", 6);
    expect(rows.at(-1)!.days.every((d) => !d.inMonth)).toBe(true);
  });
});
