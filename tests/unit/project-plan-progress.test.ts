import { describe, it, expect } from "vitest";
import {
  nodeFraction,
  executableLeaves,
  milestoneCompletion,
  projectFraction,
  toPercent,
  formatCompleted,
  formatCompletion,
  describeProgress,
  type ProgressNode,
} from "@/lib/project-plan/progress";
import type { PlanKind } from "@/lib/project-plan/levels";

/** A node, minimally. `children` defaults to none so a leaf is one call. */
function n(
  kind: PlanKind,
  opts: {
    progressPercent?: number | null;
    status?: string;
    children?: ProgressNode[];
  } = {},
): ProgressNode {
  return {
    kind,
    progressPercent: opts.progressPercent ?? null,
    task: opts.status ? { status: opts.status } : null,
    children: opts.children ?? [],
  };
}

/** A milestone holding `total` actions, `done` of them finished. */
function milestoneWith(done: number, total: number): ProgressNode {
  const actions = Array.from({ length: total }, (_, i) =>
    n("action", { status: i < done ? "done" : "not_started" }),
  );
  return n("milestone", { children: [n("result", { children: actions })] });
}

describe("nodeFraction — recorded beats derived, derived beats a guess", () => {
  it("honours a recorded percentage over the work underneath", () => {
    // Three of four actions are done (75%), but a person said 40%. The human
    // judgement wins — a derived number must not silently overrule it.
    const m = n("milestone", {
      progressPercent: 40,
      children: [n("result", {
        children: [
          n("action", { status: "done" }),
          n("action", { status: "done" }),
          n("action", { status: "done" }),
          n("action", { status: "not_started" }),
        ],
      })],
    });
    expect(nodeFraction(m)).toBeCloseTo(0.4);
  });

  it("derives done ÷ total from the executable rows when nothing is recorded", () => {
    expect(nodeFraction(milestoneWith(3, 4))).toBeCloseTo(0.75);
    expect(nodeFraction(milestoneWith(0, 4))).toBe(0);
    expect(nodeFraction(milestoneWith(4, 4))).toBe(1);
  });

  it("reports 0 for an empty container rather than a flattering guess", () => {
    expect(nodeFraction(n("milestone"))).toBe(0);
    expect(nodeFraction(n("project"))).toBe(0);
  });

  it("counts only `done` — an approval verdict is not progress", () => {
    const m = n("milestone", {
      children: [n("result", {
        children: [n("action", { status: "approved" }), n("action", { status: "cancelled" })],
      })],
    });
    expect(nodeFraction(m)).toBe(0);
  });

  it("clamps a nonsense recorded value instead of returning >1", () => {
    expect(nodeFraction(n("milestone", { progressPercent: 140 }))).toBe(1);
    expect(nodeFraction(n("milestone", { progressPercent: -20 }))).toBe(0);
  });
});

describe("executableLeaves — the only honest denominator", () => {
  it("counts a subdivided action once, by its children", () => {
    // An action with two sub-actions is measured by the two, not by three
    // rows — otherwise subdividing work would change how complete it looks.
    const action = n("action", {
      children: [n("sub_action", { status: "done" }), n("sub_action", { status: "not_started" })],
    });
    expect(executableLeaves(action)).toHaveLength(2);
    expect(nodeFraction(action)).toBeCloseTo(0.5);
  });

  it("ignores containers, so subdividing a milestone cannot inflate it", () => {
    const m = n("milestone", {
      children: [
        n("result", { children: [n("action", { status: "done" })] }),
        n("result", { children: [n("action", { status: "not_started" })] }),
      ],
    });
    expect(executableLeaves(m)).toHaveLength(2);
    expect(nodeFraction(m)).toBeCloseTo(0.5);
  });
});

// The heart of brief §7: completion is a SUM OF FRACTIONS, not a count of
// finished milestones, and the decimal must survive to the screen.
describe("milestoneCompletion — partial completion, undamaged", () => {
  it("10 milestones with one half done → 3.5/10", () => {
    const ms = [
      ...Array.from({ length: 3 }, () => n("milestone", { progressPercent: 100 })),
      n("milestone", { progressPercent: 50 }),
      ...Array.from({ length: 6 }, () => n("milestone")),
    ];
    const c = milestoneCompletion(n("project", { children: ms }));
    expect(c.total).toBe(10);
    expect(c.completed).toBeCloseTo(3.5);
    expect(formatCompletion(c)).toBe("3.5/10");
  });

  it("8 milestones with one a quarter done → 2.25/8", () => {
    const ms = [
      n("milestone", { progressPercent: 100 }),
      n("milestone", { progressPercent: 100 }),
      n("milestone", { progressPercent: 25 }),
      ...Array.from({ length: 5 }, () => n("milestone")),
    ];
    const c = milestoneCompletion(n("project", { children: ms }));
    expect(c.completed).toBeCloseTo(2.25);
    expect(formatCompletion(c)).toBe("2.25/8");
  });

  it("4 milestones with one three-quarters done → 1.75/4", () => {
    const ms = [
      n("milestone", { progressPercent: 100 }),
      n("milestone", { progressPercent: 75 }),
      n("milestone"),
      n("milestone"),
    ];
    const c = milestoneCompletion(n("project", { children: ms }));
    expect(c.completed).toBeCloseTo(1.75);
    expect(formatCompletion(c)).toBe("1.75/4");
  });

  it("7 milestones with one 40% done → 4.4/7", () => {
    const ms = [
      ...Array.from({ length: 4 }, () => n("milestone", { progressPercent: 100 })),
      n("milestone", { progressPercent: 40 }),
      n("milestone"),
      n("milestone"),
    ];
    const c = milestoneCompletion(n("project", { children: ms }));
    expect(c.completed).toBeCloseTo(4.4);
    expect(formatCompletion(c)).toBe("4.4/7");
  });

  it("mixes recorded and derived milestones in one project", () => {
    // One derived at 3/4, one recorded at 50%, one empty → 1.25 of 3.
    const p = n("project", {
      children: [milestoneWith(3, 4), n("milestone", { progressPercent: 50 }), n("milestone")],
    });
    const c = milestoneCompletion(p);
    expect(c.completed).toBeCloseTo(1.25);
    expect(formatCompletion(c)).toBe("1.25/3");
  });

  it("reports 0 of 0 for a project with no milestones", () => {
    const c = milestoneCompletion(n("project"));
    expect(c).toEqual({ completed: 0, total: 0, fraction: 0 });
  });
});

describe("formatCompleted — the brief's 'do not round incorrectly'", () => {
  it("keeps two decimals, so 2.25 never becomes 2.3", () => {
    expect(formatCompleted(2.25)).toBe("2.25");
    expect(formatCompleted(3.5)).toBe("3.5");
    expect(formatCompleted(4.4)).toBe("4.4");
    expect(formatCompleted(1.75)).toBe("1.75");
  });

  it("does not pad a whole number into 3.00", () => {
    expect(formatCompleted(3)).toBe("3");
    expect(formatCompleted(0)).toBe("0");
  });
});

describe("projectFraction — what a project IS to the person reading it", () => {
  it("is its milestone completion when it has milestones", () => {
    const p = n("project", {
      children: [n("milestone", { progressPercent: 100 }), n("milestone", { progressPercent: 0 })],
    });
    expect(projectFraction(p)).toBeCloseTo(0.5);
    expect(toPercent(projectFraction(p))).toBe(50);
  });

  it("falls back to its own actions when it is run as a flat list", () => {
    // A small project with no milestones still reports something true rather
    // than a flat 0%.
    const p = n("project", {
      children: [n("action", { status: "done" }), n("action", { status: "not_started" })],
    });
    expect(projectFraction(p)).toBeCloseTo(0.5);
  });
});

describe("describeProgress — the sentence the screen shows", () => {
  it("reads '40% | 4.4/7 | 4.4 out of 7 milestones are completed'", () => {
    const p = n("project", {
      children: [
        ...Array.from({ length: 4 }, () => n("milestone", { progressPercent: 100 })),
        n("milestone", { progressPercent: 40 }),
        n("milestone"),
        n("milestone"),
      ],
    });
    const d = describeProgress(p);
    expect(d.percent).toBe(63); // 4.4/7
    expect(d.short).toBe("63%");
    expect(d.long).toBe("63% | 4.4/7 | 4.4 out of 7 milestones are completed");
  });

  it("says so plainly when there are no milestones yet", () => {
    expect(describeProgress(n("project")).long).toBe("0% · no milestones yet");
  });
});
