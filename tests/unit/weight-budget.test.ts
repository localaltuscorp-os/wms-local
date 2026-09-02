import { describe, it, expect } from "vitest";
import { balanceWeightsToBudget, weightTotal, WEIGHT_BUDGET } from "@/lib/weekly-goals/effective";

const sum = (m: Map<string, number>) => [...m.values()].reduce((s, v) => s + v, 0);

describe("balanceWeightsToBudget — fixed 100 budget", () => {
  it("the reported bug: 7 goals × 20 (=140) rebalances to exactly 100", () => {
    const goals = Array.from({ length: 7 }, (_, i) => ({ id: `g${i}`, weight: 20 }));
    expect(weightTotal(goals)).toBe(140); // the 'over 100' the user saw
    const out = balanceWeightsToBudget(goals);
    expect(sum(out)).toBe(100); // never 98 / 101 — always exactly the budget
    // Equal inputs → as-even-as-possible (some 14, some 15) summing to 100.
    for (const v of out.values()) expect(v === 14 || v === 15).toBe(true);
  });

  it("already-balanced 5 × 20 stays 5 × 20", () => {
    const goals = Array.from({ length: 5 }, (_, i) => ({ id: `g${i}`, weight: 20 }));
    const out = balanceWeightsToBudget(goals);
    expect(sum(out)).toBe(100);
    for (const v of out.values()) expect(v).toBe(20);
  });

  it("preserves proportions (50/30/20 of any scale → 50/30/20)", () => {
    const out = balanceWeightsToBudget([
      { id: "a", weight: 100 },
      { id: "b", weight: 60 },
      { id: "c", weight: 40 },
    ]);
    expect(sum(out)).toBe(100);
    expect(out.get("a")).toBe(50);
    expect(out.get("b")).toBe(30);
    expect(out.get("c")).toBe(20);
  });

  it("under-budget totals are scaled UP to 100 too (3 × 10 → 100)", () => {
    const goals = Array.from({ length: 3 }, (_, i) => ({ id: `g${i}`, weight: 10 }));
    const out = balanceWeightsToBudget(goals);
    expect(sum(out)).toBe(100);
  });

  it("all-zero weights → even split summing to 100", () => {
    const goals = Array.from({ length: 4 }, (_, i) => ({ id: `g${i}`, weight: 0 }));
    const out = balanceWeightsToBudget(goals);
    expect(sum(out)).toBe(100);
    expect([...out.values()].sort()).toEqual([25, 25, 25, 25]);
  });

  it("single goal takes the whole budget", () => {
    const out = balanceWeightsToBudget([{ id: "solo", weight: 999 }]);
    expect(out.get("solo")).toBe(WEIGHT_BUDGET);
  });

  it("empty set → empty map (no crash)", () => {
    expect(balanceWeightsToBudget([]).size).toBe(0);
  });
});
