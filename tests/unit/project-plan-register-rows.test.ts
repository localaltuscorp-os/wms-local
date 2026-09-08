import { describe, it, expect } from "vitest";
import {
  buildRegisterRows,
  ancestorOf,
  ANCESTOR_KINDS,
  LEVEL_KIND,
  ROLLUP_KIND,
  type RegisterNode,
} from "@/lib/project-plan/register";
import type { PlanKind } from "@/lib/project-plan/levels";

/**
 * The Milestones / Results registers — the PROJECT → MILESTONE → RESULT
 * relationship as it reaches the screen.
 *
 * `project-plan-register.test.ts` covers the arithmetic in the two completion
 * columns. This covers the other half: that every row is flattened out of the
 * ONE tree carrying the real parent it hangs off, and that the short refs the
 * brief asks for (P1/P2/P3, M1/M2/M3) come out of sibling position rather than
 * being stored anywhere.
 */

function node(kind: PlanKind, name: string, opts: Partial<RegisterNode> = {}): RegisterNode {
  return { id: `${kind}-${name}`, name, kind, children: [], ...opts };
}

/** The brief's own example: one project, three milestones. */
function aicl(): RegisterNode {
  return node("project", "AICL WMS", {
    children: [
      node("milestone", "Attendance"),
      node("milestone", "Tgt vs Actual"),
      node("milestone", "Appraisal"),
    ],
  });
}

describe("the milestones register", () => {
  it("puts every milestone on its own row, carrying its project", () => {
    const rows = buildRegisterRows([aicl()], "milestones");
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.node.name)).toEqual(["Attendance", "Tgt vs Actual", "Appraisal"]);
    // Each row names the project it belongs to — the relationship, on screen.
    expect(rows.every((r) => ancestorOf(r, "project")!.name === "AICL WMS")).toBe(true);
    expect(rows.every((r) => ancestorOf(r, "project")!.ref === "P1")).toBe(true);
  });

  it("numbers milestones M1, M2, M3 from sibling position", () => {
    const rows = buildRegisterRows([aicl()], "milestones");
    expect(rows.map((r) => r.ownRef)).toEqual(["M1", "M2", "M3"]);
  });

  it("restarts milestone numbering inside each project — P2's first is M1", () => {
    const tree = [
      node("project", "AICL WMS", { children: [node("milestone", "Attendance")] }),
      node("project", "Second", {
        children: [node("milestone", "Kickoff"), node("milestone", "Rollout")],
      }),
      node("project", "Third", { children: [node("milestone", "Scoping")] }),
    ];
    const rows = buildRegisterRows(tree, "milestones");
    expect(rows.map((r) => `${ancestorOf(r, "project")!.ref}·${r.ownRef}`)).toEqual([
      "P1·M1",
      "P2·M1",
      "P2·M2",
      "P3·M1",
    ]);
  });

  it("carries only the project above it — a milestone row IS the milestone", () => {
    const row = buildRegisterRows([aicl()], "milestones")[0]!;
    expect(row.ancestors.map((a) => a.kind)).toEqual(["project"]);
    expect(ancestorOf(row, "milestone")).toBeNull();
  });

  it("carries the long path as fullRef only, never as a ref column", () => {
    const rows = buildRegisterRows([aicl()], "milestones");
    expect(rows[1]!.fullRef).toBe("P1M2");
    // The column the table draws stays short.
    expect(rows[1]!.ownRef).toBe("M2");
  });

  it("rolls up RESULTS, partials included — 3.5/10", () => {
    const results = Array.from({ length: 10 }, (_, i) =>
      node("result", `R${i}`, { progressPercent: i < 3 ? 100 : i === 3 ? 50 : 0 }),
    );
    const tree = [
      node("project", "P", { children: [node("milestone", "M", { children: results })] }),
    ];
    const row = buildRegisterRows(tree, "milestones")[0]!;
    expect(row.rollup).toMatchObject({ completed: 3.5, total: 10 });
  });
});

describe("the results register", () => {
  const tree = [
    node("project", "AICL WMS", {
      children: [
        node("milestone", "Attendance", {
          children: [node("result", "Biometric feed"), node("result", "Muster export")],
        }),
        node("milestone", "Appraisal", { children: [node("result", "Rating form")] }),
      ],
    }),
  ];

  it("carries BOTH ancestors — the project and the milestone", () => {
    const rows = buildRegisterRows(tree, "results");
    expect(rows).toHaveLength(3);
    expect(
      rows.map((r) => [
        ancestorOf(r, "project")!.ref,
        ancestorOf(r, "milestone")!.ref,
        r.ownRef,
      ]),
    ).toEqual([
      ["P1", "M1", "RA"],
      ["P1", "M1", "RB"],
      ["P1", "M2", "RA"],
    ]);
    expect(ancestorOf(rows[2]!, "milestone")!.name).toBe("Appraisal");
    expect(ancestorOf(rows[2]!, "project")!.name).toBe("AICL WMS");
  });

  it("restarts result lettering inside each milestone", () => {
    const rows = buildRegisterRows(tree, "results");
    // M2's only result is RA, not RC — the letter is its position under ITS
    // milestone, which is what makes "M2 · RA" a usable reference.
    expect(rows[2]!.ownRef).toBe("RA");
    expect(rows[2]!.fullRef).toBe("P1M2RA");
  });

  it("rolls up ACTIONS on this level, not results", () => {
    const withActions = [
      node("project", "P", {
        children: [
          node("milestone", "M", {
            children: [
              node("result", "R", {
                children: [
                  node("action", "a1", { task: { status: "done" } }),
                  node("action", "a2", { task: { status: "initiated" } }),
                ],
              }),
            ],
          }),
        ],
      }),
    ];
    const row = buildRegisterRows(withActions, "results")[0]!;
    expect(row.rollup).toMatchObject({ completed: 1, total: 2 });
  });
});

describe("the register never invents a relationship", () => {
  it("skips a result that has no milestone between it and its project", () => {
    // Shouldn't happen — PARENT_KIND forbids it on every write — but if a row
    // is ever orphaned into this shape, the register must not name a milestone
    // it does not have.
    const tree = [node("project", "P", { children: [node("result", "Loose")] })];
    expect(buildRegisterRows(tree, "results")).toHaveLength(0);
    expect(buildRegisterRows(tree, "milestones")).toHaveLength(0);
  });

  it("ignores a top-level row that is not a project", () => {
    const tree = [node("milestone", "Stray", { children: [node("result", "R")] })];
    expect(buildRegisterRows(tree, "milestones")).toHaveLength(0);
  });

  it("returns nothing for an empty plan rather than a placeholder row", () => {
    expect(buildRegisterRows([], "milestones")).toEqual([]);
    expect(buildRegisterRows([], "results")).toEqual([]);
  });

  it("shows a project with no milestones as zero rows, not as one blank row", () => {
    const rows = buildRegisterRows([node("project", "Empty")], "milestones");
    expect(rows).toEqual([]);
  });
});

describe("the level tables the table header reads", () => {
  it("lists milestones on the milestones register and rolls up results", () => {
    expect(LEVEL_KIND.milestones).toBe("milestone");
    expect(ROLLUP_KIND.milestones).toBe("result");
  });

  it("lists results on the results register and rolls up actions", () => {
    expect(LEVEL_KIND.results).toBe("result");
    expect(ROLLUP_KIND.results).toBe("action");
  });
});

/**
 *  The deep fixture — one project carrying the full five-level chain, so the
 *  Actions and Sub-Actions registers have real ancestors to report.
 *
 *  p AICL WMS
 *    m1 Attendance
 *      r1 Biometric  → a1 Feed import → sa1 Map devices, sa2 Test clock-in
 *                    → a2 Muster export
 *      r2 Rosters    → a3 Shift table
 *    m2 Appraisal
 *      r3 Rating     → a4 Form build
 */
function deep(): RegisterNode {
  return node("project", "AICL WMS", {
    children: [
      node("milestone", "Attendance", {
        children: [
          node("result", "Biometric", {
            children: [
              node("action", "Feed import", {
                children: [node("sub_action", "Map devices"), node("sub_action", "Test clock-in")],
              }),
              node("action", "Muster export"),
            ],
          }),
          node("result", "Rosters", { children: [node("action", "Shift table")] }),
        ],
      }),
      node("milestone", "Appraisal", {
        children: [node("result", "Rating", { children: [node("action", "Form build")] })],
      }),
    ],
  });
}

describe("the actions register", () => {
  it("lists every action in the plan, wherever it sits", () => {
    const rows = buildRegisterRows([deep()], "actions");
    expect(rows.map((r) => r.node.name)).toEqual([
      "Feed import",
      "Muster export",
      "Shift table",
      "Form build",
    ]);
  });

  it("carries all THREE ancestors — project, milestone, result", () => {
    const rows = buildRegisterRows([deep()], "actions");
    expect(rows[0]!.ancestors.map((a) => a.kind)).toEqual([
      "project",
      "milestone",
      "result",
    ]);
    expect(rows[0]!.ancestors.map((a) => `${a.ref} ${a.name}`)).toEqual([
      "P1 AICL WMS",
      "M1 Attendance",
      "RA Biometric",
    ]);
  });

  it("reports the right chain for an action under a different milestone", () => {
    const rows = buildRegisterRows([deep()], "actions");
    const formBuild = rows.find((r) => r.node.name === "Form build")!;
    expect(formBuild.ancestors.map((a) => a.ref)).toEqual(["P1", "M2", "RA"]);
    expect(formBuild.fullRef).toBe("P1M2RAA1");
  });

  it("numbers actions from position under THEIR result", () => {
    const rows = buildRegisterRows([deep()], "actions");
    // Biometric holds A1 and A2; Rosters' only action restarts at A1.
    expect(rows.map((r) => r.ownRef)).toEqual(["A1", "A2", "A1", "A1"]);
  });

  it("rolls up SUB-ACTIONS, not results", () => {
    const rows = buildRegisterRows([deep()], "actions");
    // Feed import has two sub-actions, neither done.
    expect(rows[0]!.rollup).toMatchObject({ completed: 0, total: 2 });
    // Muster export has none at all.
    expect(rows[1]!.rollup).toMatchObject({ total: 0 });
  });

  it("counts a done sub-action, partials included", () => {
    const tree = [
      node("project", "P", {
        children: [
          node("milestone", "M", {
            children: [
              node("result", "R", {
                children: [
                  node("action", "A", {
                    children: [
                      node("sub_action", "s1", { task: { status: "done" } }),
                      node("sub_action", "s2", { task: { status: "initiated" } }),
                    ],
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    ];
    expect(buildRegisterRows(tree, "actions")[0]!.rollup).toMatchObject({
      completed: 1,
      total: 2,
    });
  });
});

describe("the sub-actions register", () => {
  it("carries all FOUR ancestors — project, milestone, result, action", () => {
    const rows = buildRegisterRows([deep()], "sub-actions");
    expect(rows).toHaveLength(2);
    expect(rows[0]!.ancestors.map((a) => a.kind)).toEqual([
      "project",
      "milestone",
      "result",
      "action",
    ]);
    expect(rows[0]!.ancestors.map((a) => a.ref)).toEqual(["P1", "M1", "RA", "A1"]);
  });

  it("numbers sub-actions off their parent action — SA1.1, SA1.2", () => {
    const rows = buildRegisterRows([deep()], "sub-actions");
    expect(rows.map((r) => r.ownRef)).toEqual(["SA1.1", "SA1.2"]);
  });

  it("the long path drops the dotted form, because it already names the parent", () => {
    // Deliberate, and pre-existing: the SHORT ref stands alone, so it embeds
    // the parent's ordinal (SA1.2 = "the 2nd sub-action of A1"). The FULL ref
    // has already spelled out P1M1RAA1, so repeating the 1 would be noise —
    // it appends a plain ordinal instead.
    const rows = buildRegisterRows([deep()], "sub-actions");
    expect(rows[1]!.fullRef).toBe("P1M1RAA1SA2");
    expect(rows[1]!.ownRef).toBe("SA1.2");
  });

  it("has an empty rollup — sub-sub-actions are rare and 0/0 is honest", () => {
    const rows = buildRegisterRows([deep()], "sub-actions");
    expect(rows[0]!.rollup).toEqual({ completed: 0, total: 0, fraction: 0 });
  });
});

describe("ancestor columns per level", () => {
  it("grows by exactly one level each step down", () => {
    expect(ANCESTOR_KINDS.projects).toEqual([]);
    expect(ANCESTOR_KINDS.milestones).toEqual(["project"]);
    expect(ANCESTOR_KINDS.results).toEqual(["project", "milestone"]);
    expect(ANCESTOR_KINDS.actions).toEqual(["project", "milestone", "result"]);
    expect(ANCESTOR_KINDS["sub-actions"]).toEqual([
      "project",
      "milestone",
      "result",
      "action",
    ]);
  });

  it("matches what buildRegisterRows actually attaches", () => {
    for (const level of [
      "projects",
      "milestones",
      "results",
      "actions",
      "sub-actions",
    ] as const) {
      const rows = buildRegisterRows([deep()], level);
      expect(rows.length).toBeGreaterThan(0);
      for (const r of rows) {
        expect(r.ancestors.map((a) => a.kind)).toEqual(ANCESTOR_KINDS[level]);
      }
    }
  });

  it("lists actions rolling up sub-actions, and sub-actions rolling up deeper", () => {
    expect(LEVEL_KIND.actions).toBe("action");
    expect(ROLLUP_KIND.actions).toBe("sub_action");
    expect(LEVEL_KIND["sub-actions"]).toBe("sub_action");
    expect(ROLLUP_KIND["sub-actions"]).toBe("sub_sub_action");
  });
});

describe("the projects register", () => {
  it("lists every project with no ancestor columns — it IS the top", () => {
    const rows = buildRegisterRows([deep(), node("project", "Second")], "projects");
    expect(rows.map((r) => r.node.name)).toEqual(["AICL WMS", "Second"]);
    expect(rows.every((r) => r.ancestors.length === 0)).toBe(true);
  });

  it("numbers projects P1, P2 — and the short ref is the full ref up here", () => {
    const rows = buildRegisterRows([deep(), node("project", "Second")], "projects");
    expect(rows.map((r) => r.ownRef)).toEqual(["P1", "P2"]);
    expect(rows[0]!.fullRef).toBe("P1");
  });

  it("rolls up MILESTONES — the brief's 3/10 column", () => {
    const rows = buildRegisterRows([deep()], "projects");
    // deep() has two milestones, neither complete.
    expect(rows[0]!.rollup).toMatchObject({ completed: 0, total: 2 });
  });

  it("carries a half-done milestone as 0.5 — 1.5/2", () => {
    const tree = [
      node("project", "P", {
        children: [
          node("milestone", "m1", { progressPercent: 100 }),
          node("milestone", "m2", { progressPercent: 50 }),
        ],
      }),
    ];
    expect(buildRegisterRows(tree, "projects")[0]!.rollup).toMatchObject({
      completed: 1.5,
      total: 2,
    });
  });

  it("shows a project with no milestones as 0 of 0, not as a missing row", () => {
    const rows = buildRegisterRows([node("project", "Empty")], "projects");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.rollup).toEqual({ completed: 0, total: 0, fraction: 0 });
  });
});
