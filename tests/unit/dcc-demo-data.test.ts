import { describe, it, expect } from "vitest";
import { buildDccDemo, demoBoardRows, isDemoPerson, DEMO_VIEWER_ID } from "@/lib/dcc/demo-data";
import { DCC_STATUSES } from "@/lib/dcc/util";
import { computeDccDashboard, historyStartFor } from "@/lib/dcc/dashboard";
import { buildSp1Grid, metricsOf, sp1WorkingDays } from "@/lib/dcc/sp1";

/**
 * The sample data behind `/dcc/dashboard?demo=1`.
 *
 * It exists so an empty dashboard can be judged before anyone has filled one,
 * which is only true if it comes out looking like a plausible fortnight. These
 * tests are about that: every section has something in it, the figures sit in
 * believable ranges, and the same URL draws the same page twice.
 */

const TODAY = "2026-09-17";
const DATES = sp1WorkingDays("2026-09-07", 2);

function demo(onlyId: string | null = null) {
  return buildDccDemo({
    sheetDates: DATES,
    historyFrom: historyStartFor(DATES[0]!, TODAY),
    to: TODAY,
    today: TODAY,
    onlyId,
  });
}

describe("it is the same dashboard every time", () => {
  it("draws identical data for identical arguments", () => {
    // Math.random() here would mean a screenshot could never be reproduced and
    // "the heatmap looks wrong" could never be checked twice.
    expect(JSON.stringify(demo())).toEqual(JSON.stringify(demo()));
  });

  it("does not move the rest of the page when one person is filtered out", () => {
    const all = demo();
    const one = demo("demo-01");
    const mineFromAll = all.callRows.filter((r) => r.employeeId === "demo-01");
    expect(one.callRows).toEqual(mineFromAll);
  });
});

describe("every section has something to show", () => {
  const d = demo();
  const result = computeDccDashboard({ ...d, from: DATES[0]!, to: TODAY, today: TODAY });

  it("has nine people across eight functions, none of them 'others'", () => {
    expect(d.people).toHaveLength(9);
    // A department matching none of the eight lands in `others`, which would be
    // a tab full of sample people and no explanation.
    const departments = d.people.flatMap((p) => p.departments);
    expect(new Set(departments).size).toBe(8);
  });

  it("fills the leaderboard, the sections and the most-missed panel", () => {
    expect(result.people.length).toBe(9);
    expect(result.sections.length).toBeGreaterThan(1);
    expect(result.items.length).toBeGreaterThan(5);
    expect(result.totals.due).toBeGreaterThan(100);
  });

  it("spreads compliance out, so the leaderboard has a top and a bottom", () => {
    const scores = result.people.map((p) => p.compliance ?? 0);
    expect(Math.max(...scores) - Math.min(...scores)).toBeGreaterThan(15);
  });

  it("leaves today partly open, which is what the KPI strip is for", () => {
    const todayTally = result.people.reduce((n, p) => n + p.today.unfilled, 0);
    expect(todayTally).toBeGreaterThan(0);
  });
});

describe("the SP1 sheet reads like a real fortnight", () => {
  const d = demo();
  const columns = buildSp1Grid(DATES, d.callRows);

  it("fills every working day up to today and leaves the rest empty", () => {
    for (const c of columns) {
      if (c.kind !== "day" || c.date === null) continue;
      const filled = c.metrics.totalCalls > 0;
      expect(filled).toBe(c.date <= TODAY);
    }
  });

  it("keeps the connected ratio inside a believable band", () => {
    // A flat fifteen-way split would peg this at 73% on every column and the
    // colour bands would carry no information at all.
    const whole = metricsOf(buildSp1Grid(["all"], d.callRows.map((r) => ({ ...r, logDate: "all" })))[0]!.counts);
    expect(whole.connectedRatio).toBeGreaterThan(0.3);
    expect(whole.connectedRatio).toBeLessThan(0.6);
  });

  it("gives each day a different total, so no column is a copy of the last", () => {
    const totals = columns
      .filter((c) => c.kind === "day" && c.date! <= TODAY)
      .map((c) => c.metrics.totalCalls);
    expect(new Set(totals).size).toBe(totals.length);
  });

  it("never invents a Sunday column or a call on one", () => {
    const sundays = d.callRows.filter(
      (r) => new Date(`${r.logDate}T00:00:00Z`).getUTCDay() === 0,
    );
    expect(sundays).toEqual([]);
  });
});

describe("the daily board's sample day", () => {
  const d = demo(DEMO_VIEWER_ID);
  const rows = demoBoardRows(d, DEMO_VIEWER_ID, TODAY);

  it("has compliances due, some of them filled", () => {
    expect(rows.length).toBeGreaterThan(2);
    expect(rows.some((r) => r.status !== null)).toBe(true);
  });

  it("uses the board's own status vocabulary, not a lowercase lookalike", () => {
    /* THE BUG THIS PINS DOWN: the generator wrote "done" / "pending", which
       `outcomeOf` lowercases and so tallied fine on the dashboard — but the
       daily board keys its colours and icons off DccStatus itself, so every
       sample row rendered with no status at all and the screen looked empty. */
    for (const r of rows) {
      if (r.status !== null) expect(DCC_STATUSES).toContain(r.status);
    }
  });

  it("shows a filled target row as a number, not just a tick", () => {
    const withTarget = rows.filter((r) => r.targetNumber !== null && r.status !== null);
    expect(withTarget.length).toBeGreaterThan(0);
    for (const r of withTarget) expect(Number(r.value)).toBeGreaterThan(0);
  });

  it("includes a row from a position master, so the badge is visible", () => {
    expect(rows.some((r) => r.masterDesignation !== null)).toBe(true);
  });
});

describe("an invented id is recognisable as invented", () => {
  it("accepts its own ids and nothing else", () => {
    expect(isDemoPerson("demo-01")).toBe(true);
    expect(isDemoPerson("demo-09")).toBe(true);
    expect(isDemoPerson("demo-10")).toBe(false);
    // A real employee id must never be mistaken for a sample one.
    expect(isDemoPerson("3f2b1c4d-0000-4000-8000-000000000000")).toBe(false);
  });
});
