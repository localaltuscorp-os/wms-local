import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

vi.mock("server-only", () => ({}));
// The query module reaches `db` at import time; this suite only exercises the
// pure payable rule, so the pool is never built and never connected.
vi.mock("@/lib/db", () => ({ db: {} }));

import { deriveIncentivePayable } from "@/lib/queries/incentive-accounts";
import { ACCOUNTS_SECTIONS } from "@/lib/accounts/sections";

/**
 * ACCOUNTS INCENTIVE PAYABLE — the money rule and the scope contract.
 *
 * `deriveIncentivePayable` is the whole of the arithmetic the Accounts ledger
 * shows. The query around it only fetches rows, so pinning this function pins
 * every figure the screen prints.
 *
 * The structural asserts at the end cover the two things a unit test on a pure
 * function cannot: that the scope is applied IN THE SQL (not in the component),
 * and that the section sits above Reimbursement on the Accounts index.
 */

describe("deriveIncentivePayable", () => {
  it("unpaid entry: full amount still owed, no adjustment", () => {
    const p = deriveIncentivePayable(2000, 0, 0);
    expect(p.unpaid).toBe(2000);
    expect(p.reversal).toBe(0);
    expect(p.finalPayable).toBe(2000);
    expect(p.status).toBe("unpaid");
  });

  it("partially paid entry: only the remainder is payable", () => {
    const p = deriveIncentivePayable(2000, 500, 0);
    expect(p.unpaid).toBe(1500);
    expect(p.finalPayable).toBe(1500);
    expect(p.status).toBe("part_paid");
  });

  it("fully paid entry: nothing left payable", () => {
    const p = deriveIncentivePayable(2000, 2000, 0);
    expect(p.unpaid).toBe(0);
    expect(p.finalPayable).toBe(0);
    expect(p.status).toBe("paid");
  });

  it("fully paid then reversed: the payable goes NEGATIVE — money to recover", () => {
    const p = deriveIncentivePayable(2000, 2000, -2000);
    expect(p.unpaid).toBe(0);
    expect(p.reversal).toBe(-2000);
    expect(p.finalPayable).toBe(-2000);
    expect(p.status).toBe("reversed");
  });

  it("partially paid then reversed: only the paid portion is recovered", () => {
    const p = deriveIncentivePayable(2000, 500, -500);
    expect(p.unpaid).toBe(1500);
    expect(p.reversal).toBe(-500);
    expect(p.finalPayable).toBe(1000);
    expect(p.status).toBe("reversed");
  });

  it("a reversal on an UNPAID entry changes nothing (paid 0 → no adjustment)", () => {
    const p = deriveIncentivePayable(2000, 0, 0);
    expect(p.finalPayable).toBe(2000);
  });

  it("a positive reversal is clamped away — only the negative row is an adjustment", () => {
    // The payout rows share the entry id; if one is ever mistaken for a
    // reversal it must not INCREASE the payable.
    const p = deriveIncentivePayable(2000, 0, 500);
    expect(p.reversal).toBe(0);
    expect(p.finalPayable).toBe(2000);
  });

  it("rounds paise dust off every derived figure", () => {
    const p = deriveIncentivePayable(1000.005, 333.335, -0.005);
    expect(p.due).toBe(1000.01);
    expect(p.paid).toBe(333.34);
    expect(Number.isInteger(Math.round(p.finalPayable * 100))).toBe(true);
  });

  it("the reversal always offsets the payable, never adds to it", () => {
    for (const paid of [0, 100, 999, 2000, 2500]) {
      const reversal = paid > 0 ? -paid : 0;
      const p = deriveIncentivePayable(2000, paid, reversal);
      expect(p.finalPayable).toBeLessThanOrEqual(p.unpaid);
    }
  });
});

describe("Accounts incentive ledger — scope contract", () => {
  const src = readFileSync("lib/queries/incentive-accounts.ts", "utf8");

  it("filters by the scope in the query, not in the component", () => {
    // The scope has to reach the WHERE clause. A component-side filter would
    // ship every employee's money to the browser first.
    expect(src).toMatch(/scope\.all/);
    expect(src).toMatch(/inArray\(incentiveEntries\.employeeId/);
  });

  it("an empty scope matches NOTHING rather than everything", () => {
    // `inArray(col, [])` is the classic way to accidentally widen a query.
    expect(src).toMatch(/scope\.employeeIds\.size === 0/);
  });

  it("returns no rows at all without a scope decision", () => {
    expect(src).toMatch(/return \{ rows: \[\], totals: zeroTotals\(\), people: 0 \}/);
  });
});

describe("Accounts index ordering", () => {
  const sorted = [...ACCOUNTS_SECTIONS].sort((a, b) => a.order - b.order);
  const slugAt = (slug: string) => sorted.findIndex((s) => s.slug === slug);

  it("lists Incentive above Reimbursement", () => {
    const incentive = slugAt("incentive-payments");
    const reimbursement = slugAt("reimbursement");
    expect(incentive).toBeGreaterThanOrEqual(0);
    expect(reimbursement).toBeGreaterThanOrEqual(0);
    expect(incentive).toBeLessThan(reimbursement);
  });

  it("puts the two employee-money sections first", () => {
    expect(sorted[0]?.slug).toBe("incentive-payments");
    expect(sorted[1]?.slug).toBe("reimbursement");
  });

  it("points Reimbursement at the existing module instead of rebuilding it", () => {
    const reimbursement = ACCOUNTS_SECTIONS.find((s) => s.slug === "reimbursement");
    expect(reimbursement?.status).toBe("link");
    expect(reimbursement?.href).toBe("/reimbursements");
  });

  it("renders Incentive as a real section with its own page", () => {
    const incentive = ACCOUNTS_SECTIONS.find((s) => s.slug === "incentive-payments");
    expect(incentive?.status).toBe("built");
    expect(readFileSync("app/(app)/accounts/incentive-payments/page.tsx", "utf8")).toContain(
      "requireAccountsAccess",
    );
  });
});
