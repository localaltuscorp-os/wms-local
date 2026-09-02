import { describe, it, expect } from "vitest";
import {
  PLAN_SORT_DEFAULT,
  PLAN_SORT_LABELS,
  sortPlanItems,
  type PlanSortable,
} from "@/lib/goals/plan-sort";

/** A row as the board hands it over: age, optional clock slot, and an id so the
 *  assertions can read as the order you'd actually see. */
const row = (id: string, createdAtMs?: number | null, startMin?: number | null): PlanSortable & { id: string } => ({
  id,
  createdAtMs,
  startMin,
});

const ids = (items: { id: string }[]) => items.map((i) => i.id);

describe("plan sort — the board's Oldest ↔ Newest control", () => {
  it("defaults to oldest first", () => {
    expect(PLAN_SORT_DEFAULT).toBe("oldest");
    expect(PLAN_SORT_LABELS.oldest).toBe("Oldest → Newest");
    expect(PLAN_SORT_LABELS.newest).toBe("Newest → Oldest");
  });

  it("orders by when the row was committed to the plan", () => {
    const items = [row("noon", 3_000), row("dawn", 1_000), row("morning", 2_000)];
    expect(ids(sortPlanItems(items, "oldest"))).toEqual(["dawn", "morning", "noon"]);
    expect(ids(sortPlanItems(items, "newest"))).toEqual(["noon", "morning", "dawn"]);
  });

  it("never mutates the array it was given", () => {
    const items = [row("b", 2_000), row("a", 1_000)];
    const before = ids(items);
    sortPlanItems(items, "oldest");
    expect(ids(items)).toEqual(before);
  });

  /**
   * The manual order is the tiebreaker in BOTH directions — this is what keeps
   * drag-to-reorder meaningful. A bulk materialisation stamps the same
   * `created_at` on every row it files, so without this the column's order
   * would be whatever the sort engine felt like.
   */
  it("keeps the dragged order for rows committed in the same moment", () => {
    const items = [row("first", 5_000), row("second", 5_000), row("third", 5_000)];
    expect(ids(sortPlanItems(items, "oldest"))).toEqual(["first", "second", "third"]);
    expect(ids(sortPlanItems(items, "newest"))).toEqual(["first", "second", "third"]);
  });

  it("falls back to the clock slot when two rows share an age", () => {
    const items = [row("late", 5_000, 17 * 60), row("early", 5_000, 9 * 60)];
    expect(ids(sortPlanItems(items, "oldest"))).toEqual(["early", "late"]);
    expect(ids(sortPlanItems(items, "newest"))).toEqual(["late", "early"]);
  });

  /**
   * "Anytime" work has no position on a clock, and an optimistic row that has
   * not come back from the server yet has no known age. Neither may be promoted
   * to the top of the column just because the list was flipped over.
   */
  it("sorts unknowns last whichever way the list points", () => {
    const items = [row("unknown", null), row("known", 1_000)];
    expect(ids(sortPlanItems(items, "oldest"))).toEqual(["known", "unknown"]);
    expect(ids(sortPlanItems(items, "newest"))).toEqual(["known", "unknown"]);

    const anytime = [row("anytime", 5_000, null), row("at-nine", 5_000, 540)];
    expect(ids(sortPlanItems(anytime, "oldest"))).toEqual(["at-nine", "anytime"]);
    expect(ids(sortPlanItems(anytime, "newest"))).toEqual(["at-nine", "anytime"]);
  });

  it("handles the empty and single-item columns", () => {
    expect(sortPlanItems([], "oldest")).toEqual([]);
    expect(ids(sortPlanItems([row("only", 1)], "newest"))).toEqual(["only"]);
  });
});
