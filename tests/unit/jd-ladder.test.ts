import { describe, it, expect } from "vitest";
import {
  RANK_LADDER,
  isVacant,
  resolveAssignees,
  shouldDeEscalate,
  type Holder,
  type Position,
} from "@/lib/jd/ladder";

/**
 * THE VACANCY RULE DECIDES WHO DOES THE WORK.
 *
 * Get it wrong and somebody else's task lands on you silently, or vanishes —
 * and the only symptom is a job that quietly never gets done. These pin the
 * climb, its boundaries, and the cases where it must refuse to guess.
 */

const rank = (name: string) => RANK_LADDER.find((r) => r.name === name)!.order;

/** A small org: Operations and Sales, four rungs each. */
const positions: Position[] = [
  { id: "ops-exec", functionKey: "operations", rankOrder: rank("Executive"), title: "Ops Exec" },
  { id: "ops-sr", functionKey: "operations", rankOrder: rank("Sr. Executive"), title: "Ops Sr" },
  { id: "ops-cons", functionKey: "operations", rankOrder: rank("Consultant"), title: "Ops Cons" },
  { id: "ops-mgr", functionKey: "operations", rankOrder: rank("Manager"), title: "Ops Mgr" },
  { id: "sales-exec", functionKey: "sales", rankOrder: rank("Executive"), title: "Sales Exec" },
  { id: "sales-mgr", functionKey: "sales", rankOrder: rank("Manager"), title: "Sales Mgr" },
];

const at = (positionId: string, employeeId: string): Holder => ({
  employeeId,
  name: employeeId,
  positionId,
});

const pos = (id: string) => positions.find((p) => p.id === id)!;

describe("the rank ladder", () => {
  it("holds the twenty-six ranks the business named, in their order", () => {
    // Replaced a fourteen-rung ladder on 2026-09-12. The ORDER is the account
    // holder's, and it is behaviour: see the escalation tests below.
    expect(RANK_LADDER).toHaveLength(26);
    expect(RANK_LADDER[0]!.name).toBe("Intern - First Year");
    expect(RANK_LADDER[25]!.name).toBe("Chairman");
  });

  it("puts the GM grades ABOVE the VP grades, as listed", () => {
    /* STATED SO IT IS A DECISION, NOT A DRIFT. As ordered, a vacant Manager
       seat escalates through Associate Vice President, Vice President and
       President before it reaches Assistant General Manager — the reverse of
       how many firms rank the two tracks. This test fails if somebody flips
       them without meaning to; changing it is a two-line edit plus a migration
       when the intent changes. */
    expect(rank("Associate Vice President")).toBeLessThan(rank("Assistant General Manager"));
    expect(rank("President")).toBeLessThan(rank("Assistant General Manager"));
    expect(rank("Sr. General Manager")).toBeLessThan(rank("Associate Director"));
  });

  it("tops out at the board titles", () => {
    expect(rank("Director")).toBeLessThan(rank("CEO"));
    expect(rank("CEO")).toBeLessThan(rank("Managing Director"));
    expect(rank("Managing Director")).toBeLessThan(rank("Chairman"));
  });

  it("is strictly increasing, so the climb always terminates", () => {
    const orders = RANK_LADDER.map((r) => r.order);
    expect([...orders].sort((a, b) => a - b)).toEqual(orders);
    expect(new Set(orders).size).toBe(orders.length);
  });

  it("places Consultant BELOW Assistant Manager", () => {
    // The candidate-facing list in interview_positions puts Consultant ABOVE
    // Deputy Manager. The two lists are deliberately not merged — this one
    // decides who covers a vacancy, and swapping it changes who gets the work.
    expect(rank("Consultant")).toBeLessThan(rank("Assistant Manager"));
    expect(rank("Sr. Executive")).toBeLessThan(rank("Consultant"));
  });
});

describe("resolveAssignees", () => {
  it("gives the work to the seat's own holders when it is filled", () => {
    const r = resolveAssignees({
      position: pos("ops-exec"),
      positions,
      holders: [at("ops-exec", "dattaram")],
    });
    expect(r.via).toBe("holder");
    expect(r.employeeIds).toEqual(["dattaram"]);
  });

  it("escalates a vacant seat to the next filled rank up", () => {
    const r = resolveAssignees({
      position: pos("ops-exec"),
      positions,
      holders: [at("ops-sr", "parvez")],
    });
    expect(r.via).toBe("escalated");
    expect(r.employeeIds).toEqual(["parvez"]);
    expect(r.escalatedToPositionId).toBe("ops-sr");
  });

  it("SKIPS empty rungs rather than stopping at them", () => {
    // Executive and Sr. Executive both vacant → the work reaches Consultant.
    const r = resolveAssignees({
      position: pos("ops-exec"),
      positions,
      holders: [at("ops-cons", "mishti")],
    });
    expect(r.via).toBe("escalated");
    expect(r.escalatedToPositionId).toBe("ops-cons");
    expect(r.chain).toEqual([rank("Sr. Executive"), rank("Consultant")]);
  });

  it("NEVER crosses into another function", () => {
    // Every Operations seat above Executive is empty, but Sales is fully
    // staffed. A vacant Sales seat must not become the Ops Manager's problem,
    // and vice versa.
    const r = resolveAssignees({
      position: pos("ops-exec"),
      positions,
      holders: [at("sales-mgr", "someone-in-sales")],
    });
    expect(r.via).toBe("unassigned");
    expect(r.employeeIds).toEqual([]);
  });

  it("never silently drops the task when nothing above is filled", () => {
    const r = resolveAssignees({
      position: pos("ops-exec"),
      positions,
      holders: [],
    });
    expect(r.via).toBe("unassigned");
    expect(r.employeeIds).toEqual([]);
    // The caller has to raise this — a task with no doer cannot be written to
    // `tasks` at all, so it must surface rather than be swallowed.
  });

  it("lets an explicit assignment beat the seat", () => {
    const r = resolveAssignees({
      position: pos("ops-exec"),
      positions,
      holders: [at("ops-exec", "dattaram")],
      assignedEmployeeIds: ["mishti"],
    });
    expect(r.via).toBe("assigned");
    expect(r.employeeIds).toEqual(["mishti"]);
  });

  it("lets a delegation beat everything, including an explicit assignment", () => {
    // A delegation is a dated decision a human made about a specific absence.
    // It has to outrank every inherited default, or covering does not work.
    const r = resolveAssignees({
      position: pos("ops-exec"),
      positions,
      holders: [at("ops-exec", "dattaram")],
      assignedEmployeeIds: ["mishti"],
      delegateEmployeeIds: ["parvez"],
    });
    expect(r.via).toBe("delegation");
    expect(r.employeeIds).toEqual(["parvez"]);
  });

  it("gives the task to everyone in a shared seat", () => {
    const r = resolveAssignees({
      position: pos("ops-exec"),
      positions,
      holders: [at("ops-exec", "dattaram"), at("ops-exec", "parvez")],
    });
    expect(r.employeeIds).toEqual(["dattaram", "parvez"]);
  });

  it("does not escalate downward", () => {
    // A vacant Manager seat must not fall to the Executive below it.
    const r = resolveAssignees({
      position: pos("ops-mgr"),
      positions,
      holders: [at("ops-exec", "dattaram")],
    });
    expect(r.via).toBe("unassigned");
  });
});

describe("isVacant", () => {
  it("is true only when nobody active holds the seat", () => {
    expect(isVacant("ops-exec", [])).toBe(true);
    expect(isVacant("ops-exec", [at("ops-sr", "parvez")])).toBe(true);
    expect(isVacant("ops-exec", [at("ops-exec", "dattaram")])).toBe(false);
  });
});

describe("shouldDeEscalate", () => {
  const base = { wasEscalated: true, started: false, overdue: false, completed: false };

  it("moves escalated work that is unstarted and not yet due", () => {
    expect(shouldDeEscalate(base)).toBe(true);
  });

  it("leaves started work with whoever began it", () => {
    // Reassigning silently loses the context of what they already did, and
    // surprises both people.
    expect(shouldDeEscalate({ ...base, started: true })).toBe(false);
  });

  it("leaves an overdue task alone", () => {
    // Moving it hides the lateness and resets its clock.
    expect(shouldDeEscalate({ ...base, overdue: true })).toBe(false);
  });

  it("never rewrites completed history", () => {
    expect(shouldDeEscalate({ ...base, completed: true })).toBe(false);
  });

  it("ignores work that was never escalated in the first place", () => {
    expect(shouldDeEscalate({ ...base, wasEscalated: false })).toBe(false);
  });
});
