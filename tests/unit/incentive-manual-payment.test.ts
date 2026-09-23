import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: {} }));

import {
  hasManualPaymentAmount,
  manualPaymentNote,
} from "@/lib/incentive/record-manual-payment";

/**
 * MONEY RECORDED BY HAND MUST REACH THE LEDGER.
 *
 * The Entries, Status and Split editors all write a paid amount. They wrote
 * `incentive_entries.paid_amt` and nothing else, so a payment recorded by hand
 * was invisible to Accounts and to the salary ledger, which read
 * `salary_payments`. The fix is `recordManualIncentivePayment` — a positive
 * `salary_payments` row plus its payout event, written inside the caller's
 * transaction.
 *
 * These tests pin the two rules that decide whether a row is written at all
 * (the amount must be a strict increase) and the note that says who wrote it.
 * The structural asserts cover what a pure unit test cannot: that every manual
 * writer actually calls it, inside a transaction, and that it is the ONLY
 * writer using `manual_entry` — so a payroll report can still tell a hand
 * entry from a salary run.
 */

describe("hasManualPaymentAmount", () => {
  it("records an increase", () => {
    expect(hasManualPaymentAmount(1500)).toBe(true);
    expect(hasManualPaymentAmount(0.01)).toBe(true);
  });

  it("writes nothing for no change", () => {
    // Re-saving the same amount is the common case; it must not duplicate the
    // ledger row.
    expect(hasManualPaymentAmount(0)).toBe(false);
  });

  it("writes nothing for a reduction", () => {
    // Lowering a paid figure is a correction, not a payment.
    expect(hasManualPaymentAmount(-500)).toBe(false);
  });

  it("writes nothing for a non-number", () => {
    expect(hasManualPaymentAmount(Number.NaN)).toBe(false);
    expect(hasManualPaymentAmount(Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe("manualPaymentNote", () => {
  it("names the editor the money came from", () => {
    expect(manualPaymentNote("entries")).toContain("Entries editor");
    expect(manualPaymentNote("status")).toContain("Status editor");
    expect(manualPaymentNote("split")).toContain("Split editor");
  });

  it("says the money was recorded by hand", () => {
    expect(manualPaymentNote("entries")).toContain("Recorded by hand");
  });

  it("keeps the caller's own note, when there is one", () => {
    expect(manualPaymentNote("status", "August top-up")).toContain("August top-up");
    expect(manualPaymentNote("status", null)).not.toContain("null");
  });
});

describe("every manual writer reaches the ledger", () => {
  const entries = readFileSync("app/(app)/incentive/admin-actions.ts", "utf8");
  const status = readFileSync("app/(app)/incentive/status-actions.ts", "utf8");
  const ledger = readFileSync("lib/incentive/record-manual-payment.ts", "utf8");

  it("the Entries editor records the payment in its transaction", () => {
    expect(entries).toContain("recordManualIncentivePayment");
    expect(entries).toMatch(/db\.transaction\(async \(tx\) => \{[\s\S]*recordManualIncentivePayment\(tx,/);
  });

  it("every Status editor path records the payment too", () => {
    // entry-status · project-leg status · split = three writers on this side.
    expect((status.match(/recordManualIncentivePayment\(tx,/g) ?? []).length).toBe(3);
  });

  it("only a hand entry uses the manual_entry method", () => {
    expect(ledger).toContain('method: "manual_entry"');
    // The salary run keeps writing its own, distinguishable rows.
    const run = readFileSync("lib/incentive/payout.ts", "utf8");
    expect(run).not.toContain("manual_entry");
  });
});
