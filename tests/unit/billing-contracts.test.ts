import { describe, it, expect } from "vitest";
import {
  CONTRACT_TOTAL_EXCEEDED,
  addMonthsISO,
  billBucket,
  canBill,
  isValidAmount,
  nextRetainerAmount,
  pdcSummary,
  plannedTotal,
  projectRetainer,
  sequenceLabel,
  sumAmounts,
  validateContractPlan,
  type ContractPlanInput,
} from "@/lib/billing/contracts";
import { ContractSchema } from "@/lib/validators/billing-contracts";

/**
 * Billing → Create Contract. The one rule that must never slip is the ceiling:
 * nothing billed under a contract may exceed its Total Contract Value, for any
 * of the four payment types. Pinned here against the same pure functions the
 * form and the server both call.
 */

const base = (over: Partial<ContractPlanInput> = {}): ContractPlanInput => ({
  totalValue: "100000",
  paymentType: "milestone",
  startDate: "2026-04-01",
  endDate: "2027-03-31",
  billingDate: "2026-04-01",
  items: [{ amount: "40000" }, { amount: "60000" }],
  ...over,
});

const messages = (c: ContractPlanInput) => validateContractPlan(c).map((i) => i.message);

describe("money helpers", () => {
  it("sums without float drift", () => {
    expect(sumAmounts(["0.1", "0.2"])).toBe(0.3);
    expect(sumAmounts(["1,000.50", 2000, null, ""])).toBe(3000.5);
  });

  it("accepts only non-negative amounts with up to 2 decimals", () => {
    expect(isValidAmount("1500")).toBe(true);
    expect(isValidAmount("1,500.25")).toBe(true);
    expect(isValidAmount("")).toBe(true);
    expect(isValidAmount("-5")).toBe(false);
    expect(isValidAmount("12.345")).toBe(false);
    expect(isValidAmount("abc")).toBe(false);
  });
});

describe("contract value ceiling", () => {
  it("allows a schedule that exactly equals the contract value", () => {
    expect(messages(base())).toEqual([]);
  });

  it("rejects milestones that add up past the contract value", () => {
    expect(messages(base({ items: [{ amount: "40000" }, { amount: "60000.01" }] }))).toContain(
      CONTRACT_TOTAL_EXCEEDED,
    );
  });

  it("rejects subscription entries past the contract value", () => {
    const c = base({
      paymentType: "subscription",
      items: [
        { amount: "50000", dueDate: "2026-05-01" },
        { amount: "50000", dueDate: "2026-06-01" },
        { amount: "1", dueDate: "2026-07-01" },
      ],
    });
    expect(messages(c)).toContain(CONTRACT_TOTAL_EXCEEDED);
  });

  it("rejects a full payment above the contract value", () => {
    expect(messages(base({ paymentType: "full_payment", items: [{ amount: "100000.5" }] }))).toContain(
      CONTRACT_TOTAL_EXCEEDED,
    );
  });

  it("rejects a retainer period larger than the contract value", () => {
    const c = base({ paymentType: "retainer", billingFrequency: "monthly", retainerAmount: "150000", items: [] });
    expect(messages(c).join(" ")).toContain(CONTRACT_TOTAL_EXCEEDED);
  });

  it("does not count a stopped, never-billed row toward the plan", () => {
    const items = [{ amount: "60000" }, { amount: "60000", stopped: true }];
    expect(plannedTotal(items)).toBe(60000);
    expect(messages(base({ items }))).toEqual([]);
  });

  it("still counts a stopped row that already raised a bill", () => {
    expect(plannedTotal([{ amount: "60000" }, { amount: "60000", stopped: true, billed: true }])).toBe(120000);
  });

  it("canBill refuses the bill that would cross the ceiling and names the remainder", () => {
    expect(canBill(100000, 60000, 40000)).toEqual({ ok: true });
    const r = canBill(100000, 60000, 40000.01);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("Remaining: 40000.00");
    expect(canBill(100000, 0, 0).ok).toBe(false);
  });
});

describe("other contract rules", () => {
  it("rejects an End Date before the Start Date", () => {
    expect(messages(base({ endDate: "2026-03-31" }))).toContain("End Date cannot be before Start Date");
  });

  it("needs a positive contract value", () => {
    expect(messages(base({ totalValue: "0" }))).toContain("Enter the Total Contract Value");
  });

  it("needs a due date on every subscription entry", () => {
    const c = base({ paymentType: "subscription", items: [{ amount: "100", dueDate: null }] });
    expect(messages(c)).toContain("Row 1: choose the Due Date");
  });

  it("needs frequency and amount on a retainer", () => {
    const c = base({ paymentType: "retainer", billingFrequency: null, retainerAmount: "", items: [] });
    const m = messages(c);
    expect(m).toContain("Choose Monthly or Quarterly billing");
    expect(m.some((x) => x.includes("Billing Amount"))).toBe(true);
  });

  it("rejects a negative or malformed PDC amount", () => {
    const m = messages(base({ pdcs: [{ amount: "5000" }, { amount: "-1" }] }));
    expect(m).toContain("PDC 2: Amt must be a positive number");
  });

  it("lets Full Payment omit its entry (defaulted server-side) but not have two", () => {
    expect(messages(base({ paymentType: "full_payment", items: [] }))).toEqual([]);
    expect(messages(base({ paymentType: "full_payment", items: [{ amount: "1" }, { amount: "2" }] }))).toContain(
      "A Full Payment contract has exactly one billing entry",
    );
  });

  it("labels subscription entries 1/3, 2/3, 3/3", () => {
    expect([0, 1, 2].map((i) => sequenceLabel(i, 3))).toEqual(["1/3", "2/3", "3/3"]);
  });
});

describe("PDC Received summary", () => {
  it("counts rows and sums Amt", () => {
    expect(pdcSummary([{ amount: "25000" }, { amount: "25000.50" }, { amount: "" }])).toEqual({
      count: 3,
      amount: 50000.5,
    });
  });

  it("recalculates after a row is removed", () => {
    const rows = [{ amount: "100" }, { amount: "200" }, { amount: "300" }];
    expect(pdcSummary(rows.filter((_, i) => i !== 1))).toEqual({ count: 2, amount: 400 });
  });

  it("is zero with no PDCs", () => {
    expect(pdcSummary([])).toEqual({ count: 0, amount: 0 });
  });
});

describe("retainer billing", () => {
  it("adds calendar months, clamped to month end", () => {
    expect(addMonthsISO("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsISO("2026-11-15", 3)).toBe("2027-02-15");
  });

  it("cuts the last bill short and then stops at the contract value", () => {
    expect(nextRetainerAmount(100000, 90000, 30000)).toBe(10000);
    expect(nextRetainerAmount(100000, 100000, 30000)).toBeNull();
  });

  it("projects quarterly bills from the billing date until the value is used", () => {
    const run = projectRetainer({
      totalValue: 100000,
      billedSoFar: 0,
      perPeriod: 30000,
      frequency: "quarterly",
      billingDate: "2026-04-01",
      endDate: "2027-12-31",
      periodsBilled: 0,
    });
    expect(run.map((p) => [p.dueDate, p.amount])).toEqual([
      ["2026-04-01", 30000],
      ["2026-07-01", 30000],
      ["2026-10-01", 30000],
      ["2027-01-01", 10000],
    ]);
    expect(sumAmounts(run.map((p) => p.amount))).toBe(100000);
  });

  it("stops at the contract end date even with value left", () => {
    const run = projectRetainer({
      totalValue: 1000000,
      billedSoFar: 0,
      perPeriod: 10000,
      frequency: "monthly",
      billingDate: "2026-04-01",
      endDate: "2026-06-30",
      periodsBilled: 0,
    });
    expect(run).toHaveLength(3);
  });
});

describe("Paid / Unpaid / Not Due", () => {
  const today = "2026-09-19";
  it("paid when the invoice is paid", () => {
    expect(billBucket({ itemStatus: "billed", dueDate: null, document: { status: "paid", dueDate: "2026-01-01" } }, today)).toBe("paid");
  });
  it("unpaid when raised and the due date has come", () => {
    expect(billBucket({ itemStatus: "billed", dueDate: null, document: { status: "sent", dueDate: "2026-09-19" } }, today)).toBe("unpaid");
    expect(billBucket({ itemStatus: "billed", dueDate: null, document: { status: "draft", dueDate: null } }, today)).toBe("unpaid");
  });
  it("not due when raised with a due date still ahead", () => {
    expect(billBucket({ itemStatus: "billed", dueDate: null, document: { status: "generated", dueDate: "2026-10-01" } }, today)).toBe("not_due");
  });
  it("classifies unraised rows by their own due date", () => {
    expect(billBucket({ itemStatus: "pending", dueDate: "2026-12-01", document: null }, today)).toBe("not_due");
    expect(billBucket({ itemStatus: "pending", dueDate: "2026-08-01", document: null }, today)).toBe("unpaid");
    expect(billBucket({ itemStatus: "pending", dueDate: null, document: null }, today)).toBe("not_due");
  });
  it("leaves out stopped rows and cancelled-invoice rows", () => {
    expect(billBucket({ itemStatus: "stopped", dueDate: "2026-08-01", document: null }, today)).toBeNull();
    expect(
      billBucket({ itemStatus: "stopped", dueDate: null, document: { status: "cancelled", dueDate: null } }, today),
    ).toBeNull();
  });
});

describe("ContractSchema (server-side validation)", () => {
  const valid = {
    entityId: "altus-corp",
    customerId: "11111111-1111-4111-8111-111111111111",
    totalValue: "1,00,000",
    startDate: "2026-04-01",
    endDate: "2027-03-31",
    billingDate: "2026-04-01",
    paymentType: "milestone",
    items: [
      { description: "Kick-off", amount: "40000" },
      { description: "Delivery", amount: "60000" },
    ],
    pdcs: [{ chequeDate: "2026-05-01", chequeNo: "000123", bankName: "HDFC", amount: "40000", drawerName: "Acme" }],
  };

  it("accepts a valid contract and strips grouping commas from money", () => {
    const r = ContractSchema.safeParse(valid);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.totalValue).toBe("100000");
  });

  it("refuses a schedule over the contract value on the server too", () => {
    const r = ContractSchema.safeParse({ ...valid, items: [...valid.items, { amount: "1" }] });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.map((i) => i.message)).toContain(CONTRACT_TOTAL_EXCEEDED);
  });

  it("refuses a negative PDC amount", () => {
    const r = ContractSchema.safeParse({ ...valid, pdcs: [{ ...valid.pdcs[0], amount: "-100" }] });
    expect(r.success).toBe(false);
  });

  it("requires a client", () => {
    const r = ContractSchema.safeParse({ ...valid, customerId: "" });
    expect(r.success).toBe(false);
  });

  it("ignores schedule rows for a retainer and checks its period amount", () => {
    const r = ContractSchema.safeParse({
      ...valid,
      paymentType: "retainer",
      billingFrequency: "quarterly",
      retainerAmount: "25000",
    });
    expect(r.success).toBe(true);
  });
});
