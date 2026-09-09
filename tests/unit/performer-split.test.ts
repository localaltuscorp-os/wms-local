import { describe, it, expect } from "vitest";
import type { Employee } from "@/db/schema";
import type { PunctualityPerson, TopPerformer } from "@/lib/types";
import {
  TOP_PERFORMER_RANKS,
  rankWholeRoster,
  splitLeaderboard,
} from "@/lib/transforms/performer-split";

/**
 * The property these tests exist for: a person is on EXACTLY ONE of the two
 * dashboard leaderboards. Both cards used to admit the whole roster, so
 * everyone was praised at the top of the page and flagged for a pull-up
 * conversation lower down it.
 *
 * The boundary matters more than the volume: TOP_PERFORMER_RANKS is 15, and the
 * dummy roster is 12 people, so nothing local ever crosses the cut. These
 * fixtures do.
 */

function performer(rank: number, doneCount = 20 - rank): TopPerformer {
  return {
    employeeId: `e${rank}`,
    employeeName: `Person ${rank}`,
    doneCount,
    weeklySparkline: new Array(7).fill(0),
    rank,
    department: null,
    completedOnTime: doneCount,
    datedCompletions: doneCount,
    onTimeRate: 100,
    avgTurnaroundDays: 1,
  };
}

function punctual(employeeId: string, done: number, late: number): PunctualityPerson {
  return {
    employeeId,
    employeeName: employeeId,
    done,
    onTime: done - late,
    late,
    rate: done > 0 ? Math.round(((done - late) / done) * 100) : 0,
    lateSpread: { d1_3: late, d4_7: 0, d8_14: 0, d15: 0 },
    avgDaysLate: late > 0 ? 2 : null,
    department: null,
  };
}

function employee(id: string, name: string, over: Partial<Employee> = {}): Employee {
  return {
    id,
    name,
    isActive: true,
    accountType: "employee",
    department: null,
    ...over,
  } as Employee;
}

describe("splitLeaderboard", () => {
  const roster = Array.from({ length: 20 }, (_, i) => performer(i + 1));

  it("puts ranks 1-15 on the top board and 16+ on the pull-up board", () => {
    const { top, pullUp } = splitLeaderboard(roster, []);

    expect(top.map((p) => p.rank)).toEqual([...Array(TOP_PERFORMER_RANKS).keys()].map((i) => i + 1));
    expect(pullUp.every((p) => p.rank > TOP_PERFORMER_RANKS)).toBe(true);
  });

  it("never puts the same person on both boards, and never loses one", () => {
    const { top, pullUp } = splitLeaderboard(roster, []);

    const topIds = new Set(top.map((p) => p.employeeId));
    const pullIds = new Set(pullUp.map((p) => p.employeeId));

    for (const id of topIds) expect(pullIds.has(id)).toBe(false);
    expect(topIds.size + pullIds.size).toBe(roster.length);
  });

  it("orders the pull-up board WORST first, so the ⚠️ lands on the last-placed person", () => {
    const { pullUp } = splitLeaderboard(roster, []);
    expect(pullUp.map((p) => p.rank)).toEqual([20, 19, 18, 17, 16]);
  });

  it("carries the team-wide rank onto the pull-up rows rather than renumbering from 1", () => {
    const { pullUp } = splitLeaderboard(roster, [punctual("e18", 4, 3)]);
    const row = pullUp.find((p) => p.employeeId === "e18");
    expect(row?.rank).toBe(18);
    expect(row?.late).toBe(3);
  });

  it("keeps someone with no punctuality row at all, with zeroes", () => {
    const { pullUp } = splitLeaderboard(roster, []);
    const row = pullUp.find((p) => p.employeeId === "e20");
    // Present, not dropped — the bottom of the roster is exactly who this card
    // is for, and it is the person least likely to have dated, delivered work.
    expect(row).toBeDefined();
    expect(row?.done).toBe(0);
    expect(row?.avgDaysLate).toBeNull();
  });

  it("leaves both boards empty for an empty roster", () => {
    expect(splitLeaderboard([], [])).toEqual({ top: [], pullUp: [] });
  });
});

describe("rankWholeRoster", () => {
  it("ranks people who completed nothing BELOW everyone who completed something", () => {
    const ranking = [performer(1), performer(2)];
    const employees = [
      employee("e1", "Person 1"),
      employee("e2", "Person 2"),
      employee("z", "Zoe Zero"),
      employee("a", "Aaron Zero"),
    ];

    const all = rankWholeRoster(ranking, employees);

    expect(all.map((p) => p.rank)).toEqual([1, 2, 3, 4]);
    // Alphabetical among the zero-completion people — arbitrary, but stable, so
    // the ranks do not shuffle between renders.
    expect(all[2]?.employeeName).toBe("Aaron Zero");
    expect(all[3]?.employeeName).toBe("Zoe Zero");
    expect(all[2]?.doneCount).toBe(0);
    // Null, never 0% — a 0% on-time rate would libel someone with no dated work.
    expect(all[2]?.onTimeRate).toBeNull();
  });

  it("excludes inactive, candidate and system accounts", () => {
    const employees = [
      employee("live", "Live One"),
      employee("gone", "Left Us", { isActive: false }),
      employee("cand", "Candidate", { accountType: "candidate" }),
      employee("sys", "Test Login", { accountType: "system" }),
    ];

    const all = rankWholeRoster([], employees);

    expect(all.map((p) => p.employeeName)).toEqual(["Live One"]);
  });

  it("does not re-add or renumber somebody already ranked", () => {
    const ranking = [performer(1)];
    const all = rankWholeRoster(ranking, [employee("e1", "Person 1")]);
    expect(all).toHaveLength(1);
    expect(all[0]?.rank).toBe(1);
  });
});
