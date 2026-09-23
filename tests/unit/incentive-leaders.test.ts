import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

vi.mock("server-only", () => ({}));
// The query module reaches `db` at import time; this suite exercises the pure
// leaderboard mapping, so the pool is never built and never connected.
vi.mock("@/lib/db", () => ({ db: {} }));

import { incentiveLeaders } from "@/lib/queries/incentive-analytics";
import type { IncentiveAnalytics, EmployeePerformance } from "@/lib/incentive/analytics/model";

/**
 * THE LEADERBOARD RANKING.
 *
 * The Trends leaderboard used to be `perEmployee.slice(0, 10)` — sorted by RAW
 * amount. This app ranks on % OF CTC (the figure the grade comes from), so the
 * two rankings could order the same people differently on one screen. The
 * leaderboard is now a slice of the analytics model's own ranked rows.
 *
 * What these tests pin:
 *   · the ORDER comes from the model (`employees`), never from a re-sort here;
 *   · only ranked people appear (no CTC ⇒ no rank ⇒ not on a leaderboard);
 *   · `pctOfCtc` — not `earned` — is the figure carried out;
 *   · the limit is a slice, and it slices the RANK order.
 */

function person(over: Partial<EmployeePerformance> & { name: string }): EmployeePerformance {
  const { name, ...rest } = over;
  return {
    employeeId: name.toLowerCase(),
    name,
    code: null,
    isSelf: false,
    ctc: null,
    ctcState: "ok",
    earned: 0,
    pctOfCtc: null,
    grade: null,
    rank: null,
    previousRank: null,
    movement: { kind: "na" },
    target: null,
    difference: null,
    ...rest,
  };
}

function analytics(employees: EmployeePerformance[]): IncentiveAnalytics {
  return { employees } as unknown as IncentiveAnalytics;
}

describe("incentiveLeaders", () => {
  it("keeps the model's rank order and carries the percentage, not the amount", () => {
    // The SMALLER earner holds rank 1 because their CTC is smaller — exactly the
    // case a raw-amount sort gets wrong.
    const leaders = incentiveLeaders(
      analytics([
        person({ name: "Asha", rank: 1, pctOfCtc: 42.5, earned: 50000, grade: "A" }),
        person({ name: "Bilal", rank: 2, pctOfCtc: 31, earned: 900000, grade: "B" }),
      ]),
    );

    expect(leaders.map((l) => l.name)).toEqual(["Asha", "Bilal"]);
    expect(leaders.map((l) => l.rank)).toEqual([1, 2]);
    expect(leaders[0]!.pctOfCtc).toBe(42.5);
    expect(leaders[0]!.earned).toBe(50000);
  });

  it("drops anyone the model did not rank (no CTC, or nothing earned)", () => {
    const leaders = incentiveLeaders(
      analytics([
        person({ name: "Ranked", rank: 1, pctOfCtc: 12, earned: 100 }),
        person({ name: "NoCtc", rank: null, pctOfCtc: null, earned: 0 }),
        person({ name: "NoEarn", rank: null, pctOfCtc: null, earned: 0 }),
      ]),
    );
    expect(leaders.map((l) => l.name)).toEqual(["Ranked"]);
  });

  it("never invents a percentage for a row the model left unranked", () => {
    // A row with an amount but no percentage must not be ranked here either:
    // the two lists would disagree again.
    const leaders = incentiveLeaders(
      analytics([person({ name: "Percentless", rank: null, pctOfCtc: null, earned: 250000 })]),
    );
    expect(leaders).toEqual([]);
  });

  it("slices the rank order at the limit", () => {
    const rows = Array.from({ length: 14 }, (_, i) =>
      person({ name: `P${i}`, rank: i + 1, pctOfCtc: 30 - i, earned: 1000 - i }),
    );
    const leaders = incentiveLeaders(analytics(rows));
    expect(leaders).toHaveLength(10);
    expect(leaders.map((l) => l.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});

describe("the raw-amount leaderboard is gone", () => {
  const dashboard = readFileSync("lib/queries/incentives.ts", "utf8");

  it("IncentiveDashboard no longer publishes a leaderboard", () => {
    expect(dashboard).not.toContain("leaderboard: IncentivePersonRow[]");
  });

  it("nothing in the query slices a raw-amount ranking (the doc comment names it, code does not)", () => {
    // The only remaining mention is the comment explaining its removal.
    const code = dashboard
      .split(/\r?\n/)
      .filter((line) => !line.trim().startsWith("*") && !line.trim().startsWith("//"))
      .join("\n");
    expect(code).not.toContain("perEmployee.slice(0, 10)");
    expect(code).not.toContain("leaderboard");
  });

  it("the Trends band is fed the ranked rows from the analytics model", () => {
    const component = readFileSync("components/incentive/incentive-dashboard.tsx", "utf8");
    expect(component).toContain("leaders");
    expect(component).not.toContain("leaderTotal");
  });
});
