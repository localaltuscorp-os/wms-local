import { describe, it, expect } from "vitest";
import {
  childCompletion,
  resultsCompletion,
  actionsCompletion,
  milestoneCompletion,
  formatCompletion,
  formatCompleted,
  type ProgressNode,
} from "@/lib/project-plan/progress";
import type { PlanKind } from "@/lib/project-plan/levels";

/**
 * The Milestones / Results registers, at the level that actually decides the
 * numbers: the rollup columns.
 *
 * Everything here is the brief's own arithmetic — "Results Completion" is the
 * same partial rule as milestone completion, one level down, so a result
 * recorded at 50% must add 0.5 and never round to 0 or 1.
 */

function node(kind: PlanKind, opts: Partial<ProgressNode> = {}): ProgressNode {
  return { kind, children: [], ...opts };
}

/** N results under a milestone, the first `partials.length` at given percents. */
function milestoneWith(total: number, partials: number[]): ProgressNode {
  const results: ProgressNode[] = [];
  for (let i = 0; i < total; i++) {
    results.push(node("result", { progressPercent: partials[i] ?? 0 }));
  }
  return node("milestone", { children: results });
}

describe("results completion (the Milestones register rollup)", () => {
  it("counts whole results — 3/10", () => {
    const m = milestoneWith(10, [100, 100, 100]);
    const c = resultsCompletion(m);
    expect(c.completed).toBe(3);
    expect(c.total).toBe(10);
    expect(formatCompletion(c)).toBe("3/10");
  });

  // The four worked examples from the brief, verbatim.
  it("carries a half-finished result as 0.5 — 3.5/10", () => {
    const c = resultsCompletion(milestoneWith(10, [100, 100, 100, 50]));
    expect(c.completed).toBe(3.5);
    expect(formatCompletion(c)).toBe("3.5/10");
  });

  it("carries a quarter-finished result — 2.25/8", () => {
    const c = resultsCompletion(milestoneWith(8, [100, 100, 25]));
    expect(c.completed).toBe(2.25);
    expect(formatCompletion(c)).toBe("2.25/8");
  });

  it("carries a three-quarter result — 1.75/4", () => {
    const c = resultsCompletion(milestoneWith(4, [100, 75]));
    expect(c.completed).toBe(1.75);
    expect(formatCompletion(c)).toBe("1.75/4");
  });

  it("carries a 40% result — 4.4/7", () => {
    const c = resultsCompletion(milestoneWith(7, [100, 100, 100, 100, 40]));
    expect(c.completed).toBeCloseTo(4.4, 10);
    expect(formatCompletion(c)).toBe("4.4/7");
  });

  it("never rounds 2.25 to 2.3 or 2", () => {
    expect(formatCompleted(2.25)).toBe("2.25");
    expect(formatCompleted(3.5)).toBe("3.5");
    expect(formatCompleted(3)).toBe("3");
  });

  it("reports 0 of 0 for a milestone with no results, not a flattering guess", () => {
    const c = resultsCompletion(node("milestone"));
    expect(c).toEqual({ completed: 0, total: 0, fraction: 0 });
  });

  it("counts only DIRECT results — an action two levels down is not a result", () => {
    const m = node("milestone", {
      children: [
        node("result", {
          progressPercent: 100,
          children: [node("action", { task: { status: "done" } })],
        }),
      ],
    });
    expect(resultsCompletion(m).total).toBe(1);
  });
});

describe("actions completion (the Results register rollup)", () => {
  it("derives each action from its task status — 2/3", () => {
    const r = node("result", {
      children: [
        node("action", { task: { status: "done" } }),
        node("action", { task: { status: "done" } }),
        node("action", { task: { status: "initiated" } }),
      ],
    });
    const c = actionsCompletion(r);
    expect(c.completed).toBe(2);
    expect(formatCompletion(c)).toBe("2/3");
  });

  it("a sub-divided action is measured by its sub-actions, so it can be partial", () => {
    const r = node("result", {
      children: [
        node("action", {
          children: [
            node("sub_action", { task: { status: "done" } }),
            node("sub_action", { task: { status: "not_started" } }),
          ],
        }),
      ],
    });
    // One action, half its sub-actions done → 0.5/1.
    expect(actionsCompletion(r).completed).toBe(0.5);
  });

  it("only 'done' counts — approved or cancelled is a verdict, not progress", () => {
    const r = node("result", {
      children: [
        node("action", { task: { status: "approved" } }),
        node("action", { task: { status: "cancelled" } }),
      ],
    });
    expect(actionsCompletion(r).completed).toBe(0);
  });
});

describe("childCompletion is the one rule all three levels share", () => {
  it("milestoneCompletion is childCompletion(project, 'milestone')", () => {
    const p = node("project", {
      children: [
        node("milestone", { progressPercent: 50 }),
        node("milestone", { progressPercent: 100 }),
      ],
    });
    expect(milestoneCompletion(p)).toEqual(childCompletion(p, "milestone"));
    expect(milestoneCompletion(p).completed).toBe(1.5);
  });

  it("a recorded percent wins over what the work underneath would derive", () => {
    // Two of two actions done would derive 100%, but a person said 40%.
    const m = node("milestone", {
      children: [
        node("result", {
          progressPercent: 40,
          children: [
            node("action", { task: { status: "done" } }),
            node("action", { task: { status: "done" } }),
          ],
        }),
      ],
    });
    expect(resultsCompletion(m).completed).toBeCloseTo(0.4, 10);
  });

  it("clamps a nonsense percent instead of letting it exceed the total", () => {
    const m = node("milestone", {
      children: [node("result", { progressPercent: 400 })],
    });
    expect(resultsCompletion(m).completed).toBe(1);
  });
});
