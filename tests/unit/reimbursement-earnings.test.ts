import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: {} }));

import { reimbursementStateOf } from "@/lib/salary/reimbursement-earnings";
import { ACCOUNTS_SECTIONS } from "@/lib/accounts/sections";

/**
 * REIMBURSEMENT ON THE EARNINGS SLIP.
 *
 * The slip listed Salary, Attendance, Incentive and Retention, and skipped
 * Reimbursement — money the same person is owed in the same month, and the
 * section Accounts puts directly under Incentive. It has a section now, between
 * the two.
 *
 * The rule that matters is the state: `payment_date` means the money moved.
 * An approved claim that has not been paid is exactly the case an accounts
 * reader must not read as income, so it is listed and deliberately left OUT of
 * Total Earnings.
 */

describe("reimbursementStateOf", () => {
  it("is paid only when a payment date exists", () => {
    expect(reimbursementStateOf("approved", { approved: "Yes", payment_date: "2026-08-14" })).toBe(
      "paid",
    );
  });

  it("does not treat approval as payment", () => {
    expect(reimbursementStateOf("approved", { approved: "Yes" })).toBe("approved");
  });

  it("does not treat a bare status as payment", () => {
    expect(reimbursementStateOf("approved", {})).toBe("approved");
    expect(reimbursementStateOf("pending", {})).toBe("pending");
  });

  it("reads a rejection from either side", () => {
    expect(reimbursementStateOf("rejected", {})).toBe("rejected");
    expect(reimbursementStateOf("approved", { approved: "No" })).toBe("rejected");
  });

  it("lets the payment date outrank a rejection field", () => {
    // Money that has moved is money that has moved, whatever the flags say.
    expect(reimbursementStateOf("rejected", { approved: "No", payment_date: "2026-08-14" })).toBe(
      "paid",
    );
  });
});

describe("where reimbursement sits", () => {
  it("is the section directly under Incentive on the Accounts index", () => {
    const order = ACCOUNTS_SECTIONS.map((s) => s.slug);
    expect(order.indexOf("reimbursement")).toBe(order.indexOf("incentive-payments") + 1);
  });

  it("is on the salary slip's first page, under the month's total", () => {
    const pdf = readFileSync("lib/salary/salary-slip-pdf.ts", "utf8");
    const total = pdf.indexOf("Total Earnings This Month");
    const section = pdf.indexOf('drawSectionHeading(doc, "Reimbursement")');
    expect(total).toBeGreaterThan(-1);
    expect(section).toBeGreaterThan(total);
    // And its PAID figure joins that total.
    expect(pdf).toContain("data.reimbursement.paidThisMonth");
  });

  it("reads the module's own records rather than re-deriving a payment", () => {
    const reader = readFileSync("lib/salary/reimbursement-earnings.ts", "utf8");
    expect(reader).toContain("moduleSubmissions");
    expect(reader).toContain('"reimbursement"');
  });
});
