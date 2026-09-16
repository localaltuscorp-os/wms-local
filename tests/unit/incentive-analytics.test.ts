import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { IncentiveEntry, IncentiveParticipant, IncentiveProject } from "@/db/schema";
import {
  addMonths,
  formatMonthSpan,
  monthRange,
  resolvePeriod,
  selectableMonths,
} from "@/lib/incentive/analytics/periods";
import {
  INCENTIVE_GRADE_BANDS,
  competitionRanks,
  gradeFor,
  pctOfCtc,
  periodCtc,
  rankMovement,
} from "@/lib/incentive/analytics/grading";
import {
  buildIncentiveAnalytics,
  ledgerLinesFrom,
  ledgerNameKey,
  requestSchemeName,
  targetWarningFor,
  type AnalyticsEmployee,
  type AnalyticsRequest,
  type AnalyticsScope,
  type AnalyticsTarget,
  type BuildInput,
  type LedgerLine,
} from "@/lib/incentive/analytics/model";

/**
 * Incentive Dashboard & Analytics — the calculation layer (periods, % of CTC,
 * grades, ranks, status totals, target vs actual, visibility), plus structural
 * checks that the server entry points use it and enforce access.
 */

const code = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

// 15-Sep-2026 12:00 IST.
const NOW = new Date("2026-09-15T06:30:00Z");

// ── Periods ──────────────────────────────────────────────────────────────────

describe("periods", () => {
  it("current month is the IST month, compared with the month before", () => {
    const p = resolvePeriod({ kind: "current_month" }, NOW)!;
    expect(p.months).toEqual(["2026-09"]);
    expect(p.start).toBe("2026-09-01");
    expect(p.endExclusive).toBe("2026-10-01");
    expect(p.previous?.months).toEqual(["2026-08"]);
    expect(p.label).toBe("Sep 2026");
  });

  it("uses IST, not UTC, to decide the current month", () => {
    // 31-Aug 19:00 UTC is already 1-Sep 00:30 in India.
    expect(resolvePeriod({ kind: "current_month" }, new Date("2026-08-31T19:00:00Z"))!.months).toEqual(["2026-09"]);
    expect(resolvePeriod({ kind: "current_month" }, new Date("2026-08-31T18:00:00Z"))!.months).toEqual(["2026-08"]);
  });

  it("a specific month is exactly that month; future, malformed and ancient months are refused", () => {
    const p = resolvePeriod({ kind: "month", month: "2026-05" }, NOW)!;
    expect(p.months).toEqual(["2026-05"]);
    expect(p.previous?.months).toEqual(["2026-04"]);
    for (const bad of ["2026-10", "2026-13", "2026-5", "abc", "", null, "2019-12"]) {
      expect(resolvePeriod({ kind: "month", month: bad }, NOW), String(bad)).toBeNull();
    }
    expect(resolvePeriod({ kind: "month", month: "2026-09" }, NOW)!.months).toEqual(["2026-09"]);
  });

  it("last 3 and last 6 months include the current month; previous is the window before", () => {
    const l3 = resolvePeriod({ kind: "last_3" }, NOW)!;
    expect(l3.months).toEqual(["2026-07", "2026-08", "2026-09"]);
    expect(l3.previous?.months).toEqual(["2026-04", "2026-05", "2026-06"]);
    expect(l3.endExclusive).toBe("2026-10-01");
    const l6 = resolvePeriod({ kind: "last_6" }, NOW)!;
    expect(l6.months).toEqual(monthRange("2026-04", "2026-09"));
    expect(l6.previous?.months).toEqual(monthRange("2025-10", "2026-03"));
  });

  it("windows cross the year boundary", () => {
    const p = resolvePeriod({ kind: "last_3" }, new Date("2026-02-10T06:30:00Z"))!;
    expect(p.months).toEqual(["2025-12", "2026-01", "2026-02"]);
    expect(p.label).toBe("Dec 2025 – Feb 2026");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2025-12", 1)).toBe("2026-01");
    expect(addMonths("2026-03", -15)).toBe("2024-12");
  });

  it("YTD is the calendar year to date — the Incentive module's own convention", () => {
    const p = resolvePeriod({ kind: "ytd" }, NOW)!;
    expect(p.months).toEqual(monthRange("2026-01", "2026-09"));
    expect(p.start).toBe("2026-01-01");
    expect(p.previous?.months).toEqual(monthRange("2026-01", "2026-08"));
    expect(code("lib/queries/incentives.ts")).toContain("`${year}-01-01`");
  });

  it("YTD in January has no earlier YTD to compare ranks with", () => {
    const p = resolvePeriod({ kind: "ytd" }, new Date("2026-01-10T06:30:00Z"))!;
    expect(p.months).toEqual(["2026-01"]);
    expect(p.previous).toBeNull();
  });

  it("refuses an unknown period kind and offers only past-or-current months", () => {
    expect(resolvePeriod({ kind: "decade" as never }, NOW)).toBeNull();
    const months = selectableMonths(NOW, 3);
    expect(months).toEqual(["2026-09", "2026-08", "2026-07"]);
    expect(formatMonthSpan(["2026-01", "2026-09"])).toBe("Jan – Sep 2026");
  });
});

// ── Grading ──────────────────────────────────────────────────────────────────

describe("% of CTC and grades", () => {
  it.each([
    [25, "A"],
    [20.01, "A"],
    [20, "B"],
    [20.004, "B"],
    [15, "B"],
    [10.01, "B"],
    [10, "C"],
    [5.01, "C"],
    [5, "D"],
    [0.5, "D"],
    [0, "D"],
    [-2, "D"],
  ])("%s%% → %s (lower bound exclusive, upper inclusive)", (pct, grade) => {
    expect(gradeFor(pct)).toBe(grade);
  });

  it("no percentage → no grade; nothing non-finite gets a grade", () => {
    expect(gradeFor(null)).toBeNull();
    expect(gradeFor(Number.NaN)).toBeNull();
    expect(gradeFor(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("% of CTC = earned ÷ CTC × 100, rounded to 2 decimals; null without a usable CTC", () => {
    expect(pctOfCtc(10_000, 50_000)).toBe(20);
    expect(pctOfCtc(10_005, 50_000)).toBe(20.01);
    expect(pctOfCtc(1, 3)).toBe(33.33);
    expect(pctOfCtc(0, 50_000)).toBe(0);
    expect(pctOfCtc(5_000, 0)).toBeNull();
    expect(pctOfCtc(5_000, null)).toBeNull();
    expect(pctOfCtc(5_000, Number.NaN)).toBeNull();
    expect(pctOfCtc(Number.NaN, 50_000)).toBe(0);
  });

  it("the bands live in one table", () => {
    expect(INCENTIVE_GRADE_BANDS.map((b) => b.grade)).toEqual(["A", "B", "C", "D"]);
    // No component re-states a threshold.
    for (const f of ["components/incentive/analytics/incentive-analytics-dashboard.tsx"]) {
      expect(code(f)).not.toMatch(/>\s*20\b|<=\s*20\b|10\.01|5\.01/);
    }
  });

  it("period CTC is monthly CTC × months employed in the period", () => {
    const months = ["2026-07", "2026-08", "2026-09"];
    expect(periodCtc(50_000, months, null)).toEqual({ ctc: 150_000, months: 3 });
    expect(periodCtc(50_000, months, "2024-01")).toEqual({ ctc: 150_000, months: 3 });
    expect(periodCtc(50_000, months, "2026-08")).toEqual({ ctc: 100_000, months: 2 });
    expect(periodCtc(50_000, months, "2026-10")).toBeNull();
    expect(periodCtc(0, months, null)).toBeNull();
    expect(periodCtc(null, months, null)).toBeNull();
  });
});

describe("ranking", () => {
  it("standard competition ranking: ties share a rank and the next rank skips", () => {
    const ranks = competitionRanks([
      { key: "a", score: 30, earned: 100, name: "A" },
      { key: "b", score: 20, earned: 900, name: "B" },
      { key: "c", score: 20, earned: 100, name: "C" },
      { key: "d", score: 10, earned: 100, name: "D" },
      { key: "e", score: null, earned: 5000, name: "E" },
    ]);
    expect(Object.fromEntries(ranks)).toEqual({ a: 1, b: 2, c: 2, d: 4 });
    expect(ranks.has("e")).toBe(false);
  });

  it("scores equal after rounding to 2 decimals are a tie", () => {
    const ranks = competitionRanks([
      { key: "a", score: 12.341, earned: 1, name: "A" },
      { key: "b", score: 12.339, earned: 2, name: "B" },
    ]);
    expect(ranks.get("a")).toBe(1);
    expect(ranks.get("b")).toBe(1);
  });

  it("rank movement", () => {
    expect(rankMovement(1, 4, true)).toEqual({ kind: "up", by: 3 });
    expect(rankMovement(4, 1, true)).toEqual({ kind: "down", by: 3 });
    expect(rankMovement(2, 2, true)).toEqual({ kind: "same" });
    expect(rankMovement(3, null, true)).toEqual({ kind: "new" });
    expect(rankMovement(1, 2, false)).toEqual({ kind: "na" });
    expect(rankMovement(null, 2, true)).toEqual({ kind: "na" });
  });
});

// ── The model ────────────────────────────────────────────────────────────────

const E = {
  asha: { id: "e-asha", name: "Asha Rao", code: "A-101", monthlyCtc: 50_000, joinedMonth: "2024-01" },
  ravi: { id: "e-ravi", name: "Ravi Kulkarni", code: "A-102", monthlyCtc: 40_000, joinedMonth: null },
  meera: { id: "e-meera", name: "Meera Shah", code: "U-101", monthlyCtc: 100_000, joinedMonth: null },
  noCtc: { id: "e-noctc", name: "No Ctc Person", code: null, monthlyCtc: null, joinedMonth: null },
  zero: { id: "e-zero", name: "Zero Earner", code: null, monthlyCtc: 30_000, joinedMonth: null },
} satisfies Record<string, AnalyticsEmployee>;
const EMPLOYEES = Object.values(E);

const line = (
  empName: string,
  month: string,
  approved: number,
  paid: number,
  key = `${empName}-${month}`,
  employeeId: string | null = null,
): LedgerLine => ({
  key,
  source: "entry",
  employeeId,
  empName,
  label: "BSS Convert 1st",
  month,
  approved,
  paid,
});

const LEDGER: LedgerLine[] = [
  line("Asha Rao", "2026-09", 12_000, 12_000), // 24% → A
  line("Ravi Kulkarni", "2026-09", 4_000, 1_000), // 10% → C, partly paid
  line("meera shah ", "2026-09", 20_000, 0), // 20% → B (name matched loosely)
  line("Left Person", "2026-09", 9_000, 0), // inactive → dropped
  line("Alias Name", "2026-09", 500, 500), // matches nobody → company-wide only
  line("No Ctc Person", "2026-09", 1_000, 0),
  line("Ravi Kulkarni", "2026-08", 8_000, 8_000), // Aug: 20% → #1
  line("Asha Rao", "2026-08", 5_000, 5_000), // Aug: 10% → #2
  line("Meera Shah", "2026-08", 5_000, 0), // Aug: 5% → #3
];

const req = (id: string, over: Partial<AnalyticsRequest>): AnalyticsRequest => ({
  id,
  employeeId: E.asha.id,
  type: "sales_pitch",
  status: "approved",
  details: { incentive_date: "2026-09-05" },
  split: null,
  createdYmd: "2026-09-05",
  decidedByName: "Manan Vasa",
  decidedAt: "2026-09-06T10:00:00.000Z",
  decisionNote: null,
  ...over,
});

const REQUESTS: AnalyticsRequest[] = [
  req("r1", {}), // Consulting Pitch 250, approved
  req("r2", { employeeId: E.ravi.id, type: "bss_conversion", status: "due", details: { incentive_date: "2026-09-08", conversion: "1st Attempt", product: "BSS" } }),
  req("r3", { employeeId: E.meera.id, type: "client_happiness", status: "not_due", details: { incentive_date: "2026-09-09", happiness_type: "Google Review" } }),
  req("r4", { type: "group_intro", status: "rejected", details: { incentive_date: "2026-09-11", event_type: "BNI Intro" }, decisionNote: "Duplicate" }),
  req("r5", { status: "pending" }),
  req("r6", { details: { incentive_date: "2026-08-20" } }),
  req("r7", {
    type: "bss_conversion",
    details: { incentive_date: "2026-09-10", conversion: "Direct" },
    split: [
      { employeeId: E.asha.id, name: "Asha Rao", pct: 60 },
      { employeeId: E.meera.id, name: "Meera Shah", pct: 40 },
    ],
  }),
  req("r8", { employeeId: "e-left" }),
  req("r9", { details: {}, createdYmd: "2026-09-02" }),
];

const CATALOG = [
  { name: "Consulting Pitch", amount: 250, active: true },
  { name: "BSS Convert 1st", amount: 1000, active: true },
  { name: "BSS Convert Direct", amount: 2000, active: true },
  { name: "BNI Intro", amount: 250, active: true },
  { name: "Key Note", amount: 500, active: false },
];

const TARGETS: AnalyticsTarget[] = [
  { empName: "Asha Rao", employeeId: null, periodMonth: "2026-09-01", amount: 10_000 },
  { empName: "Ravi K.", employeeId: E.ravi.id, periodMonth: "2026-09-01", amount: 5_000 },
  { empName: "Asha Rao", employeeId: E.asha.id, periodMonth: "2026-10-01", amount: 8_000 },
];

const ALL: AnalyticsScope = { all: true, employeeIds: new Set(), viewerId: "admin", label: "Everyone" };
const TEAM_ASHA: AnalyticsScope = { all: false, employeeIds: new Set([E.asha.id, E.ravi.id]), viewerId: E.asha.id, label: "You and your team" };
const SELF_MEERA: AnalyticsScope = { all: false, employeeIds: new Set([E.meera.id]), viewerId: E.meera.id, label: "You" };
const SELF_ZERO: AnalyticsScope = { all: false, employeeIds: new Set([E.zero.id]), viewerId: E.zero.id, label: "You" };

function build(over: Partial<BuildInput> = {}) {
  const scope = over.scope ?? ALL;
  const viewer =
    over.viewer ?? (scope.all ? { id: "admin", name: "Admin" } : { id: scope.viewerId, name: EMPLOYEES.find((e) => e.id === scope.viewerId)!.name });
  return buildIncentiveAnalytics({
    period: resolvePeriod({ kind: "current_month" }, NOW)!,
    currentMonth: "2026-09",
    employees: EMPLOYEES,
    inactiveNameKeys: new Set(["left person"]),
    excludedEmployeeIds: new Set(["e-left"]),
    ledger: LEDGER,
    requests: REQUESTS,
    catalog: CATALOG,
    targets: TARGETS,
    scope,
    viewer,
    ...over,
  });
}

const card = (a: ReturnType<typeof build>, key: string) => a.statuses.find((s) => s.key === key)!;
const row = (a: ReturnType<typeof build>, id: string) => a.employees.find((e) => e.employeeId === id);
const recordsFor = (a: ReturnType<typeof build>, key: string) => a.records.filter((r) => r.statuses.includes(key as never));

describe("status summary — company-wide", () => {
  const a = build();

  it("counts and values every status", () => {
    expect(a.statuses.map((s) => s.key)).toEqual(["not_approved", "approved", "due", "not_due", "paid", "unpaid"]);
    expect(card(a, "approved")).toMatchObject({ count: 3, amount: 2_500, unvaluedCount: 0 }); // r1 250 + r7 2000 + r9 250
    expect(card(a, "not_approved")).toMatchObject({ count: 1, amount: 250 });
    expect(card(a, "due")).toMatchObject({ count: 1, amount: 1_000 });
    expect(card(a, "not_due")).toMatchObject({ count: 1, amount: 0, unvaluedCount: 1 });
    expect(card(a, "paid")).toMatchObject({ count: 3, amount: 13_500 }); // 12000 + 1000 + alias 500
    expect(card(a, "unpaid")).toMatchObject({ count: 3, amount: 24_000 }); // 3000 + 20000 + 1000
  });

  it("each card's records are exactly the rows it counted", () => {
    for (const s of a.statuses) {
      const recs = recordsFor(a, s.key);
      expect(recs.length, s.key).toBe(s.count);
    }
    expect(recordsFor(a, "approved").map((r) => r.id).sort()).toEqual(["request:r1", "request:r7", "request:r9"]);
    expect(recordsFor(a, "due")[0]).toMatchObject({ typeLabel: "Conversion", product: "BSS", amount: 1_000, reviewerName: "Manan Vasa" });
    expect(recordsFor(a, "not_approved")[0]).toMatchObject({ approvalLabel: "Not Approved", reviewNote: "Duplicate" });
  });

  it("a partly paid ledger line sits under both Paid and Unpaid", () => {
    const ravi = a.records.find((r) => r.employeeLabel === "Ravi Kulkarni" && r.source === "ledger")!;
    expect(ravi.statuses).toEqual(["paid", "unpaid"]);
    expect(ravi).toMatchObject({ paidAmount: 1_000, unpaidAmount: 3_000, paymentLabel: "Partly paid" });
  });

  it("pending requests, requests outside the period and requests of people who left are excluded", () => {
    const ids = a.records.map((r) => r.id);
    expect(ids).not.toContain("request:r5");
    expect(ids).not.toContain("request:r6");
    expect(ids).not.toContain("request:r8");
  });

  it("a request without an Incentive Date falls back to the day it was filed", () => {
    expect(a.records.find((r) => r.id === "request:r9")?.incentiveDate).toBe("2026-09-02");
  });

  it("an unpriced scheme is 'amount not set', never ₹0 of a guess", () => {
    expect(a.records.find((r) => r.id === "request:r3")?.amount).toBeNull();
    expect(requestSchemeName("client_happiness", { happiness_type: "Case Study" })).toBeNull();
    expect(requestSchemeName("leads_referrals", {})).toBeNull();
    expect(requestSchemeName("group_intro", { event_type: "Paid Event" })).toBeNull();
    expect(requestSchemeName("bss_conversion", { conversion: "2nd Attempt" })).toBe("BSS Convert 2nd");
  });

  it("an inactive Incentive Master scheme does not value a request", () => {
    const b = build({ requests: [req("k", { type: "group_intro", details: { incentive_date: "2026-09-03", event_type: "Key Note" } })] });
    expect(card(b, "approved")).toMatchObject({ count: 1, amount: 0, unvaluedCount: 1 });
  });

  it("no NaN, Infinity or undefined reaches the output", () => {
    const json = JSON.stringify(a);
    expect(json).not.toMatch(/NaN|Infinity|undefined/);
  });
});

describe("employee grade report", () => {
  const a = build();

  it("% of CTC, grade and target vs actual per person", () => {
    expect(row(a, E.asha.id)).toMatchObject({ earned: 12_000, ctc: 50_000, pctOfCtc: 24, grade: "A", target: 10_000, difference: 2_000 });
    expect(row(a, E.ravi.id)).toMatchObject({ earned: 4_000, pctOfCtc: 10, grade: "C", target: 5_000, difference: -1_000 });
    expect(row(a, E.meera.id)).toMatchObject({ earned: 20_000, pctOfCtc: 20, grade: "B", target: null, difference: null });
  });

  it("zero incentive with a CTC is 0% and grade D", () => {
    expect(row(a, E.zero.id)).toMatchObject({ earned: 0, pctOfCtc: 0, grade: "D", rank: null, movement: { kind: "na" } });
  });

  it("missing CTC: no %, no grade, no rank — and never a divide-by-zero", () => {
    expect(row(a, E.noCtc.id)).toMatchObject({ earned: 1_000, ctc: null, ctcState: "missing", pctOfCtc: null, grade: null, rank: null });
  });

  it("people who left never appear, even with incentives in the period", () => {
    expect(a.employees.map((e) => e.name)).not.toContain("Left Person");
    expect(a.records.some((r) => r.employeeLabel === "Left Person")).toBe(false);
  });

  it("ranks by % of CTC company-wide, with movement against last month", () => {
    // Only people who earned are ranked; the unranked follow by amount earned.
    expect(a.employees.map((e) => [e.name, e.rank])).toEqual([
      ["Asha Rao", 1],
      ["Meera Shah", 2],
      ["Ravi Kulkarni", 3],
      ["No Ctc Person", null],
      ["Zero Earner", null],
    ]);
    expect(row(a, E.asha.id)).toMatchObject({ previousRank: 2, movement: { kind: "up", by: 1 } });
    expect(row(a, E.meera.id)).toMatchObject({ previousRank: 3, movement: { kind: "up", by: 1 } });
    expect(row(a, E.ravi.id)).toMatchObject({ previousRank: 1, movement: { kind: "down", by: 2 } });
    expect(row(a, E.zero.id)?.movement).toEqual({ kind: "na" });
    expect(a.rankedCount).toBe(3);
    expect(a.previousRanksAvailable).toBe(true);
  });

  it("ties share a rank", () => {
    const b = build({ ledger: [line("Asha Rao", "2026-09", 10_000, 0), line("Ravi Kulkarni", "2026-09", 8_000, 0)] });
    // Asha 20%, Ravi 20% → both #1. Nobody else earned, so nobody else is ranked.
    expect(row(b, E.asha.id)?.rank).toBe(1);
    expect(row(b, E.ravi.id)?.rank).toBe(1);
    expect(row(b, E.meera.id)?.rank).toBeNull();
    expect(row(b, E.zero.id)?.rank).toBeNull();
    expect(b.rankedCount).toBe(2);
  });

  it("no previous earnings → rank movement is not applicable, not invented", () => {
    const b = build({ ledger: LEDGER.filter((l) => l.month === "2026-09") });
    expect(b.previousRanksAvailable).toBe(false);
    expect(b.employees.every((e) => e.movement.kind === "na" && e.previousRank === null)).toBe(true);
  });

  it("a month nobody has earned in ranks nobody — not the whole company as #1", () => {
    const b = build({ period: resolvePeriod({ kind: "month", month: "2026-03" }, NOW)! });
    expect(b.rankedCount).toBe(0);
    expect(b.employees.every((e) => e.rank === null)).toBe(true);
  });

  it("a period with no data yields zero cards and zero earnings, not errors", () => {
    const b = build({ period: resolvePeriod({ kind: "month", month: "2026-03" }, NOW)! });
    expect(b.statuses.every((s) => s.count === 0 && s.amount === 0)).toBe(true);
    expect(b.records).toEqual([]);
    expect(b.employees.every((e) => e.earned === 0)).toBe(true);
    expect(b.summary.target).toBeNull();
    expect(JSON.stringify(b)).not.toMatch(/NaN|Infinity/);
  });

  it("a multi-month period divides by that many months of CTC", () => {
    const b = build({ period: resolvePeriod({ kind: "last_3" }, NOW)! });
    // Asha: 12000 (Sep) + 5000 (Aug) over 3 × 50000.
    expect(row(b, E.asha.id)).toMatchObject({ earned: 17_000, ctc: 150_000, pctOfCtc: 11.33, grade: "B" });
  });

  it("no employees → an empty report", () => {
    const b = build({ employees: [] });
    expect(b.employees).toEqual([]);
    expect(b.summary.people).toBe(0);
    expect(b.me).toBeNull();
    expect(b.targetWarning).toBeNull();
  });

  it("summarises the grades on show", () => {
    expect(a.summary.grades).toEqual({ A: 1, B: 1, C: 1, D: 1, none: 1 });
    expect(a.summary.target).toBe(15_000);
  });
});

describe("who a ledger line belongs to", () => {
  it("strips the sheet's bracketed annotation, and only a trailing one", () => {
    expect(ledgerNameKey("Mishtie Kanani ( Intern - Rohan C )")).toBe("mishtie kanani");
    expect(ledgerNameKey("  Asha Rao (Sales)  ")).toBe("asha rao");
    expect(ledgerNameKey("Rohan (Sales) Choudhary")).toBe("rohan (sales) choudhary");
    expect(ledgerNameKey(null)).toBe("");
  });

  it("an annotated name linked by employee_id is credited to that employee", () => {
    const a = build({ ledger: [...LEDGER, line("Asha Rao ( Intern - Ravi K )", "2026-09", 3_000, 0, "ann", E.asha.id)] });
    expect(row(a, E.asha.id)).toMatchObject({ earned: 15_000, pctOfCtc: 30, grade: "A" });
    expect(a.records.some((r) => r.employeeLabel.includes("Intern"))).toBe(false);
  });

  it("an annotated name without a link is matched on its leading name", () => {
    const a = build({ ledger: [...LEDGER, line("Ravi Kulkarni ( Intern - X )", "2026-09", 1_000, 0, "ann2")] });
    expect(row(a, E.ravi.id)?.earned).toBe(5_000);
  });

  it("a link to someone who must not be counted drops the line, even if the name matches a current employee", () => {
    const a = build({ ledger: [...LEDGER, line("Asha Rao", "2026-09", 5_000, 0, "bad-link", "e-left")] });
    expect(row(a, E.asha.id)?.earned).toBe(12_000);
    expect(a.records.some((r) => r.id === "ledger:bad-link")).toBe(false);
  });

  it("an annotated name of someone who left is dropped", () => {
    const a = build({ ledger: [...LEDGER, line("Left Person ( Intern - Y )", "2026-09", 7_000, 0, "left-ann")] });
    expect(a.records.some((r) => r.id === "ledger:left-ann")).toBe(false);
  });

  it("a target entered under an annotated name counts for the person", () => {
    const a = build({ targets: [{ empName: "Meera Shah ( Intern - Z )", employeeId: null, periodMonth: "2026-09-01", amount: 25_000 }] });
    expect(row(a, E.meera.id)).toMatchObject({ target: 25_000, difference: -5_000 });
  });
});

describe("visibility", () => {
  it("a team lead sees themselves and their reports — nobody else", () => {
    const a = build({ scope: TEAM_ASHA });
    expect(a.employees.map((e) => e.employeeId).sort()).toEqual([E.asha.id, E.ravi.id].sort());
    expect(a.records.every((r) => /Asha Rao|Ravi Kulkarni/.test(r.employeeLabel))).toBe(true);
    expect(a.records.some((r) => r.employeeLabel.includes("Meera") || r.employeeLabel === "Alias Name")).toBe(false);
    expect(card(a, "paid")).toMatchObject({ count: 2, amount: 13_000 });
    expect(card(a, "unpaid")).toMatchObject({ count: 1, amount: 3_000 });
    expect(card(a, "not_due").count).toBe(0);
  });

  it("a split request counts only the in-scope share", () => {
    const a = build({ scope: TEAM_ASHA });
    expect(a.records.find((r) => r.id === "request:r7")).toMatchObject({ amount: 1_200, employeeLabel: "Asha Rao 60%" });
    expect(card(a, "approved")).toMatchObject({ count: 3, amount: 1_700 });
    const m = build({ scope: SELF_MEERA });
    expect(m.records.find((r) => r.id === "request:r7")).toMatchObject({ amount: 800, employeeLabel: "Meera Shah 40%" });
  });

  it("CTC is shown only to company-wide viewers and to the person themselves", () => {
    const a = build({ scope: TEAM_ASHA });
    expect(row(a, E.asha.id)).toMatchObject({ ctc: 50_000, ctcState: "ok", isSelf: true });
    expect(row(a, E.ravi.id)).toMatchObject({ ctc: null, ctcState: "restricted", pctOfCtc: 10, grade: "C" });
    expect(row(build(), E.ravi.id)).toMatchObject({ ctc: 40_000, ctcState: "ok" });
  });

  it("an employee with no reports sees only their own data", () => {
    const z = build({ scope: SELF_ZERO });
    expect(z.employees.map((e) => e.employeeId)).toEqual([E.zero.id]);
    expect(z.records).toEqual([]);
    expect(z.statuses.every((s) => s.count === 0)).toBe(true);
    // Nothing earned → not ranked, rather than "#1 of 1".
    expect(z.me).toMatchObject({ rank: null, grade: "D" });
  });

  it("aliases in the ledger are company-wide only", () => {
    expect(build().records.some((r) => r.employeeLabel === "Alias Name")).toBe(true);
    expect(build({ scope: TEAM_ASHA }).records.some((r) => r.employeeLabel === "Alias Name")).toBe(false);
  });
});

describe("target warning", () => {
  it("both targets present → no warning", () => {
    expect(build({ scope: TEAM_ASHA }).targetWarning).toMatchObject({ missingCurrent: false, missingNext: false });
  });

  it("missing current month", () => {
    const w = targetWarningFor({ id: E.asha.id, name: "Asha Rao" }, TARGETS.filter((t) => t.periodMonth !== "2026-09-01"), "2026-09");
    expect(w).toEqual({ currentMonth: "2026-09", nextMonth: "2026-10", missingCurrent: true, missingNext: false });
  });

  it("missing next month", () => {
    const w = targetWarningFor({ id: E.ravi.id, name: "Ravi Kulkarni" }, TARGETS, "2026-09");
    expect(w).toMatchObject({ missingCurrent: false, missingNext: true });
  });

  it("a ₹0 row is not a target; matching is by id or name", () => {
    const w = targetWarningFor(
      { id: "x", name: "Zero Earner" },
      [
        { empName: "zero earner", employeeId: null, periodMonth: "2026-09-01", amount: 1 },
        { empName: "Someone", employeeId: "x", periodMonth: "2026-10-01", amount: 0 },
      ],
      "2026-09",
    );
    expect(w).toMatchObject({ missingCurrent: false, missingNext: true });
  });

  it("year boundary: December's next month is January", () => {
    expect(targetWarningFor({ id: "x", name: "X" }, [], "2026-12").nextMonth).toBe("2027-01");
  });

  it("company-wide viewers who are not eligible employees get no warning", () => {
    expect(build().targetWarning).toBeNull();
  });
});

describe("ledger folding reuses the payout rule", () => {
  it("team-split participants replace their parent's own amount", () => {
    const entry = {
      id: "en1", incentiveName: "BSS Convert Direct", empName: "Asha Rao", employeeId: null, periodMonth: "2026-09-01",
      approvedAmt: "2000", bookedAmt: "0", accruedAmt: "2000", paidAmt: "0",
    } as unknown as IncentiveEntry;
    const project = {
      id: "pr1", projectName: "Audit", supervisorName: "Ravi Kulkarni", supervisorId: null, internName: "none", internId: null,
      periodMonth: "2026-09-01", empApprovedAmt: "3000", empBookedAmt: "0", empAccruedAmt: "0", empPaidAmt: "3000",
      internApprovedAmt: "0", internBookedAmt: "0", internAccruedAmt: "0", internPaidAmt: "0",
    } as unknown as IncentiveProject;
    const parts = [
      { id: "p1", entryId: "en1", projectId: null, empName: "Asha Rao", employeeId: null, periodMonth: null, bookedAmt: "0", accruedAmt: "1200", paidAmt: "0" },
      { id: "p2", entryId: "en1", projectId: null, empName: "Meera Shah", employeeId: null, periodMonth: null, bookedAmt: "0", accruedAmt: "800", paidAmt: "0" },
    ] as unknown as IncentiveParticipant[];
    const lines = ledgerLinesFrom([entry], [project], parts);
    expect(lines.map((l) => [l.empName, l.approved, l.month, l.label])).toEqual([
      ["Asha Rao", 1200, "2026-09", "BSS Convert Direct · Split"],
      ["Meera Shah", 800, "2026-09", "BSS Convert Direct · Split"],
      ["Ravi Kulkarni", 3000, "2026-09", "Audit · Supervisor"],
    ]);
  });
});

describe("large dataset", () => {
  it("600 employees, 60,000 ledger lines and 6,000 requests build in well under a second", () => {
    const employees: AnalyticsEmployee[] = Array.from({ length: 600 }, (_, i) => ({
      id: `e${i}`, name: `Person ${i}`, code: `A-${100 + i}`, monthlyCtc: 30_000 + (i % 50) * 1_000, joinedMonth: null,
    }));
    const months = monthRange("2025-10", "2026-09");
    const ledger: LedgerLine[] = Array.from({ length: 60_000 }, (_, i) => ({
      key: `l${i}`, source: "entry", empName: `Person ${i % 600}`, label: "X", month: months[i % months.length]!,
      approved: (i % 13) * 250, paid: (i % 3) * 250,
    }));
    const requests: AnalyticsRequest[] = Array.from({ length: 6_000 }, (_, i) =>
      req(`q${i}`, {
        employeeId: `e${i % 600}`,
        status: ["approved", "rejected", "due", "not_due"][i % 4]!,
        details: { incentive_date: `2026-0${4 + (i % 6)}-10` },
      }),
    );
    const t0 = performance.now();
    const a = buildIncentiveAnalytics({
      period: resolvePeriod({ kind: "last_6" }, NOW)!,
      currentMonth: "2026-09",
      employees,
      inactiveNameKeys: new Set(),
      excludedEmployeeIds: new Set(),
      ledger,
      requests,
      catalog: CATALOG,
      targets: [],
      scope: ALL,
      viewer: { id: "admin", name: "Admin" },
    });
    const ms = performance.now() - t0;
    expect(a.employees).toHaveLength(600);
    expect(a.statuses.reduce((s, c) => s + (["approved", "not_approved", "due", "not_due"].includes(c.key) ? c.count : 0), 0)).toBe(6_000);
    expect(ms).toBeLessThan(1_500);
  });
});

// ── Server enforcement (structure) ───────────────────────────────────────────

describe("server-side access", () => {
  const actions = code("app/(app)/incentive/analytics-actions.ts");
  const loader = code("lib/queries/incentive-analytics.ts");
  const page = code("app/(app)/incentive/page.tsx");

  it("every analytics call re-resolves the signed-in user, the module permission and the scope", () => {
    expect(actions).toMatch(/export async function fetchIncentiveAnalytics[\s\S]*?requireUser\(\)[\s\S]*?canViewModule\(/);
    expect(loader).toMatch(/incentiveAnalyticsScopeFor\(viewer\)/);
    // The browser sends a period, never an employee id or a scope: the input
    // schema is strict and holds only kind + month.
    const schema = actions.match(/const PeriodInput = z[\s\S]*?\.strict\(\);/)?.[0] ?? "";
    expect(schema).toMatch(/kind: z\.enum\(PERIOD_KINDS\)/);
    expect(schema).not.toMatch(/employee|scope|viewer|name/i);
    const fetchSig = actions.match(/export async function fetchIncentiveAnalytics\(input: \{[\s\S]*?\}\)/)?.[0] ?? "";
    expect(fetchSig).not.toMatch(/employee|scope/i);
    expect(actions).toMatch(/loadIncentiveAnalytics\(me, parsed\.data\)/);
  });

  it("an employee can only fill their own missing target, for this month or next", () => {
    expect(actions).toMatch(/export async function setMyIncentiveTarget[\s\S]*?requireUser\(\)/);
    expect(actions).toMatch(/month !== current && month !== next/);
    expect(actions).toMatch(/employeeId: me\.id/);
    expect(actions).toMatch(/already set/);
  });

  it("company-wide incentive data is only loaded for company-wide viewers", () => {
    expect(page).toMatch(/scope\.all\s*\?\s*r\("incentive:dashboard"/);
    expect(page).toMatch(/restrictTargetVsActual\(/);
  });
});
