import { describe, it, expect } from "vitest";


import { isDifferentList } from "@/lib/tasks/list-pagination";

/**
 * STAYING ON THE PAGE YOU WERE ON.
 *
 * The task list pages client-side, and it used to reset to page 1 whenever the
 * `rows` prop changed IDENTITY. Every inline edit in the table calls
 * `router.refresh()`, which hands down a brand-new array — so setting one row's
 * Doer Status while standing on page 2 of 2 threw the user back to page 1, with
 * the row they had just edited now off-screen.
 *
 * The replacement asks about CONTENT instead: does the new set still contain
 * anything you were looking at? These are the cases that pin that rule down.
 */
describe("isDifferentList — when the task list goes back to page one", () => {
  const set = (...ids: string[]) => new Set(ids);

  it("does NOT reset on the first render, which is already on page one", () => {
    expect(isDifferentList(null, set("a", "b"))).toBe(false);
  });

  it("does NOT reset when a refresh returns exactly the same rows", () => {
    // THE REGRESSION. A new array with the same ids is an edit, not a new list.
    expect(isDifferentList(set("a", "b", "c"), set("a", "b", "c"))).toBe(false);
  });

  it("does NOT reset when the edit removed its own row from the view", () => {
    // Marking a task Done while the list is filtered to Pending. The row leaves,
    // but the other 37 are still the list you were reading.
    expect(isDifferentList(set("a", "b", "c"), set("a", "c"))).toBe(false);
  });

  it("does NOT reset when a row is added to the list you are reading", () => {
    expect(isDifferentList(set("a", "b"), set("a", "b", "d"))).toBe(false);
  });

  it("DOES reset when the new set has nothing in common — a filter change", () => {
    expect(isDifferentList(set("a", "b", "c"), set("x", "y"))).toBe(true);
  });

  it("DOES reset when the filter empties the list", () => {
    // Nowhere to clamp to; page one is the only honest place to stand.
    expect(isDifferentList(set("a", "b"), set())).toBe(true);
  });

  it("DOES reset when a list arrives where there were no rows at all", () => {
    expect(isDifferentList(set(), set("a", "b"))).toBe(true);
  });

  it("holds on a single surviving row, which is the whole point of overlap", () => {
    // 38 Pending tasks filtered down to the one you were editing: still yours.
    expect(isDifferentList(set("a", "b", "c"), set("c"))).toBe(false);
  });
});
