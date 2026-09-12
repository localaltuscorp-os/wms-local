import { describe, it, expect } from "vitest";
import {
  ariaSort,
  describeSort,
  nextSort,
  sortChecklistRows,
  type SortableRow,
  type SortKey,
  type SortState,
} from "@/lib/operations/checklist-sort";
import { compareRows } from "@/lib/operations/checklist-dates";

/**
 * SORTING THE EVENT CHECKLIST (account holder, 2026-09-12).
 *
 * The three rules that are easy to get wrong and impossible to see in a
 * screenshot: a sort must be undoable back to the plan's own order, blanks must
 * sink under BOTH arrows, and equal values must not reshuffle the checklist.
 *
 * Sorting within a phase rather than across phases is enforced by the caller —
 * it sorts one group at a time — so what is pinned here is the comparator those
 * groups run through.
 */

type Row = SortableRow & { id: string };

const NAMES: Record<string, string> = {
  p1: "Rakesh Mehta",
  p2: "Om Trivedi",
  p3: "Manan Vasa",
};

function row(id: string, over: Partial<Row> = {}): Row {
  return {
    id,
    offsetDays: 0,
    sortOrder: 100,
    title: `Task ${id}`,
    doerId: null,
    backupId: null,
    status: "Pending",
    doneAt: null,
    ...over,
  };
}

const TARGETS: Record<string, string | null> = {};
const VARIANCES: Record<string, number | null> = {};

const ctx = {
  nameOf: (id: string | null) => (id ? (NAMES[id] ?? null) : null),
  targetOf: (r: Row) => TARGETS[r.id] ?? null,
  varianceOf: (r: Row) => VARIANCES[r.id] ?? null,
  natural: compareRows,
};

const ids = (rows: Row[]) => rows.map((r) => r.id);
const sortBy = (rows: Row[], key: SortKey, dir: "asc" | "desc") =>
  ids(sortChecklistRows(rows, { key, dir }, ctx));

describe("what a header click does", () => {
  it("cycles ascending → descending → back to the plan's order", () => {
    /* THE THIRD CLICK IS THE POINT. Rows carry a manual order that somebody
       arranged on purpose; a sort with no way back would quietly replace a
       deliberate sequence with an alphabet. */
    let s: SortState = null;
    s = nextSort(s, "doer");
    expect(s).toEqual({ key: "doer", dir: "asc" });
    s = nextSort(s, "doer");
    expect(s).toEqual({ key: "doer", dir: "desc" });
    s = nextSort(s, "doer");
    expect(s).toBeNull();
  });

  it("starts a different column fresh, ascending", () => {
    expect(nextSort({ key: "doer", dir: "desc" }, "target")).toEqual({
      key: "target",
      dir: "asc",
    });
  });

  it("reports itself to a screen reader", () => {
    const s: SortState = { key: "target", dir: "desc" };
    expect(ariaSort(s, "target")).toBe("descending");
    expect(ariaSort(s, "doer")).toBe("none");
    expect(ariaSort(null, "target")).toBe("none");
  });
});

describe("no sort", () => {
  it("is the checklist's own order — offset, then the manual sequence", () => {
    const rows = [
      row("c", { offsetDays: 2, sortOrder: 100 }),
      row("a", { offsetDays: -3, sortOrder: 100 }),
      row("b", { offsetDays: -3, sortOrder: 200 }),
    ];
    expect(ids(sortChecklistRows(rows, null, ctx))).toEqual(["a", "b", "c"]);
  });

  it("never mutates the array it was given", () => {
    // The caller's array is the server's data. Reordering it in place would
    // survive into the next render as a "manual" order nobody chose.
    const rows = [row("b", { title: "Zebra" }), row("a", { title: "Apple" })];
    const before = ids(rows);
    sortChecklistRows(rows, { key: "activity", dir: "asc" }, ctx);
    expect(ids(rows)).toEqual(before);
  });
});

describe("sorting by a person", () => {
  it("orders by the NAME on screen, not the id", () => {
    // Sorting by `doerId` would produce uuid order, which is no order at all.
    const rows = [row("1", { doerId: "p1" }), row("2", { doerId: "p2" }), row("3", { doerId: "p3" })];
    expect(sortBy(rows, "doer", "asc")).toEqual(["3", "2", "1"]); // Manan, Om, Rakesh
    expect(sortBy(rows, "doer", "desc")).toEqual(["1", "2", "3"]);
  });

  it("sinks unassigned rows to the bottom under BOTH arrows", () => {
    /* Reversing a column must not hand you a screenful of dashes: the reason to
       sort by Doer is to read names. */
    const rows = [row("none", { doerId: null }), row("1", { doerId: "p1" }), row("3", { doerId: "p3" })];
    expect(sortBy(rows, "doer", "asc")).toEqual(["3", "1", "none"]);
    expect(sortBy(rows, "doer", "desc")).toEqual(["1", "3", "none"]);
  });
});

describe("sorting by the schedule columns", () => {
  it("orders offsets as numbers, not as text", () => {
    // "-10" < "-3" as text; as days, -10 comes first for the opposite reason.
    const rows = [row("b", { offsetDays: -3 }), row("a", { offsetDays: -10 }), row("c", { offsetDays: 2 })];
    expect(sortBy(rows, "offset", "asc")).toEqual(["a", "b", "c"]);
    expect(sortBy(rows, "offset", "desc")).toEqual(["c", "b", "a"]);
  });

  it("puts undated rows last however the target column is pointed", () => {
    const rows = [row("x"), row("y"), row("z")];
    TARGETS.x = "2026-09-20";
    TARGETS.y = null;
    TARGETS.z = "2026-09-02";
    expect(sortBy(rows, "target", "asc")).toEqual(["z", "x", "y"]);
    expect(sortBy(rows, "target", "desc")).toEqual(["x", "z", "y"]);
  });

  it("orders variance numerically, early before late", () => {
    const rows = [row("late"), row("early"), row("ontime")];
    VARIANCES.late = 4;
    VARIANCES.early = -2;
    VARIANCES.ontime = 0;
    expect(sortBy(rows, "var", "asc")).toEqual(["early", "ontime", "late"]);
    expect(sortBy(rows, "var", "desc")).toEqual(["late", "ontime", "early"]);
  });
});

describe("sorting by Done", () => {
  it("puts outstanding work first ascending, finished work first descending", () => {
    /* The column is asked "what is left?" far more often than the reverse, so
       ascending answers that. Not Applicable ranks beside Done because it is
       settled — nobody has to act on it. */
    const rows = [
      row("done", { status: "Done" }),
      row("pending", { status: "Pending" }),
      row("na", { status: "Not Applicable" }),
      row("help", { status: "Need Help" }),
    ];
    expect(sortBy(rows, "done", "asc")).toEqual(["pending", "help", "na", "done"]);
    expect(sortBy(rows, "done", "desc")).toEqual(["done", "na", "help", "pending"]);
  });

  it("keeps the plan's order among rows sharing a status", () => {
    // Every row Pending is the ordinary state of a fresh checklist. Sorting by
    // Done there must not shuffle it into something unrecognisable.
    const rows = [
      row("a", { offsetDays: -5, sortOrder: 100 }),
      row("b", { offsetDays: -2, sortOrder: 100 }),
      row("c", { offsetDays: 1, sortOrder: 100 }),
    ];
    expect(sortBy(rows, "done", "asc")).toEqual(["a", "b", "c"]);
    expect(sortBy(rows, "done", "desc")).toEqual(["a", "b", "c"]);
  });
});

describe("sorting by S.No", () => {
  it("is the plan forwards and the plan backwards", () => {
    // The serial is a position, not a stored value — so it has nothing of its
    // own to compare, and sorting by it can only mean the order or its reverse.
    const rows = [
      row("a", { offsetDays: -5 }),
      row("b", { offsetDays: -2 }),
      row("c", { offsetDays: 3 }),
    ];
    expect(sortBy(rows, "sr", "asc")).toEqual(["a", "b", "c"]);
    expect(sortBy(rows, "sr", "desc")).toEqual(["c", "b", "a"]);
  });
});

describe("the banner that says what the sort is doing", () => {
  const label = (k: SortKey) => ({ doer: "Doer", target: "Target", done: "Done", var: "Var" } as Record<string, string>)[k] ?? k;

  it("says nothing when nothing is sorted", () => {
    expect(describeSort(null, label)).toBeNull();
  });

  it("describes each kind of column in its own words", () => {
    expect(describeSort({ key: "doer", dir: "asc" }, label)).toBe("Doer (A–Z)");
    expect(describeSort({ key: "target", dir: "desc" }, label)).toBe("Target (latest first)");
    expect(describeSort({ key: "done", dir: "asc" }, label)).toBe("Done (outstanding first)");
    expect(describeSort({ key: "var", dir: "desc" }, label)).toBe("Var (high to low)");
  });
});
