import { describe, it, expect } from "vitest";
import {
  resolveViewPath,
  flattenPlanTree,
  expandableIds,
  expansionForSelection,
  selectAt,
  selectionToQuery,
  selectionFromQuery,
  LEVEL_FIELDS,
  EMPTY_SELECTION,
  type ViewNode,
  type ViewSelection,
} from "@/lib/project-plan/views";
import type { PlanKind } from "@/lib/project-plan/levels";

/**
 * Project Views — the drill-down.
 *
 * The thing worth testing here is that navigation follows REAL parent/child
 * links rather than display codes, and that a path which no longer lines up
 * truncates instead of showing someone another project's rows under a
 * breadcrumb that claims otherwise.
 */

function n(kind: PlanKind, id: string, children: ViewNode[] = []): ViewNode {
  return { id, name: id.toUpperCase(), kind, children };
}

/**
 *  p1 AICL WMS
 *    m1 Attendance
 *      r1 Biometric   → a1 Feed import → sa1 Map devices
 *      r2 Muster
 *    m2 Appraisal
 *      r3 Rating form
 *  p2 Second
 *    m3 Kickoff
 */
function tree(): ViewNode[] {
  return [
    n("project", "p1", [
      n("milestone", "m1", [
        n("result", "r1", [n("action", "a1", [n("sub_action", "sa1")])]),
        n("result", "r2"),
      ]),
      n("milestone", "m2", [n("result", "r3")]),
    ]),
    n("project", "p2", [n("milestone", "m3")]),
  ];
}

describe("drill-down resolves through real parent links", () => {
  it("shows a project's milestones once it is selected", () => {
    const path = resolveViewPath(tree(), { projectId: "p1" });
    expect(path.levels).toHaveLength(1);
    expect(path.levels[0]!.kind).toBe("milestone");
    expect(path.levels[0]!.rows.map((r) => r.node.id)).toEqual(["m1", "m2"]);
    expect(path.levels[0]!.selectedId).toBeNull();
    expect(path.focus?.id).toBe("p1");
  });

  it("opens results under the clicked milestone, and only that one", () => {
    const path = resolveViewPath(tree(), { projectId: "p1", milestoneId: "m1" });
    expect(path.levels.map((l) => l.kind)).toEqual(["milestone", "result"]);
    expect(path.levels[0]!.selectedId).toBe("m1");
    expect(path.levels[1]!.rows.map((r) => r.node.id)).toEqual(["r1", "r2"]);
    // m2's result must not leak into m1's pane.
    expect(path.levels[1]!.rows.map((r) => r.node.id)).not.toContain("r3");
  });

  it("walks the full chain project → milestone → result → action → sub-action", () => {
    const path = resolveViewPath(tree(), {
      projectId: "p1",
      milestoneId: "m1",
      resultId: "r1",
      actionId: "a1",
    });
    expect(path.levels.map((l) => l.kind)).toEqual([
      "milestone",
      "result",
      "action",
      "sub_action",
    ]);
    expect(path.levels[3]!.rows.map((r) => r.node.id)).toEqual(["sa1"]);
    expect(path.focus?.id).toBe("a1");
  });

  it("numbers each pane from sibling position — M1/M2, RA/RB", () => {
    const path = resolveViewPath(tree(), { projectId: "p1", milestoneId: "m1" });
    expect(path.levels[0]!.rows.map((r) => r.ref)).toEqual(["M1", "M2"]);
    expect(path.levels[1]!.rows.map((r) => r.ref)).toEqual(["RA", "RB"]);
  });

  it("carries the traceability path on each row without making it the link", () => {
    const path = resolveViewPath(tree(), { projectId: "p1", milestoneId: "m1" });
    expect(path.levels[1]!.rows[0]!.fullRef).toBe("P1M1RA");
    // The row is still addressed by its uuid, not by that string.
    expect(path.levels[1]!.rows[0]!.node.id).toBe("r1");
  });
});

describe("a path that no longer lines up truncates instead of lying", () => {
  it("drops a milestone that belongs to a different project", () => {
    // m3 is real, but it is under p2 — asking for it under p1 must not open it.
    const path = resolveViewPath(tree(), { projectId: "p1", milestoneId: "m3" });
    expect(path.selection.milestoneId).toBeNull();
    expect(path.levels).toHaveLength(1);
    expect(path.levels[0]!.selectedId).toBeNull();
    // The milestone pane still lists p1's own options rather than going blank.
    expect(path.levels[0]!.rows.map((r) => r.node.id)).toEqual(["m1", "m2"]);
  });

  it("drops everything below the level that stopped matching", () => {
    const path = resolveViewPath(tree(), {
      projectId: "p1",
      milestoneId: "m3", // wrong project
      resultId: "r1",
      actionId: "a1",
    });
    expect(path.selection).toEqual({ ...EMPTY_SELECTION, projectId: "p1" });
    expect(path.focus?.id).toBe("p1");
  });

  it("ignores an unknown project id entirely", () => {
    const path = resolveViewPath(tree(), { projectId: "nope" });
    expect(path.selection.projectId).toBeNull();
    expect(path.levels).toHaveLength(0);
    expect(path.focus).toBeNull();
  });

  it("shows nothing but the picker when no project is chosen", () => {
    const path = resolveViewPath(tree(), {});
    expect(path.levels).toEqual([]);
    expect(path.crumbs).toEqual([]);
    expect(path.focus).toBeNull();
  });

  it("never opens a result whose milestone was not selected", () => {
    const path = resolveViewPath(tree(), { projectId: "p1", resultId: "r1" });
    expect(path.selection.resultId).toBeNull();
    expect(path.levels.map((l) => l.kind)).toEqual(["milestone"]);
  });
});

describe("breadcrumbs", () => {
  it("names every hop with its kind and ref", () => {
    const path = resolveViewPath(tree(), {
      projectId: "p1",
      milestoneId: "m1",
      resultId: "r1",
    });
    expect(path.crumbs.map((c) => `${c.kindLabel}: ${c.ref}`)).toEqual([
      "Project: P1",
      "Milestone: M1",
      "Result: RA",
    ]);
  });

  it("each crumb links back to that hop, dropping the levels below it", () => {
    const path = resolveViewPath(tree(), {
      projectId: "p1",
      milestoneId: "m1",
      resultId: "r1",
      actionId: "a1",
    });
    // Clicking "Milestone" keeps the project and the milestone, drops the rest.
    expect(path.crumbs[1]!.selection).toEqual({
      projectId: "p1",
      milestoneId: "m1",
      resultId: null,
      actionId: null,
    });
  });
});

describe("selectAt", () => {
  const at: ViewSelection = {
    projectId: "p1",
    milestoneId: "m1",
    resultId: "r1",
    actionId: "a1",
  };

  it("clears the deeper levels when a higher one changes", () => {
    // Switching to m2 must not keep r1/a1, which lived under m1.
    expect(selectAt(at, "milestone", "m2")).toEqual({
      projectId: "p1",
      milestoneId: "m2",
      resultId: null,
      actionId: null,
    });
  });

  it("collapses when the already-open row is clicked again", () => {
    expect(selectAt(at, "result", "r1")).toEqual({
      projectId: "p1",
      milestoneId: "m1",
      resultId: null,
      actionId: null,
    });
  });

  it("switching project drops the whole path below it", () => {
    expect(selectAt(at, "project", "p2")).toEqual({
      projectId: "p2",
      milestoneId: null,
      resultId: null,
      actionId: null,
    });
  });

  it("selecting a sub-action is a no-op — there is nothing below it", () => {
    expect(selectAt(at, "sub_action", "sa1")).toEqual(at);
  });
});

describe("URL round-trip", () => {
  it("omits absent levels rather than writing empty keys", () => {
    expect(selectionToQuery({ ...EMPTY_SELECTION, projectId: "p1" })).toEqual({
      project: "p1",
    });
  });

  it("survives a round-trip through query params", () => {
    const sel: ViewSelection = {
      projectId: "p1",
      milestoneId: "m1",
      resultId: "r1",
      actionId: "a1",
    };
    const q = selectionToQuery(sel);
    expect(selectionFromQuery((k) => q[k] ?? null)).toEqual(sel);
  });
});

describe("field rules — brief §5's three exclusions", () => {
  it("a Result has NO start time, NO end time and NO hours duration", () => {
    expect(LEVEL_FIELDS.result.clockTimes).toBe(false);
    expect(LEVEL_FIELDS.result.hoursDuration).toBe(false);
  });

  it("a Result keeps its target date and status-side scheduling", () => {
    expect(LEVEL_FIELDS.result.targetDate).toBe(true);
  });

  it("a Result never opens a WMS task record — it has no task", () => {
    expect(LEVEL_FIELDS.result.wmsTask).toBe(false);
  });

  it("Actions and Sub-Actions get the full WMS task treatment", () => {
    for (const kind of ["action", "sub_action", "sub_sub_action"] as const) {
      expect(LEVEL_FIELDS[kind]).toEqual({
        clockTimes: true,
        hoursDuration: true,
        targetDate: true,
        wmsTask: true,
      });
    }
  });

  it("containers above Result are excluded from clock times too", () => {
    expect(LEVEL_FIELDS.project.clockTimes).toBe(false);
    expect(LEVEL_FIELDS.milestone.clockTimes).toBe(false);
  });
});

/**
 * The hierarchy listing — the same tree seen all at once.
 *
 * What matters here is that indent, numbering and what-is-visible all come out
 * of the SAME parent/child walk the drill-down uses, that a collapsed branch
 * costs nothing, and that a search cannot strand a match under a hidden parent.
 */
describe("flattenPlanTree", () => {
  it("shows only the roots when nothing is expanded", () => {
    const rows = flattenPlanTree(tree(), new Set());
    expect(rows.map((r) => r.node.id)).toEqual(["p1", "p2"]);
    expect(rows.every((r) => r.depth === 0)).toBe(true);
  });

  it("walks into a branch only when its own id is expanded", () => {
    const rows = flattenPlanTree(tree(), new Set(["p1"]));
    expect(rows.map((r) => r.node.id)).toEqual(["p1", "m1", "m2", "p2"]);
  });

  it("indents each level by one step, all the way down", () => {
    const rows = flattenPlanTree(tree(), new Set(["p1", "m1", "r1", "a1"]));
    const depth = Object.fromEntries(rows.map((r) => [r.node.id, r.depth]));
    expect(depth).toMatchObject({ p1: 0, m1: 1, r1: 2, a1: 3, sa1: 4 });
  });

  it("expanding a deep row alone reveals nothing — its ancestors are shut", () => {
    const rows = flattenPlanTree(tree(), new Set(["r1"]));
    expect(rows.map((r) => r.node.id)).toEqual(["p1", "p2"]);
  });

  it("numbers rows from sibling position, matching the drill-down", () => {
    const rows = flattenPlanTree(tree(), new Set(["p1", "m1"]));
    const ref = Object.fromEntries(rows.map((r) => [r.node.id, r.ref]));
    expect(ref).toMatchObject({ p1: "P1", p2: "P2", m1: "M1", m2: "M2", r1: "RA", r2: "RB" });
  });

  it("carries the traceability path on every line", () => {
    const rows = flattenPlanTree(tree(), new Set(["p1", "m1", "r1"]));
    expect(rows.find((r) => r.node.id === "a1")?.fullRef).toBe("P1M1RAA1");
  });

  it("reports the ancestors a link would have to open to reach a row", () => {
    const rows = flattenPlanTree(tree(), new Set(["p1", "m1", "r1", "a1"]));
    expect(rows.find((r) => r.node.id === "sa1")?.ancestorIds).toEqual([
      "p1",
      "m1",
      "r1",
      "a1",
    ]);
  });

  it("marks a childless row as never expanded, whatever the set says", () => {
    const rows = flattenPlanTree(tree(), new Set(["p1", "m1", "r2"]));
    const r2 = rows.find((r) => r.node.id === "r2")!;
    expect(r2.childCount).toBe(0);
    expect(r2.expanded).toBe(false);
  });

  it("flags the last sibling so the tree guide can close off", () => {
    const rows = flattenPlanTree(tree(), new Set(["p1"]));
    expect(rows.find((r) => r.node.id === "m1")?.isLast).toBe(false);
    expect(rows.find((r) => r.node.id === "m2")?.isLast).toBe(true);
    expect(rows.find((r) => r.node.id === "p2")?.isLast).toBe(true);
  });

  it("scopes to one project when the filter names one", () => {
    const rows = flattenPlanTree(tree(), new Set(["p1"]), { rootId: "p1" });
    expect(rows.map((r) => r.node.id)).toEqual(["p1", "m1", "m2"]);
  });

  it("falls back to every project when the filter names an unknown id", () => {
    const rows = flattenPlanTree(tree(), new Set(), { rootId: "ghost" });
    expect(rows).toEqual([]);
  });
});

describe("searching the tree", () => {
  it("keeps a match and every ancestor that leads to it", () => {
    const rows = flattenPlanTree(tree(), new Set(), { query: "sa1" });
    expect(rows.map((r) => r.node.id)).toEqual(["p1", "m1", "r1", "a1", "sa1"]);
  });

  it("opens the branches it matched through, whatever was expanded before", () => {
    const rows = flattenPlanTree(tree(), new Set(), { query: "sa1" });
    expect(rows.find((r) => r.node.id === "r1")?.expanded).toBe(true);
  });

  it("drops the branches that hold no match", () => {
    const rows = flattenPlanTree(tree(), new Set(), { query: "sa1" });
    expect(rows.map((r) => r.node.id)).not.toContain("p2");
    expect(rows.map((r) => r.node.id)).not.toContain("m2");
  });

  it("renumbers nothing — a filtered row keeps the ref it has in the plan", () => {
    // r2 is RB in the full tree; searching for it must not promote it to RA.
    const rows = flattenPlanTree(tree(), new Set(), { query: "r2" });
    expect(rows.find((r) => r.node.id === "r2")?.ref).toBe("RA");
  });

  it("ignores case", () => {
    const rows = flattenPlanTree(tree(), new Set(), { query: "SA1" });
    expect(rows.map((r) => r.node.id)).toContain("sa1");
  });

  it("returns nothing when the plan holds no match", () => {
    expect(flattenPlanTree(tree(), new Set(), { query: "nowhere" })).toEqual([]);
  });
});

describe("expandableIds", () => {
  it("lists every row that has something under it, and no leaf", () => {
    expect(expandableIds(tree()).sort()).toEqual(["a1", "m1", "m2", "p1", "p2", "r1"]);
  });
});

describe("expansionForSelection", () => {
  it("opens each level an old drill-down link named", () => {
    const sel: ViewSelection = {
      projectId: "p1",
      milestoneId: "m1",
      resultId: "r1",
      actionId: null,
    };
    expect([...expansionForSelection(sel)].sort()).toEqual(["m1", "p1", "r1"]);
  });

  it("opens nothing when the link named nothing", () => {
    expect(expansionForSelection(EMPTY_SELECTION).size).toBe(0);
  });

  it("a stale link resolves to a short trail, so only the good part opens", () => {
    // m3 belongs to p2, not p1 — resolveViewPath drops it, and the expansion
    // built from the RESOLVED selection therefore opens p1 alone.
    const resolved = resolveViewPath(tree(), { projectId: "p1", milestoneId: "m3" }).selection;
    expect([...expansionForSelection(resolved)]).toEqual(["p1"]);
  });
});
