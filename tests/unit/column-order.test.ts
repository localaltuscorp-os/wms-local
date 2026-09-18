import { describe, it, expect } from "vitest";
import { isReordered, moveColumnKey, reconcileColumnOrder } from "@/lib/ui/column-order";

/**
 * Drag-to-reorder columns (account holder, 2026-09-18) — the Event Checklist
 * grid and Checklist Masters keep each person's order in their browser.
 */

const DEFAULTS = ["sr", "client", "subject", "task", "doer"] as const;

describe("moving a column", () => {
  it("lands after a column dropped on to its right, before one to its left", () => {
    expect(moveColumnKey(DEFAULTS, "sr", "subject")).toEqual(["client", "subject", "sr", "task", "doer"]);
    expect(moveColumnKey(DEFAULTS, "doer", "client")).toEqual(["sr", "doer", "client", "subject", "task"]);
  });

  it("goes to either end", () => {
    expect(moveColumnKey(DEFAULTS, "sr", "doer")).toEqual(["client", "subject", "task", "doer", "sr"]);
    expect(moveColumnKey(DEFAULTS, "doer", "sr")).toEqual(["doer", "sr", "client", "subject", "task"]);
  });

  it("leaves the order alone for a drop on itself or an unknown column", () => {
    expect(moveColumnKey(DEFAULTS, "task", "task")).toEqual([...DEFAULTS]);
    expect(moveColumnKey(DEFAULTS, "task", "gone" as never)).toEqual([...DEFAULTS]);
  });

  it("never changes the order it was given", () => {
    const order = [...DEFAULTS];
    moveColumnKey(order, "sr", "doer");
    expect(order).toEqual([...DEFAULTS]);
  });
});

describe("a saved order", () => {
  it("is kept, with unknown columns and repeats dropped", () => {
    expect(reconcileColumnOrder(["task", "sr", "gone", "task", "doer", "client", "subject"], DEFAULTS)).toEqual([
      "task",
      "sr",
      "doer",
      "client",
      "subject",
    ]);
  });

  it("gets a column added since appended at the end", () => {
    expect(reconcileColumnOrder(["doer", "task", "sr"], DEFAULTS)).toEqual(["doer", "task", "sr", "client", "subject"]);
  });

  it("falls back to the table's own order for anything that is not a list", () => {
    expect(reconcileColumnOrder(null, DEFAULTS)).toEqual([...DEFAULTS]);
    expect(reconcileColumnOrder({ sr: 1 }, DEFAULTS)).toEqual([...DEFAULTS]);
    expect(reconcileColumnOrder([3, null, "sr"], DEFAULTS)).toEqual([...DEFAULTS]);
  });

  it("knows when it differs from the default", () => {
    expect(isReordered([...DEFAULTS], DEFAULTS)).toBe(false);
    expect(isReordered(moveColumnKey(DEFAULTS, "sr", "doer"), DEFAULTS)).toBe(true);
  });
});
