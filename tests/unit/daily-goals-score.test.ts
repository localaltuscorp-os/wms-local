import { describe, it, expect } from "vitest";
import {
  MAX_RANGE_DAYS,
  emptyScorecard,
  hasSignal,
  mondayOfYmd,
  parsePeriod,
  parseThreshold,
  parseYmd,
  pct,
  relativeDay,
  resolveRange,
  scoreLabel,
  shortDay,
  sumScorecards,
  type ScoreStream,
  type Scorecard,
} from "@/lib/daily-goals/score";
import { belowThreshold, bottomPerformers, topPerformers, type PersonRow } from "@/lib/daily-goals/types";

/* ------------------------------------------------------------------ */
/* A miniature of the server assembler, so the SCORING RULE itself is   */
/* under test rather than just the arithmetic helpers.                  */
/* ------------------------------------------------------------------ */

interface FakeRow {
  /** Where the row sits now. */
  planDate: string;
  /** The day it was planned on before it was moved off, if it was. */
  movedFromDate?: string | null;
  stream: ScoreStream;
  done?: boolean;
}

/**
 * Score ONE day exactly the way app/(app)/my-day/dashboard/data.ts does:
 * a day's planned set is what sits on it PLUS what was moved off it; a day's
 * done set is only what sits on it and is ticked.
 */
function scoreDay(rows: FakeRow[], day: string): Scorecard {
  const card = emptyScorecard();
  for (const r of rows) {
    if (r.planDate === day) {
      card[r.stream].planned += 1;
      card.overall.planned += 1;
      if (r.done) {
        card[r.stream].done += 1;
        card.overall.done += 1;
      } else {
        card.unfinished += 1;
      }
    }
    if (r.movedFromDate && r.movedFromDate === day && r.movedFromDate !== r.planDate) {
      card[r.stream].planned += 1;
      card.overall.planned += 1;
      card.transferred += 1;
    }
  }
  return card;
}

const MON = "2026-08-17";
const TUE = "2026-08-18";

describe("the daily score", () => {
  it("is done over planned, split into three streams that sum to overall", () => {
    const rows: FakeRow[] = [
      { planDate: MON, stream: "goals", done: true },
      { planDate: MON, stream: "goals", done: true },
      { planDate: MON, stream: "goals", done: true },
      { planDate: MON, stream: "goals", done: false },
      { planDate: MON, stream: "wms", done: true },
      { planDate: MON, stream: "wms", done: true },
      { planDate: MON, stream: "wms", done: true },
      { planDate: MON, stream: "commitments", done: true },
      { planDate: MON, stream: "commitments", done: true },
      { planDate: MON, stream: "commitments", done: false },
    ];
    const card = scoreDay(rows, MON);

    expect(scoreLabel(card.overall)).toBe("8 / 10");
    expect(pct(card.overall)).toBe(80);
    expect(scoreLabel(card.goals)).toBe("3 / 4");
    expect(pct(card.goals)).toBe(75);
    expect(scoreLabel(card.wms)).toBe("3 / 3");
    expect(scoreLabel(card.commitments)).toBe("2 / 3");

    const streams = card.goals.planned + card.wms.planned + card.commitments.planned;
    expect(streams).toBe(card.overall.planned);
    expect(card.goals.done + card.wms.done + card.commitments.done).toBe(card.overall.done);
  });

  it("counts every unticked item once — unfinished is reported, never deducted twice", () => {
    const rows: FakeRow[] = [
      { planDate: MON, stream: "goals", done: true },
      { planDate: MON, stream: "goals", done: false },
      { planDate: MON, stream: "wms", done: false },
    ];
    const card = scoreDay(rows, MON);
    expect(scoreLabel(card.overall)).toBe("1 / 3");
    expect(card.unfinished).toBe(2);
    // The two misses are already priced in by not being in the numerator; the
    // count above is accountability information sitting BESIDE the score.
    expect(pct(card.overall)).toBe(33);
  });

  it("an empty day scores 0%, and is flagged as having no signal at all", () => {
    const card = scoreDay([], MON);
    expect(pct(card.overall)).toBe(0);
    expect(hasSignal(card.overall)).toBe(false);
  });
});

describe("transferring work never changes the score", () => {
  const planned: FakeRow[] = [
    { planDate: MON, stream: "goals", done: true },
    { planDate: MON, stream: "wms", done: false },
  ];
  /** The same two commitments, except the unfinished one was pushed to Tuesday. */
  const transferred: FakeRow[] = [
    { planDate: MON, stream: "goals", done: true },
    { planDate: TUE, movedFromDate: MON, stream: "wms", done: false },
  ];

  it("leaving it unticked and pushing it forward score identically", () => {
    const left = scoreDay(planned, MON);
    const moved = scoreDay(transferred, MON);
    expect(scoreLabel(moved.overall)).toBe(scoreLabel(left.overall));
    expect(pct(moved.overall)).toBe(pct(left.overall));
    expect(pct(moved.overall)).toBe(50);
  });

  it("still splits into the same streams after the move", () => {
    const moved = scoreDay(transferred, MON);
    expect(scoreLabel(moved.goals)).toBe("1 / 1");
    expect(scoreLabel(moved.wms)).toBe("0 / 1");
  });

  it("reports the move as transferred, not as an extra unfinished item", () => {
    const moved = scoreDay(transferred, MON);
    expect(moved.transferred).toBe(1);
    expect(moved.unfinished).toBe(0);
  });

  it("cannot be gamed: pushing EVERYTHING off the day still scores 0 / 2", () => {
    const dumped: FakeRow[] = [
      { planDate: TUE, movedFromDate: MON, stream: "goals", done: false },
      { planDate: TUE, movedFromDate: MON, stream: "wms", done: true },
    ];
    const card = scoreDay(dumped, MON);
    // The second row was ticked on TUESDAY, so it is Tuesday's credit — Monday
    // keeps both as planned-and-not-delivered.
    expect(scoreLabel(card.overall)).toBe("0 / 2");
    expect(card.transferred).toBe(2);
  });

  it("credits the destination day for work that arrives and gets done", () => {
    const card = scoreDay(
      [{ planDate: TUE, movedFromDate: MON, stream: "wms", done: true }],
      TUE,
    );
    expect(scoreLabel(card.overall)).toBe("1 / 1");
    expect(card.transferred).toBe(0);
  });
});

describe("a period is the sum of its days", () => {
  it("adds up, and the drill-down reconciles with the roll-up", () => {
    const rows: FakeRow[] = [
      { planDate: MON, stream: "goals", done: true },
      { planDate: MON, stream: "goals", done: false },
      { planDate: TUE, stream: "wms", done: true },
    ];
    const week = sumScorecards([scoreDay(rows, MON), scoreDay(rows, TUE)]);
    expect(scoreLabel(week.overall)).toBe("2 / 3");
    expect(week.unfinished).toBe(1);
  });
});

/* ------------------------------------------------------------------ */
/* Window resolution                                                    */
/* ------------------------------------------------------------------ */

describe("resolveRange", () => {
  const TODAY = "2026-08-21"; // a Friday

  it("defaults to today", () => {
    const r = resolveRange(TODAY, {});
    expect([r.from, r.to, r.period]).toEqual([TODAY, TODAY, "day"]);
    expect(r.days).toEqual([TODAY]);
  });

  it("takes ?day= for a past day but never a future one", () => {
    expect(resolveRange(TODAY, { day: "2026-08-19" }).from).toBe("2026-08-19");
    expect(resolveRange(TODAY, { day: "2026-12-01" }).from).toBe(TODAY);
  });

  it("runs This Week from Monday to today", () => {
    const r = resolveRange(TODAY, { period: "week" });
    expect([r.from, r.to]).toEqual(["2026-08-17", TODAY]);
    expect(r.days).toHaveLength(5);
  });

  it("runs Month to Date from the 1st to today", () => {
    const r = resolveRange(TODAY, { period: "mtd" });
    expect([r.from, r.to]).toEqual(["2026-08-01", TODAY]);
  });

  it("orders a backwards custom range, and clamps its end to today", () => {
    const r = resolveRange(TODAY, { period: "custom", from: "2026-08-20", to: "2026-08-10" });
    expect([r.from, r.to]).toEqual(["2026-08-10", "2026-08-20"]);
    expect(resolveRange(TODAY, { period: "custom", from: "2026-08-10", to: "2099-01-01" }).to).toBe(
      TODAY,
    );
  });

  it("reads a half-filled custom range as that single day", () => {
    const r = resolveRange(TODAY, { period: "custom", from: "2026-08-11" });
    expect([r.from, r.to]).toEqual(["2026-08-11", "2026-08-11"]);
  });

  it("caps an absurd range at MAX_RANGE_DAYS, keeping the most recent days", () => {
    const r = resolveRange(TODAY, { period: "custom", from: "1900-01-01", to: TODAY });
    expect(r.days).toHaveLength(MAX_RANGE_DAYS);
    expect(r.to).toBe(TODAY);
  });

  it("falls back to Daily on a junk period", () => {
    expect(parsePeriod("../../etc")).toBe("day");
    expect(resolveRange(TODAY, { period: "quarter" }).period).toBe("day");
  });
});

describe("input parsing", () => {
  it("rejects anything that is not a real calendar day", () => {
    expect(parseYmd("2026-08-21")).toBe("2026-08-21");
    expect(parseYmd("2026-02-31")).toBeNull();
    expect(parseYmd("2026-8-1")).toBeNull();
    expect(parseYmd("")).toBeNull();
    expect(parseYmd(undefined)).toBeNull();
  });

  it("keeps a threshold inside 1-100 and defaults anything else to 80", () => {
    expect(parseThreshold("75")).toBe(75);
    expect(parseThreshold(0)).toBe(80);
    expect(parseThreshold(101)).toBe(80);
    expect(parseThreshold("abc")).toBe(80);
  });

  it("finds Monday for every day of the week", () => {
    for (const d of ["2026-08-17", "2026-08-19", "2026-08-23"]) {
      expect(mondayOfYmd(d)).toBe("2026-08-17");
    }
  });
});

describe("day labels", () => {
  it("names the two days after the anchor, then falls back to the date", () => {
    expect(relativeDay("2026-08-22", "2026-08-21")).toBe("Tomorrow");
    expect(relativeDay("2026-08-23", "2026-08-21")).toBe("Day After");
    expect(relativeDay("2026-08-25", "2026-08-21")).toBe("25-Aug");
    expect(shortDay("2026-08-25")).toBe("25-Aug");
  });
});

/* ------------------------------------------------------------------ */
/* Rankings                                                             */
/* ------------------------------------------------------------------ */

function person(name: string, done: number, planned: number): PersonRow {
  const card = emptyScorecard();
  card.overall = { done, planned };
  return {
    id: name,
    name,
    department: null,
    leadId: null,
    leadName: null,
    range: card,
    week: card,
    mtd: card,
  };
}

describe("rankings", () => {
  const people = [
    person("A", 9, 10), // 90
    person("B", 6, 10), // 60
    person("C", 10, 10), // 100
    person("D", 7, 10), // 70
    person("Absent", 0, 0), // planned nothing
  ];

  it("ranks best first and hides anyone who planned nothing", () => {
    expect(topPerformers(people, 5).map((p) => p.name)).toEqual(["C", "A", "D", "B"]);
  });

  it("reads the same list from the other end for the bottom board", () => {
    expect(bottomPerformers(people, 5).map((p) => p.name)).toEqual(["B", "D", "A", "C"]);
  });

  it("never ranks 'planned nothing' as 0% — the absentee is in neither board", () => {
    expect(topPerformers(people, 5).some((p) => p.name === "Absent")).toBe(false);
    expect(bottomPerformers(people, 5).some((p) => p.name === "Absent")).toBe(false);
  });

  it("lists only those under the cut-off, worst first", () => {
    expect(belowThreshold(people, 80).map((p) => p.name)).toEqual(["B", "D"]);
    expect(belowThreshold(people, 100).map((p) => p.name)).toEqual(["B", "D", "A"]);
    expect(belowThreshold(people, 60)).toEqual([]);
  });
});
