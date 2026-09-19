import { describe, expect, it } from "vitest";
import { planEntryReversal } from "@/lib/incentive/reversal";
import { codeOf } from "../fixtures/source-code";

/**
 * WS-6 — incentive entry REVERSAL. Pure `planEntryReversal` covers the money
 * rule (unpaid → no negative, paid → negative of the paid amount, partial →
 * partial, already-reversed → no-op); the structural asserts pin the action's
 * safety properties (FOR UPDATE, reversed duplicate-guard, negative salary row,
 * audit row) and the Entries editor's paid-increase notification.
 */

describe("planEntryReversal", () => {
  it("unpaid entry posts no negative adjustment", () => {
    const plan = planEntryReversal(0, false);
    expect(plan.shouldReverse).toBe(false);
    expect(plan.reversalAmount).toBe(0);
    expect(plan.alreadyReversed).toBe(false);
  });

  it("fully paid entry reverses the full paid amount as a negative", () => {
    const plan = planEntryReversal(2000, false);
    expect(plan.shouldReverse).toBe(true);
    expect(plan.reversalAmount).toBe(-2000);
  });

  it("partially paid entry reverses only the paid portion", () => {
    const plan = planEntryReversal(500, false);
    expect(plan.shouldReverse).toBe(true);
    expect(plan.reversalAmount).toBe(-500);
  });

  it("a repeated reversal is a no-op (duplicate guard)", () => {
    const plan = planEntryReversal(2000, true);
    expect(plan.alreadyReversed).toBe(true);
    expect(plan.shouldReverse).toBe(false);
    expect(plan.reversalAmount).toBe(0);
  });

  it("negative/NaN paid amounts are treated as unpaid", () => {
    expect(planEntryReversal(-100, false).shouldReverse).toBe(false);
    expect(planEntryReversal(Number.NaN, false).shouldReverse).toBe(false);
    expect(planEntryReversal("12.34", false).reversalAmount).toBe(-12.34);
  });
});

describe("reverseIncentiveEntry action (structural)", () => {
  const code = codeOf("app/(app)/incentive/reversal-actions.ts");

  it("locks the entry FOR UPDATE before reading paid amount", () => {
    expect(code).toMatch(/\.for\("update"\)/);
  });

  it("guards duplicates with the reversed flag", () => {
    expect(code).toMatch(/alreadyReversed/);
    expect(code).toMatch(/planEntryReversal/);
  });

  it("writes a negative salary_payments row with method='reversal'", () => {
    expect(code).toMatch(/insert\(salaryPayments\)/);
    expect(code).toMatch(/method:\s*"reversal"/);
    expect(code).toMatch(/amount:\s*money2\(plan\.reversalAmount\)/);
  });

  it("writes an incentive_payout_events audit row", () => {
    expect(code).toMatch(/insert\(incentivePayoutEvents\)/);
  });

  it("marks the entry reversed inside the transaction", () => {
    expect(code).toMatch(/reversed:\s*true/);
    expect(code).toMatch(/reversedById:\s*me\.id/);
  });

  it("is admin-only and rate-limited", () => {
    expect(code).toMatch(/requireAdmin\(\)/);
    expect(code).toMatch(/rateLimitOrError\(me\.id,\s*"write"\)/);
  });
});

describe("Entries editor paid-increase notification (structural)", () => {
  const code = codeOf("app/(app)/incentive/admin-actions.ts");

  it("reads the previous paid amount before the update", () => {
    expect(code).toMatch(/paidAmt:\s*incentiveEntries\.paidAmt/);
    expect(code).toMatch(/notifyIfPaidIncreased/);
  });

  it("uses the shared paid-increase helper (no duplicate notification logic)", () => {
    expect(code).toMatch(/from\s+"@\/lib\/incentive\/notifications\/paid-increase"/);
  });
});

describe("incentive payment ledger read path (structural)", () => {
  const code = codeOf("lib/queries/incentive-payments.ts");

  it("reads salary_payments filtered to kind='incentive'", () => {
    expect(code).toMatch(/\.from\(salaryPayments\)/);
    expect(code).toMatch(/eq\(salaryPayments\.kind,\s*"incentive"\)/);
  });

  it("joins employee name and incentive name", () => {
    expect(code).toMatch(/leftJoin\(employees/);
    expect(code).toMatch(/leftJoin\(incentiveEntries/);
  });

  it("splits gross paid vs reversal and computes net", () => {
    expect(code).toMatch(/grossPaid/);
    expect(code).toMatch(/reversal/);
    expect(code).toMatch(/netPaid/);
  });
});
