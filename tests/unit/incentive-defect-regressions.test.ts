import { describe, expect, it } from "vitest";
import { canDeleteIncentiveEntry } from "@/lib/incentive/entry-deletion";
import { actualForTargetPeriod } from "@/lib/incentive/target-actual";
import { codeOf } from "../fixtures/source-code";

const draft = () => ({
  approved: false,
  paid: false,
  approvedAmount: 0,
  paidAmount: 0,
  reversed: false,
  incentiveRequestId: null,
  payoutRunId: null,
});

describe("incentive defect regressions", () => {
  it.each([
    ["approved", { approved: true }],
    ["paid", { paid: true }],
    ["reversed", { reversed: true }],
    ["request-linked", { incentiveRequestId: "request" }],
    ["payout-linked", { payoutRunId: "run" }],
    ["payment-history", {}],
    ["payout-history", {}],
  ])("blocks deletion for %s entries", (_label, changes) => {
    expect(
      canDeleteIncentiveEntry(
        { ...draft(), ...changes },
        _label === "payment-history",
        _label === "payout-history",
      ),
    ).toBe(false);
  });

  it("keeps uncommitted drafts deletable", () => {
    expect(canDeleteIncentiveEntry(draft(), false, false)).toBe(true);
  });

  it("uses actuals from matching target period only", () => {
    const actuals = new Map([
      ["2026-01-01|2026-02-01", new Map([["user:one|product", 100]])],
      ["2026-02-01|2026-03-01", new Map([["user:one|product", 250]])],
      ["2026-01-01|2026-04-01", new Map([["user:one|product", 700]])],
    ]);
    expect(actualForTargetPeriod(actuals, "2026-01-01", "2026-02-01", "user:one", "Product")).toBe(100);
    expect(actualForTargetPeriod(actuals, "2026-02-01", "2026-03-01", "user:one", "Product")).toBe(250);
    expect(actualForTargetPeriod(actuals, "2026-01-01", "2026-04-01", "user:one", "Product")).toBe(700);
  });

  it("filters target status in SQL before pagination", () => {
    const code = codeOf("lib/queries/incentive-target-plans.ts");
    expect(code).toMatch(/f\.status === "Completed"/);
    expect(code).toMatch(/f\.status === "Active"/);
    expect(code).toMatch(/f\.status === "Upcoming"/);
    expect(code).not.toMatch(/f\.status \? materialised\.filter/);
  });

  it("releases failed weekly and monthly delivery claims", () => {
    const weekly = codeOf("app/api/cron/incentive-weekly-report/route.ts");
    const monthly = codeOf("app/api/cron/incentive-digest/route.ts");
    expect(weekly).toMatch(/delete\(incentiveNotificationDeliveries\)/);
    expect(monthly).toMatch(/eventType: "incentive_monthly_digest"/);
    expect(monthly).toMatch(/onConflictDoNothing\(\)/);
    expect(monthly).toMatch(/delete\(incentiveNotificationDeliveries\)/);
  });
});
