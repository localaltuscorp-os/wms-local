import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { codeOf } from "../fixtures/source-code";
import {
  WEEKLY_REPORT_PERIOD_KEYS,
  WEEKLY_REPORT_PERIOD_LABELS,
  assembleWeeklyReportCards,
  rankMovementLabel,
  weeklyReportSelections,
  weeklyReportVersionKey,
  type WeeklyReportCard,
} from "@/lib/incentive/analytics/weekly-report";
import { resolvePeriod } from "@/lib/incentive/analytics/periods";
import {
  rankMovement,
  type RankMovement,
} from "@/lib/incentive/analytics/grading";
import type { EmployeePerformance } from "@/lib/incentive/analytics/model";

/**
 * INCENTIVE WEEKLY REPORT CARD — the Sunday cron's numbers and shape.
 *
 * Two kinds of assertion, as elsewhere in this suite:
 *   1. the pure window/version-key/assembly helpers answer correctly, and
 *   2. the route + computation modules actually route grade/rank through the
 *      shared analytics layer — no hardcoded thresholds, no ad-hoc ranking.
 */

function perf(over: Partial<EmployeePerformance> & { employeeId: string }): EmployeePerformance {
  return {
    name: "Emp",
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
    ...over,
  };
}

/* ════════════════════════════════════════════════════════════════════════════
   §1 · THE PURE WINDOW / VERSION-KEY HELPERS
   ════════════════════════════════════════════════════════════════════════════ */

describe("weeklyReportSelections", () => {
  it("offers exactly the five report windows in canonical order", () => {
    const now = new Date("2026-09-16T06:30:00Z"); // 12:00 IST, Sep 2026
    const sel = weeklyReportSelections(now);
    expect(sel.map((s) => s.key)).toEqual([...WEEKLY_REPORT_PERIOD_KEYS]);
    expect(sel.map((s) => s.label)).toEqual([
      "Current Month",
      "Last Month",
      "Last 3 Months",
      "Last 6 Months",
      "YTD",
    ]);
    expect(WEEKLY_REPORT_PERIOD_LABELS.ytd).toBe("YTD");
  });

  it("resolves each window to the expected months (IST current month)", () => {
    const now = new Date("2026-09-16T06:30:00Z");
    const windows = weeklyReportSelections(now).map((s) => ({
      key: s.key,
      months: resolvePeriod(s.selection, now)!.months,
    }));
    const byKey = Object.fromEntries(windows.map((w) => [w.key, w.months]));

    expect(byKey.current_month).toEqual(["2026-09"]);
    expect(byKey.last_month).toEqual(["2026-08"]);
    expect(byKey.last_3).toEqual(["2026-07", "2026-08", "2026-09"]);
    expect(byKey.last_6).toEqual([
      "2026-04",
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
    ]);
    expect(byKey.ytd).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
    ]);
  });

  it("reads 'now' in IST — a UTC moment late Saturday is already Sunday in IST", () => {
    const now = new Date("2026-09-12T20:00:00Z"); // 01:30 IST Sunday 2026-09-13
    expect(weeklyReportSelections(now).map((s) => s.key)).toEqual([
      ...WEEKLY_REPORT_PERIOD_KEYS,
    ]);
    // current_month is still Sept (the IST month), not UTC's Sept 12 boundary issue.
    expect(resolvePeriod(weeklyReportSelections(now)[0]!.selection, now)!.months).toEqual([
      "2026-09",
    ]);
  });
});

describe("weeklyReportVersionKey", () => {
  it("is the Sunday run date in IST", () => {
    const sunday = new Date("2026-09-13T06:00:00Z"); // 11:30 IST Sunday
    expect(weeklyReportVersionKey(sunday)).toBe("week:2026-09-13");
  });

  it("uses IST, not UTC — the small hours of Sunday UTC already claim Sunday", () => {
    const saturdayUtc = new Date("2026-09-12T20:00:00Z"); // 01:30 IST Sunday
    expect(weeklyReportVersionKey(saturdayUtc)).toBe("week:2026-09-13");
  });
});

/* ════════════════════════════════════════════════════════════════════════════
   §2 · THE ASSEMBLY (merging per-period performance into one card)
   ════════════════════════════════════════════════════════════════════════════ */

describe("assembleWeeklyReportCards", () => {
  it("gives every card all five period rows in canonical order, ₹0 where unearned", () => {
    const cards = assembleWeeklyReportCards([
      {
        key: "current_month",
        label: "Current Month",
        employees: [
          perf({ employeeId: "e1", name: "Alpha", earned: 12000, rank: 2, previousRank: 5, movement: { kind: "up", by: 3 }, target: 15000, difference: -3000 }),
        ],
      },
      {
        key: "ytd",
        label: "YTD",
        employees: [perf({ employeeId: "e1", name: "Alpha", earned: 40000, grade: "B", pctOfCtc: 12.5 })],
      },
    ]);

    expect(cards).toHaveLength(1);
    const card = cards[0]!;
    expect(card.periods.map((p) => p.key)).toEqual([...WEEKLY_REPORT_PERIOD_KEYS]);
    expect(card.periods.map((p) => p.label)).toEqual([
      "Current Month",
      "Last Month",
      "Last 3 Months",
      "Last 6 Months",
      "YTD",
    ]);
    expect(card.periods.find((p) => p.key === "current_month")!.earned).toBe(12000);
    expect(card.periods.find((p) => p.key === "ytd")!.earned).toBe(40000);
    expect(card.periods.find((p) => p.key === "last_3")!.earned).toBe(0);
    // YTD fields come from the ytd window.
    expect(card.grade).toBe("B");
    expect(card.pctOfCtc).toBe(12.5);
    // Current-month target/actual/rank/movement come from the current_month window.
    expect(card.target).toBe(15000);
    expect(card.actual).toBe(12000);
    expect(card.difference).toBe(-3000);
    expect(card.rank).toBe(2);
    expect(card.previousRank).toBe(5);
    expect(card.movement).toEqual({ kind: "up", by: 3 });
  });

  it("preserves a person with no CTC and no rank (grade/rank null, not invented)", () => {
    const cards = assembleWeeklyReportCards([
      {
        key: "current_month",
        label: "Current Month",
        employees: [perf({ employeeId: "e2", name: "NoCtc", earned: 0, rank: null, previousRank: null, movement: { kind: "na" } })],
      },
      {
        key: "ytd",
        label: "YTD",
        employees: [perf({ employeeId: "e2", name: "NoCtc", earned: 0, grade: null, pctOfCtc: null })],
      },
    ]);
    expect(cards[0]!.grade).toBeNull();
    expect(cards[0]!.pctOfCtc).toBeNull();
    expect(cards[0]!.rank).toBeNull();
    expect(cards[0]!.movement).toEqual({ kind: "na" });
  });
});

describe("rankMovementLabel", () => {
  it("formats every movement kind for the email", () => {
    expect(rankMovementLabel({ kind: "up", by: 2 })).toBe("Up 2");
    expect(rankMovementLabel({ kind: "down", by: 1 })).toBe("Down 1");
    expect(rankMovementLabel({ kind: "same" })).toBe("No change");
    expect(rankMovementLabel({ kind: "new" })).toBe("New");
    expect(rankMovementLabel({ kind: "na" })).toBe("—");
  });

  it("agrees with the shared rankMovement for the pinned semantics", () => {
    const up: RankMovement = rankMovement(1, 3, true);
    expect(rankMovementLabel(up)).toBe("Up 2");
    // Nobody earned last month → previous ranking not meaningful → "na".
    expect(rankMovement(1, null, false)).toEqual({ kind: "na" });
  });
});

/* ════════════════════════════════════════════════════════════════════════════
   §3 · STRUCTURE — the route and the computation stay on the shared layer
   ════════════════════════════════════════════════════════════════════════════ */

const ROUTE = codeOf("app/api/cron/incentive-weekly-report/route.ts");
const QUERY = codeOf("lib/queries/incentive-weekly-report.ts");
const PURE = codeOf("lib/incentive/analytics/weekly-report.ts");

describe("the route file", () => {
  it("requires CRON_SECRET bearer auth with a constant-shape 401", () => {
    expect(ROUTE).toMatch(/CRON_SECRET/);
    expect(ROUTE).toMatch(/Bearer \$\{expected\}/);
    expect(ROUTE).toMatch(/Unauthorized/);
  });

  it("filters recipients to active employees", () => {
    expect(ROUTE).toMatch(/eq\(employees\.isActive, true\)/);
  });

  it("isolates every recipient in its own try/catch", () => {
    expect(ROUTE).toMatch(/for \(const emp of activeEmployees\)/);
    expect(ROUTE).toMatch(/try \{/);
    expect(ROUTE).toMatch(/catch \(err\)/);
  });

  it("claims each delivery idempotently before sending", () => {
    expect(ROUTE).toMatch(/incentive_weekly_report/);
    expect(ROUTE).toMatch(/onConflictDoNothing/);
    expect(ROUTE).toMatch(/weeklyReportVersionKey/);
  });

  it("delegates the numbers to the shared analytics loader", () => {
    expect(ROUTE).toMatch(/loadIncentiveWeeklyReport/);
  });
});

describe("the computation modules", () => {
  it("the query half calls the shared company-wide builder (buildIncentiveAnalytics)", () => {
    expect(QUERY).toMatch(/buildIncentiveAnalytics/);
    expect(QUERY).toMatch(/analytics\/model/);
  });

  it("the pure half imports grade/rank types from grading.ts", () => {
    expect(PURE).toMatch(/from "\.\/grading"/);
    expect(PURE).toMatch(/IncentiveGrade/);
    expect(PURE).toMatch(/RankMovement/);
  });

  it("never hardcodes a grade threshold or ranks on its own", () => {
    // The bands live in INCENTIVE_GRADE_BANDS (grading.ts). The report's own
    // files must not repeat "> 20", "10.01" or "5.01", nor implement a ranking
    // sort of their own (ranking is competitionRanks inside buildIncentiveAnalytics).
    for (const [name, src] of [
      ["route", ROUTE],
      ["query", QUERY],
      ["pure", PURE],
    ] as const) {
      expect(src, name).not.toMatch(/> 20|10\.01|5\.01/);
      expect(src, name).not.toMatch(/\.sort\(\(/);
    }
  });
});

describe("vercel.json", () => {
  it("registers the Sunday 05:30 UTC (11:00 IST) schedule", () => {
    const cfg = JSON.parse(readFileSync("vercel.json", "utf8")) as {
      crons: { path: string; schedule: string }[];
    };
    const entry = cfg.crons.find((c) => c.path === "/api/cron/incentive-weekly-report");
    expect(entry?.schedule).toBe("30 5 * * 0");
  });
});
