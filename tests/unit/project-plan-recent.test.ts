import { describe, it, expect } from "vitest";
import {
  ancestorLevels,
  contextFrom,
  defaultParentFor,
  planPathTo,
  resolveRecentPlan,
  seedAncestors,
  type PlanTreeLike,
  type RecentPlanLink,
} from "@/lib/project-plan/recent";
import type { PlanKind } from "@/lib/project-plan/levels";

/**
 * The LAST-ACCESSED BRANCH — the memory that answers "which project does this
 * bulk upload go into?" without asking.
 *
 * The whole risk in this feature is a remembered path that is no longer true:
 * a milestone that has been moved, a project that has been deleted, a chain
 * with a hole in the middle of it. Every one of those has to degrade to a
 * SHORTER correct answer rather than to a confident wrong one, because the
 * consequence of a wrong answer is fifty rows filed under the wrong parent.
 */

function node(kind: PlanKind, id: string, name: string, children: PlanTreeLike[] = []): PlanTreeLike {
  return { id, name, kind, children };
}

/** P1 › M1 › RA › A1 › SA1.1, plus a second project with nothing in it. */
const TREE: PlanTreeLike[] = [
  node("project", "p1", "AICL WMS", [
    node("milestone", "m1", "Site survey", [
      node("result", "r1", "Floor plan signed off", [
        node("action", "a1", "Measure the mezzanine", [
          node("sub_action", "s1", "Book the ladder"),
        ]),
        node("action", "a2", "Draft the layout"),
      ]),
    ]),
    node("milestone", "m2", "Racking installed"),
  ]),
  node("project", "p2", "Vasa Family Office"),
];

describe("ancestorLevels", () => {
  it("names exactly the levels a row sits under, outermost first", () => {
    expect(ancestorLevels("project")).toEqual([]);
    expect(ancestorLevels("milestone")).toEqual(["project"]);
    expect(ancestorLevels("sub_action")).toEqual(["project", "milestone", "result", "action"]);
  });
});

describe("planPathTo", () => {
  it("returns the whole path down to the row, inclusive", () => {
    expect(planPathTo(TREE, "s1").map((l) => l.id)).toEqual(["p1", "m1", "r1", "a1", "s1"]);
    expect(planPathTo(TREE, "p2").map((l) => l.id)).toEqual(["p2"]);
  });

  it("carries each link's own kind and name, so a picker can show it", () => {
    expect(planPathTo(TREE, "r1")).toEqual([
      { id: "p1", name: "AICL WMS", kind: "project" },
      { id: "m1", name: "Site survey", kind: "milestone" },
      { id: "r1", name: "Floor plan signed off", kind: "result" },
    ]);
  });

  it("is empty for an id that is not in this tree", () => {
    expect(planPathTo(TREE, "nope")).toEqual([]);
  });

  it("does not leak a half-walked branch when the hit is in a later sibling", () => {
    // a2 is the SECOND action under r1; the walk into a1's children must unwind
    // completely first or the path would read […a1, a2].
    expect(planPathTo(TREE, "a2").map((l) => l.id)).toEqual(["p1", "m1", "r1", "a2"]);
  });
});

describe("resolveRecentPlan", () => {
  const chain = (...ids: string[]): RecentPlanLink[] =>
    ids.map((id) => {
      const path = planPathTo(TREE, id);
      return path[path.length - 1] ?? { id, name: "gone", kind: "action" as PlanKind };
    });

  it("re-derives the path from the live tree, deepest link first", () => {
    const ctx = resolveRecentPlan(TREE, chain("p1", "m1", "r1"));
    expect(ctx.project?.id).toBe("p1");
    expect(ctx.milestone?.id).toBe("m1");
    expect(ctx.result?.id).toBe("r1");
    expect(ctx.action).toBeUndefined();
  });

  it("takes NAMES from the tree, not from what was stored", () => {
    const stale: RecentPlanLink[] = [{ id: "p1", name: "Old name nobody uses", kind: "project" }];
    expect(resolveRecentPlan(TREE, stale).project?.name).toBe("AICL WMS");
  });

  it("falls back to the deepest link that still exists", () => {
    const stored: RecentPlanLink[] = [
      ...planPathTo(TREE, "r1"),
      { id: "deleted-action", name: "Deleted", kind: "action" },
    ];
    const ctx = resolveRecentPlan(TREE, stored);
    expect(ctx.result?.id).toBe("r1");
    expect(ctx.action).toBeUndefined();
  });

  it("returns nothing at all when the whole branch is gone", () => {
    const stored: RecentPlanLink[] = [
      { id: "ghost-project", name: "Ghost", kind: "project" },
      { id: "ghost-milestone", name: "Ghost", kind: "milestone" },
    ];
    expect(resolveRecentPlan(TREE, stored)).toEqual({});
  });

  it("never invents a chain with a hole in it, even from a stored one", () => {
    // Someone hand-edited storage: a real result with no project above it. The
    // deepest surviving id wins and the true path is rebuilt around it.
    const stored: RecentPlanLink[] = [{ id: "r1", name: "Floor plan signed off", kind: "result" }];
    const ctx = resolveRecentPlan(TREE, stored);
    expect(ctx.project?.id).toBe("p1");
    expect(ctx.milestone?.id).toBe("m1");
  });
});

describe("seedAncestors", () => {
  const full = contextFrom(planPathTo(TREE, "a1"));

  it("fills every level above the new row and nothing below it", () => {
    expect(seedAncestors("action", full)).toEqual({ project: "p1", milestone: "m1", result: "r1" });
  });

  it("fills the row's own level too when creating one level deeper", () => {
    expect(seedAncestors("sub_action", full)).toEqual({
      project: "p1",
      milestone: "m1",
      result: "r1",
      action: "a1",
    });
  });

  it("gives a project nothing to sit under", () => {
    expect(seedAncestors("project", full)).toEqual({});
  });

  it("STOPS at the first missing level rather than skipping it", () => {
    // A context that knows the result but not the milestone would otherwise
    // seed a result id into a select whose options were never loaded.
    const holed = { project: { id: "p1", name: "AICL WMS" }, result: { id: "r1", name: "R" } };
    expect(seedAncestors("action", holed)).toEqual({ project: "p1" });
  });
});

describe("defaultParentFor", () => {
  const full = contextFrom(planPathTo(TREE, "a1"));

  it("names the row a new one would hang off", () => {
    expect(defaultParentFor("action", full)?.id).toBe("r1");
    expect(defaultParentFor("sub_action", full)?.id).toBe("a1");
    expect(defaultParentFor("milestone", full)?.id).toBe("p1");
  });

  it("is null for a project, which has no parent", () => {
    expect(defaultParentFor("project", full)).toBeNull();
  });

  it("is null when the chain above the parent is incomplete", () => {
    const holed = { result: { id: "r1", name: "R" } };
    expect(defaultParentFor("action", holed)).toBeNull();
  });
});
