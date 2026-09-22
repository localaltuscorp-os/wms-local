import { describe, expect, it } from "vitest";
import { DEFAULT_GRID, SIDE_BY_SIDE_MIN, layoutDay, type PositionedBlock } from "@/lib/exec-calendar/grid";

/**
 * The Google-Calendar-style cascade (asked 2026-09-18). The owner's own example
 * day, 19 Sep: event 3 04:00–09:00, event 6 06:00–08:30, events 1 and 2 from
 * 07:30, event 4 10:00–12:00. (Event 1 ran past midnight in the example; blocks
 * are same-day only, so here it runs to the end of the window.)
 */

type Ev = { id: string; day: string; startMin: number; endMin: number };
const ev = (id: string, h1: number, h2: number): Ev => ({ id, day: "2026-09-19", startMin: Math.round(h1 * 60), endMin: Math.round(h2 * 60) });
const byId = <T extends Ev>(out: PositionedBlock<T>[], id: string) => out.find((b) => b.event.id === id)!;
const H = 26;

describe("the owner's example day", () => {
  const out = layoutDay(
    [ev("e3", 4, 9), ev("e6", 6, 8.5), ev("e1", 7.5, 23), ev("e2", 7.5, 17.5), ev("e4", 10, 12)],
    DEFAULT_GRID,
    H,
  );

  it("keeps the long early block wide - later ones overlay it", () => {
    const e3 = byId(out, "e3");
    expect(e3.column).toBe(0);
    expect(e3.depth).toBe(0);
    expect(e3.span).toBe(e3.columns);
  });

  it("nests event 6 inside event 3", () => {
    const e6 = byId(out, "e6");
    expect(e6.column).toBe(0);
    expect(e6.depth).toBe(1);
    expect(e6.z).toBeGreaterThan(byId(out, "e3").z);
  });

  it("puts events 1 and 2 (same start) side by side, in different columns", () => {
    const e1 = byId(out, "e1");
    const e2 = byId(out, "e2");
    expect(e1.column).not.toBe(e2.column);
    // Neither widens over the other.
    const [left, right] = e1.column < e2.column ? [e1, e2] : [e2, e1];
    expect(left.column + left.span).toBeLessThanOrEqual(right.column);
  });

  it("draws later blocks above earlier ones", () => {
    const order = [...out].sort((a, b) => a.z - b.z).map((b) => b.event.id);
    expect(order.indexOf("e3")).toBeLessThan(order.indexOf("e6"));
    expect(order.indexOf("e6")).toBeLessThan(order.indexOf("e1"));
    expect(order.indexOf("e1")).toBeLessThan(order.indexOf("e4"));
  });

  it("nests event 4 on what is still running at 10:00", () => {
    const e4 = byId(out, "e4");
    expect(e4.depth).toBeGreaterThan(0);
  });
});

describe("side by side vs nested", () => {
  it(`uses ${SIDE_BY_SIDE_MIN} minutes as the line`, () => {
    const close = layoutDay([ev("a", 10, 12), ev("b", 10 + (SIDE_BY_SIDE_MIN - 1) / 60, 12)], DEFAULT_GRID, H);
    expect(byId(close, "b").column).toBe(1);
    const far = layoutDay([ev("a", 10, 12), ev("b", 10 + SIDE_BY_SIDE_MIN / 60, 12)], DEFAULT_GRID, H);
    expect(byId(far, "b").column).toBe(0);
    expect(byId(far, "b").depth).toBe(1);
  });

  it("gives three blocks starting together three equal columns", () => {
    const out = layoutDay([ev("a", 9, 10), ev("b", 9, 10), ev("c", 9, 10)], DEFAULT_GRID, H);
    expect(out.map((b) => [b.column, b.span, b.columns])).toEqual([
      [0, 1, 3],
      [1, 1, 3],
      [2, 1, 3],
    ]);
  });

  it("lets a block widen into a column that is free for its whole span", () => {
    // a+b start together (2 columns); c starts after b has ended and should
    // take the full width, not half of it.
    const out = layoutDay([ev("a", 9, 12), ev("b", 9, 10), ev("c", 10.5, 11)], DEFAULT_GRID, H);
    const c = byId(out, "c");
    expect(c.depth).toBe(1); // nested on a, which is still running
    expect(c.column).toBe(0);
    expect(c.span).toBe(2); // b's column is free from 10:00
  });
});

describe("all-day blocks in the timeline", () => {
  it("fill the window and take part in the cascade", () => {
    const allDay = { id: "all", day: "2026-09-18", startMin: DEFAULT_GRID.startMin, endMin: DEFAULT_GRID.endMin };
    const out = layoutDay([allDay, ev("m", 10, 11)], DEFAULT_GRID, H);
    const a = byId(out, "all");
    expect(a.top).toBe(0);
    expect(a.span).toBe(a.columns);
    expect(byId(out, "m").depth).toBe(1);
  });

  it("sit side by side when two of them share a day", () => {
    const w = { startMin: DEFAULT_GRID.startMin, endMin: DEFAULT_GRID.endMin, day: "2026-09-18" };
    const out = layoutDay([{ id: "x", ...w }, { id: "y", ...w }], DEFAULT_GRID, H);
    expect(out.map((b) => b.column).sort()).toEqual([0, 1]);
  });
});
