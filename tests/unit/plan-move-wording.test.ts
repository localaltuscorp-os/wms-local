import { describe, expect, it } from "vitest";
import { describeCarried, describeMove, type PlanMovePlan } from "@/lib/project-plan/move";
import {
  unclassifiedName,
  UNCLASSIFIED_MILESTONE,
  UNCLASSIFIED_RESULT,
  PARENT_KIND,
  CHILD_KIND,
  KIND_DEPTH,
  PLAN_KINDS,
} from "@/lib/project-plan/levels";

/**
 * The drag-to-move CONFIRM POPUP says what is about to happen, and its wording
 * is the only thing standing between a person and a plan reshaped by accident.
 * These cover the sentence and the level arithmetic it leans on; the move
 * itself is exercised against a real database in
 * tests/integration/plan-move.test.ts.
 */

function plan(over: Partial<PlanMovePlan> = {}): PlanMovePlan {
  return {
    nodeKind: "milestone",
    nodeName: "Discovery",
    fromProjectId: "a",
    fromProjectName: "Alpha",
    toProjectId: "b",
    toProjectName: "Beta",
    sameProject: false,
    parentKind: "project",
    parentName: "Beta",
    creates: [],
    carries: [],
    taskCount: 0,
    ...over,
  };
}

describe("the move popup's wording", () => {
  it("names the destination project on a cross-project move", () => {
    expect(describeMove(plan())).toBe('Move Milestone "Discovery" to the project "Beta"?');
  });

  it("names the PARENT ROW instead when the move stays inside one project", () => {
    // "Move it to Alpha?" would be nonsense when it is already in Alpha — the
    // thing that changes is which row it hangs off.
    expect(
      describeMove(
        plan({
          sameProject: true,
          toProjectName: "Alpha",
          nodeKind: "result",
          nodeName: "Vendor onboarding",
          parentKind: "milestone",
          parentName: "Delivery",
        }),
      ),
    ).toBe('Move Result "Vendor onboarding" under Milestone "Delivery"?');
  });

  it("pluralises what travels with the branch, and says nothing when nothing does", () => {
    expect(describeCarried([])).toBe("");
    expect(describeCarried([{ kind: "result", count: 1 }])).toBe("1 Result");
    expect(
      describeCarried([
        { kind: "result", count: 3 },
        { kind: "action", count: 5 },
        { kind: "sub_action", count: 1 },
      ]),
    ).toBe("3 Results, 5 Actions, 1 Sub-Action");
  });
});

describe("the placeholder levels a drop can have to create", () => {
  it("keeps the two names the task cascade already files against", () => {
    // These two are matched ON THE NAME by find-or-create, so a rename without
    // a migration would start a second placeholder beside every existing one.
    expect(unclassifiedName("milestone")).toBe(UNCLASSIFIED_MILESTONE);
    expect(unclassifiedName("result")).toBe(UNCLASSIFIED_RESULT);
  });

  it("names every level that can ever need a placeholder parent", () => {
    // A placeholder is needed for the PARENT of whatever is dropped, so the
    // set is exactly the parent kinds below the top.
    for (const kind of PLAN_KINDS) {
      const parent = PARENT_KIND[kind];
      if (!parent || parent === "project") continue;
      expect(unclassifiedName(parent)).toMatch(/^Unclassified /);
    }
  });
});

describe("the level chain the drop resolver walks", () => {
  it("has CHILD_KIND and PARENT_KIND as exact inverses", () => {
    // The resolver descends with CHILD_KIND and climbs with PARENT_KIND; if the
    // two ever disagreed a drop would loop or land a level out.
    for (const kind of PLAN_KINDS) {
      const child = CHILD_KIND[kind];
      if (child) expect(PARENT_KIND[child]).toBe(kind);
      const parent = PARENT_KIND[kind];
      if (parent) expect(CHILD_KIND[parent]).toBe(kind);
    }
  });

  it("orders the depths so 'is the target above the needed parent?' is decidable", () => {
    for (const kind of PLAN_KINDS) {
      const child = CHILD_KIND[kind];
      if (child) expect(KIND_DEPTH[child]).toBe(KIND_DEPTH[kind] + 1);
    }
  });
});
