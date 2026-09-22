import { describe, it, expect } from "vitest";
import { sortPlanTree, isBlankIn, type SortableNode } from "@/lib/project-plan/sort";
import { TASK_PRIORITIES } from "@/db/enums";
import { codeOf } from "../fixtures/source-code";

/**
 * THE TABLE IS A HIERARCHY, AND SORTING MUST NOT FLATTEN IT.
 *
 * Projects hold milestones hold results hold actions. Ordering the rows as one
 * list would tear children away from their parents, so what is asserted below
 * is that each SIBLING RUN is ordered on its own and the shape survives — and
 * that blanks stay at the bottom whichever direction was asked for, because an
 * unset date is not "the earliest" and a reversed column should not open on a
 * block of rows nobody has filled in.
 */

// The REAL enum, not a stand-in: it is declared most-urgent-first, and the
// ranking depends on that, so a local fixture could quietly drift from it.
const PRIORITIES = TASK_PRIORITIES;

function node(name: string, extra: Partial<SortableNode> = {}): SortableNode {
  return { name, children: [], ...extra };
}

const names = (rows: SortableNode[]) => rows.map((r) => r.name);

describe("sortPlanTree", () => {
  it("orders siblings and leaves the hierarchy standing", () => {
    const tree = [
      node("Beta", { children: [node("b2"), node("b1")] }),
      node("Alpha", { children: [node("a2"), node("a1")] }),
    ];
    const out = sortPlanTree(tree, "name");
    expect(names(out)).toEqual(["Alpha", "Beta"]);
    // Children moved WITH their parents, and were sorted inside them.
    expect(names(out[0]!.children)).toEqual(["a1", "a2"]);
    expect(names(out[1]!.children)).toEqual(["b1", "b2"]);
  });

  it("reverses on desc", () => {
    const tree = [node("Alpha"), node("Charlie"), node("Beta")];
    expect(names(sortPlanTree(tree, "name", "desc"))).toEqual(["Charlie", "Beta", "Alpha"]);
  });

  it("does not mutate the tree it was given", () => {
    const tree = [node("Beta"), node("Alpha")];
    const before = names(tree);
    sortPlanTree(tree, "name", "desc");
    expect(names(tree)).toEqual(before);
  });

  it("keeps blanks LAST in both directions", () => {
    const tree = [
      node("no owner"),
      node("zara", { ownerName: "Zara" }),
      node("aarti", { ownerName: "Aarti" }),
      node("also blank", { ownerName: null }),
    ];
    expect(names(sortPlanTree(tree, "owner", "asc"))).toEqual([
      "aarti", "zara", "no owner", "also blank",
    ]);
    // Reversed: the two NAMED rows swap, the blanks do not climb to the top.
    expect(names(sortPlanTree(tree, "owner", "desc"))).toEqual([
      "zara", "aarti", "no owner", "also blank",
    ]);
  });

  it("sorts dates chronologically, not alphabetically", () => {
    const tree = [
      node("sep", { targetDate: "2026-09-02" }),
      node("dec", { targetDate: "2026-12-01" }),
      node("jan", { targetDate: "2026-01-30" }),
    ];
    expect(names(sortPlanTree(tree, "target"))).toEqual(["jan", "sep", "dec"]);
  });

  it("sorts progress as a number — 9 before 10, never '10' before '9'", () => {
    const tree = [
      node("ten", { progressPercent: 10 }),
      node("nine", { progressPercent: 9 }),
      node("hundred", { progressPercent: 100 }),
    ];
    expect(names(sortPlanTree(tree, "progress"))).toEqual(["nine", "ten", "hundred"]);
  });

  it("counts zero as a value, not a blank", () => {
    // 0% done is a real answer — the row has been looked at and nothing is
    // finished. Treating it as "not filled in" would bury it with the blanks.
    const tree = [node("blank"), node("zero", { progressPercent: 0 }), node("half", { progressPercent: 50 })];
    expect(names(sortPlanTree(tree, "progress"))).toEqual(["zero", "half", "blank"]);
    expect(isBlankIn(tree[1]!, "progress")).toBe(false);
  });

  it("ranks priority least-urgent first, so desc puts the emergencies on top", () => {
    const tree = [
      node("important", { priority: "imp_not_urgent" }),
      node("critical", { priority: "imp_urgent" }),
      node("low", { priority: "not_imp_not_urgent" }),
    ];
    expect(names(sortPlanTree(tree, "priority", "asc", PRIORITIES))).toEqual(["low", "important", "critical"]);
    expect(names(sortPlanTree(tree, "priority", "desc", PRIORITIES))).toEqual(["critical", "important", "low"]);
  });

  it("reads each column off whichever record holds it", () => {
    // An executable row's doer and status live on its TASK; a container's doer
    // is its owner. Sorting has to agree with what the cell renders.
    const tree = [
      node("container", { ownerName: "Zara" }),
      node("executable", { ownerName: "ignored", task: { doerName: "Aarti" } }),
    ];
    expect(names(sortPlanTree(tree, "doer"))).toEqual(["executable", "container"]);
  });

  it("compares Days by span, not by either endpoint", () => {
    const tree = [
      node("long", { startsAt: "2026-01-01T00:00:00Z", endsAt: "2026-03-01T00:00:00Z" }),
      node("short", { startsAt: "2026-02-01T00:00:00Z", endsAt: "2026-02-03T00:00:00Z" }),
      node("open ended", { startsAt: "2026-01-01T00:00:00Z" }),
    ];
    expect(names(sortPlanTree(tree, "days"))).toEqual(["short", "long", "open ended"]);
  });

  it("puts scheduled rows above unscheduled ones in the WMS column", () => {
    const tree = [node("not scheduled"), node("scheduled", { task: { statusLabel: "Open" } })];
    expect(names(sortPlanTree(tree, "wms"))).toEqual(["scheduled", "not scheduled"]);
  });

  it("ignores case when ordering names", () => {
    const tree = [node("banana"), node("Apple"), node("cherry")];
    expect(names(sortPlanTree(tree, "name"))).toEqual(["Apple", "banana", "cherry"]);
  });
});

/**
 * THE TABLE MUST BE AS WIDE AS ITS OWN COLUMNS.
 *
 * The board declared `min-w-[1960px]` with a comment estimating the columns at
 * "≈1730px". Columns were added afterwards and the number was not, so the table
 * promised less room than it needed and the browser made up the difference by
 * squeezing every column — which is how "Krish Maheshwari" came to read
 * "Krish" in the Owner cell (Manan, 2026-09-21).
 *
 * Asserted on the source because the bug is a CONSTANT going stale, and a
 * constant that is derived cannot.
 */
describe("the project table's width", () => {
  const board = codeOf("components/project-plan/plan-board.tsx");

  it("is computed from the columns on screen, not hardcoded", () => {
    expect(board).toContain("function tableMinWidth(");
    expect(board).toContain("style={{ minWidth: tableMinWidth(shownCols) }}");
  });

  it("no longer carries a fixed min-width class on the table", () => {
    expect(board).not.toMatch(/<table[^>]*min-w-\[\d+px\]/);
  });

  it("reads each column's width from the class it already declares", () => {
    // Two places naming the same number is the way it went stale the first
    // time, so the pixel figure is parsed off the Tailwind class rather than
    // repeated beside it.
    expect(board).toContain("const COL_PX = new Map<ColKey, number>(");
    expect(board).toContain("exec(c.width)");
  });
});
