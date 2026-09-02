import { describe, expect, it } from "vitest";
import {
  computeActivityTargets,
  calendarDaysBetween,
} from "@/lib/dashboard/manager-activity-contract";
import {
  cellTarget,
  SELF_TARGETS,
  WORKLOAD_FAMILIES,
} from "@/lib/dashboard/creator-workload-contract";

/**
 * THE QUOTA MATRIX, pinned.
 *
 * These numbers are a business rule, not a derivation, and they are spread
 * across three places by necessity: the per-person rates live in SELF_TARGETS,
 * the window-scaled ones come out of computeActivityTargets, and which of the
 * two a given cell uses is decided in cellTarget. Nothing about the UI fails
 * loudly when one of them drifts — a wrong denominator still renders a
 * plausible ratio in a plausible colour, which is the worst kind of wrong.
 *
 * The worked example throughout is the one the spec states: a manager with
 * SEVEN direct reports over a 7-day window containing 6 working days.
 */

const REPORTS = 7;
/** The manager plus their reports — the scope a manager summary bar covers. */
const HEADCOUNT = REPORTS + 1;

const targets = computeActivityTargets(calendarDaysBetween("2026-08-14", "2026-08-20"), 6);

describe("the window's own targets", () => {
  it("is 3 goals, 30 tasks, 30 commitments over 6 working of 7 days", () => {
    expect(targets).toMatchObject({
      goals: 3,
      tasks: 30,
      commitments: 30,
      workingDays: 6,
      calendarDays: 7,
    });
  });

  it("renders the header subtitle the spec asks for", () => {
    const subtitle =
      `Targets for this window: ${targets.goals} goals · ${targets.tasks} tasks · ` +
      `${targets.commitments} commitments (${targets.workingDays} working of ${targets.calendarDays} days)`;
    expect(subtitle).toBe(
      "Targets for this window: 3 goals · 30 tasks · 30 commitments (6 working of 7 days)",
    );
  });

  it("scales tasks and commitments with WORKING days, not calendar days", () => {
    // A fortnight with a public holiday in it: 14 calendar days, 9 working.
    const fortnight = computeActivityTargets(14, 9);
    expect(fortnight.tasks).toBe(45);
    expect(fortnight.commitments).toBe(45);
    // Goals accrue with the CALENDAR — a weekly goal is a commitment to a week,
    // not to the days you happened to work in it.
    expect(fortnight.goals).toBe(6);
  });
});

describe("Self Created — the flat per-person rate", () => {
  it("is 3 goals a week, 5 tasks a day, 5 commitments a day", () => {
    expect(SELF_TARGETS).toEqual({ goals: 3, tasks: 5, commitments: 5 });
  });

  it("does NOT move when the window does", () => {
    const year = computeActivityTargets(365, 250);
    for (const f of WORKLOAD_FAMILIES) {
      expect(cellTarget(year, f.key, "self", REPORTS)).toBe(SELF_TARGETS[f.key]);
      expect(cellTarget(targets, f.key, "self", 0)).toBe(SELF_TARGETS[f.key]);
    }
  });
});

describe("Delegated Out — per report, scaled by the window", () => {
  it("is 21 goals and 210 tasks / commitments for 7 reports over 6 working days", () => {
    expect(cellTarget(targets, "goals", "downward", REPORTS)).toBe(21);
    expect(cellTarget(targets, "tasks", "downward", REPORTS)).toBe(210);
    expect(cellTarget(targets, "commitments", "downward", REPORTS)).toBe(210);
  });

  it("has NO quota for someone with nobody under them", () => {
    // null, not 0. `0 / 0` renders as a failed quota where there is no quota.
    for (const f of WORKLOAD_FAMILIES) {
      expect(cellTarget(targets, f.key, "downward", 0)).toBeNull();
    }
  });
});

describe("the three untargeted relations", () => {
  it("carry raw counts, never a denominator", () => {
    for (const f of WORKLOAD_FAMILIES) {
      for (const rel of ["counterpart", "upward", "founder"] as const) {
        expect(cellTarget(targets, f.key, rel, REPORTS)).toBeNull();
      }
    }
  });
});

describe("the manager summary bar", () => {
  /* The bar covers the whole line, so its target is the line's: the manager's
     own quota plus one per report. Which is `targets[family] * headcount` —
     the form the component actually uses. Both are asserted so the identity
     cannot quietly stop holding. */
  it("is self + delegated, which is the window target times headcount", () => {
    expect(targets.goals + targets.goals * REPORTS).toBe(24);
    expect(targets.goals * HEADCOUNT).toBe(24);

    expect(targets.tasks + targets.tasks * REPORTS).toBe(240);
    expect(targets.tasks * HEADCOUNT).toBe(240);

    expect(targets.commitments * HEADCOUNT).toBe(240);
  });
});
