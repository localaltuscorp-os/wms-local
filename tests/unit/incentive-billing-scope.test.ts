import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

vi.mock("server-only", () => ({}));

const sheet = vi.hoisted(() => ({ matrix: [] as unknown[][] }));
vi.mock("@/lib/google/read-sheet", () => ({
  readSheetValues: async () => sheet.matrix,
}));

import { getBillingDashboard } from "@/lib/queries/billing";
import { nameKey } from "@/lib/incentive/payout-sources";

/**
 * BILLING SCOPE — the Team / User narrowing of the live billing sheet.
 *
 * The Billing area reads a Google Sheet whose only identity column is the
 * salesperson's NAME, so the scope arrives as a set of normalised name keys and
 * has to be applied BEFORE aggregation. If it were applied after, the four KPI
 * cards would report company money under a "User" label — which is the failure
 * these tests exist to catch.
 *
 * Sheet columns are fixed-index (see lib/billing/sheet.ts): 2 = PSO date,
 * 7 = client, 32 = salesperson, 34 = billed, 36 = paid.
 */

const COL_COUNT = 40;

function row(opts: { date: string; client: string; salesperson: string; billed: string; paid: string }) {
  const r: string[] = new Array(COL_COUNT).fill("");
  r[2] = opts.date;
  r[7] = opts.client;
  r[32] = opts.salesperson;
  r[34] = opts.billed;
  r[36] = opts.paid;
  return r;
}

const ROWS = [
  row({ date: "18-Apr-2026", client: "Acme", salesperson: "Om Jadhav", billed: "100000", paid: "40000" }),
  row({ date: "20-May-2026", client: "Beta", salesperson: "Om Jadhav", billed: "50000", paid: "50000" }),
  row({ date: "02-Jun-2026", client: "Gamma", salesperson: "Rohan Choudhary", billed: "80000", paid: "0" }),
  row({ date: "03-Jun-2025", client: "Last year", salesperson: "Om Jadhav", billed: "999999", paid: "0" }),
];

beforeEach(() => {
  sheet.matrix = ROWS;
});

describe("getBillingDashboard — year filter (unchanged behaviour)", () => {
  it("keeps only the requested year and drops the rest", async () => {
    const res = await getBillingDashboard(2026);
    expect(res.totals.deals).toBe(3);
    expect(res.totals.billed).toBe(230000);
  });

  it("with no scope argument, reports everyone (a company-wide viewer)", async () => {
    const res = await getBillingDashboard(2026);
    expect(res.perSalesperson.map((p) => p.name).sort()).toEqual(["Om Jadhav", "Rohan Choudhary"]);
  });
});

describe("getBillingDashboard — Team / User narrowing", () => {
  it("filters to the visible salespeople and recomputes every total", async () => {
    const res = await getBillingDashboard(2026, { visibleNames: new Set([nameKey("Om Jadhav")]) });
    expect(res.perSalesperson.map((p) => p.name)).toEqual(["Om Jadhav"]);
    expect(res.totals.deals).toBe(2);
    expect(res.totals.billed).toBe(150000);
    expect(res.totals.paid).toBe(90000);
    expect(res.totals.outstanding).toBe(60000);
  });

  it("narrows the monthly series too — no company months leak through", async () => {
    const all = await getBillingDashboard(2026);
    const mine = await getBillingDashboard(2026, { visibleNames: new Set([nameKey("Om Jadhav")]) });
    expect(all.monthly.length).toBeGreaterThan(mine.monthly.length);
    expect(mine.monthly.every((m) => m.month === "2026-04" || m.month === "2026-05")).toBe(true);
  });

  it("narrows the deal ledger — the table cannot show a deal the KPI excluded", async () => {
    const res = await getBillingDashboard(2026, { visibleNames: new Set([nameKey("Om Jadhav")]) });
    expect(res.deals).toHaveLength(2);
    expect(res.deals.every((d) => d.salesperson === "Om Jadhav")).toBe(true);
  });

  it("matches on the SAME normalised key the rest of the module uses", async () => {
    // nameKey trims and lower-cases; the sheet side additionally collapses
    // internal runs (mapBillingDeals). Both sides go through it, so a case or
    // padding difference in the roster never costs somebody their own numbers.
    expect(nameKey("  OM JADHAV  ")).toBe(nameKey("Om Jadhav"));
    const res = await getBillingDashboard(2026, { visibleNames: new Set([nameKey("  OM JADHAV  ")]) });
    expect(res.totals.deals).toBe(2);
  });

  it("an EMPTY scope shows nobody — it must never widen to everyone", async () => {
    const res = await getBillingDashboard(2026, { visibleNames: new Set<string>() });
    expect(res.totals.deals).toBe(0);
    expect(res.perSalesperson).toEqual([]);
    expect(res.deals).toEqual([]);
  });

  it("null means NO filter (a company-wide viewer), unlike an empty set", async () => {
    const res = await getBillingDashboard(2026, { visibleNames: null });
    expect(res.totals.deals).toBe(3);
  });

  it("a salesperson with no deals gets an empty board, not a company one", async () => {
    const res = await getBillingDashboard(2026, { visibleNames: new Set([nameKey("Nobody Here")]) });
    expect(res.totals).toEqual({ deals: 0, billed: 0, paid: 0, outstanding: 0 });
  });
});

describe("Billing scope — the switch is wired to the shared resolver", () => {
  const action = readFileSync("app/(app)/incentive/billing-actions.ts", "utf8");
  const page = readFileSync("app/(app)/incentive/page.tsx", "utf8");

  it("reuses the Dashboard/Targets scope resolver — no second hierarchy rule", () => {
    expect(action).toContain("incentiveAnalyticsScopeFor");
    expect(action).toContain("applyAnalyticsView");
    expect(action).not.toMatch(/managerId|manager_id/);
  });

  it("narrows to name keys through the shared helper", () => {
    expect(action).toContain("visibleNameKeysFor");
  });

  it("gates the action on the module permission and a rate limit", () => {
    expect(action).toContain('canViewModule(MODULE)');
    expect(action).toContain("rateLimitOrError");
  });

  it("scopes the SERVER render as well as the reload — a refresh is not a way in", () => {
    expect(page).toMatch(/applyAnalyticsView\(base, "team"\)/);
    expect(page).toMatch(/getBillingDashboard\(year, \{ visibleNames: names \}\)/);
  });

  it("hides the switcher for a viewer with no team rather than showing an empty one", () => {
    const dashboard = readFileSync("components/incentive/billing-dashboard.tsx", "utf8");
    expect(dashboard).toMatch(/\{canSeeTeam && \(/);
  });
});
