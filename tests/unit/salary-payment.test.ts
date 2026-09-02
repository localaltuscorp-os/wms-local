import { describe, expect, it } from "vitest";
import {
  amountPaidOf,
  clampAmount,
  paymentStatusOf,
  settles,
  totalPayable,
  unpaidBalance,
  SETTLED_EPSILON,
} from "@/lib/salary/payment";

/**
 * The partial-payment ladder. These are the rules the accounts team reads off
 * the screen and the server enforces on write, so they are pinned here rather
 * than left to the two call sites to agree by coincidence.
 */

/** A plain row with no wave-off and no adjustment: payable === finalPayment. */
function row(finalPayment: number, amountPaid = 0) {
  return {
    finalPayment: String(finalPayment),
    monthlyCtc: "0",
    daysInMonth: "30",
    waiveOffDays: "0",
    payoutAdjustment: "0",
    amountPaid: String(amountPaid),
  };
}

describe("totalPayable", () => {
  it("is the plain final payment when nothing is waived or adjusted", () => {
    expect(totalPayable(row(50_000))).toBe(50_000);
  });

  it("includes the wave-off add-back at the sheet's per-day rate", () => {
    // 30,000 / 30 days = 1,000/day; 2 condoned days = +2,000.
    const r = {
      finalPayment: "28000",
      monthlyCtc: "30000",
      daysInMonth: "30",
      waiveOffDays: "2",
      payoutAdjustment: "0",
      amountPaid: "0",
    };
    expect(totalPayable(r)).toBe(30_000);
  });

  it("includes the signed payout adjustment in both directions", () => {
    expect(totalPayable({ ...row(50_000), payoutAdjustment: "1500" })).toBe(51_500);
    expect(totalPayable({ ...row(50_000), payoutAdjustment: "-2000" })).toBe(48_000);
  });
});

describe("partial payments", () => {
  it("computes the worked example: 50,000 payable − 30,000 paid = 20,000 balance", () => {
    const r = row(50_000, 30_000);
    expect(totalPayable(r)).toBe(50_000);
    expect(amountPaidOf(r)).toBe(30_000);
    expect(unpaidBalance(r)).toBe(20_000);
    expect(paymentStatusOf(r)).toBe("partial");
  });

  it("is unpaid at zero paid", () => {
    const r = row(50_000, 0);
    expect(unpaidBalance(r)).toBe(50_000);
    expect(paymentStatusOf(r)).toBe("unpaid");
  });

  it("is paid once the full amount is recorded", () => {
    const r = row(50_000, 50_000);
    expect(unpaidBalance(r)).toBe(0);
    expect(paymentStatusOf(r)).toBe("paid");
  });

  it("treats one rupee short as still partial — no silent rounding to settled", () => {
    const r = row(50_000, 49_999);
    expect(unpaidBalance(r)).toBe(1);
    expect(paymentStatusOf(r)).toBe("partial");
  });

  it("settles a payable carrying float dust when the whole-rupee amount is paid", () => {
    // 25,000 / 30 = 833.33…/day; 1 condoned day leaves a fractional payable that
    // an admin can only ever pay to the rupee.
    const r = {
      finalPayment: "24000",
      monthlyCtc: "25000",
      daysInMonth: "30",
      waiveOffDays: "1",
      payoutAdjustment: "0",
      amountPaid: "24833",
    };
    expect(totalPayable(r)).toBeCloseTo(24_833.33, 2);
    // The residue is under half a rupee, so the row reads settled rather than
    // sitting at "partial" with a balance that displays as ₹0.
    expect(unpaidBalance(r)).toBeLessThanOrEqual(SETTLED_EPSILON);
    expect(paymentStatusOf(r)).toBe("paid");
  });
});

describe("the balance can never go negative", () => {
  it("floors at zero on overpayment", () => {
    const r = row(50_000, 80_000);
    expect(unpaidBalance(r)).toBe(0);
    expect(paymentStatusOf(r)).toBe("paid");
  });

  it("floors at zero when the payable is later revised below what was paid", () => {
    // Money went out, then a deduction cut the payable underneath it.
    const r = { ...row(50_000, 50_000), payoutAdjustment: "-5000" };
    expect(totalPayable(r)).toBe(45_000);
    expect(unpaidBalance(r)).toBe(0);
  });

  it("treats a negative stored amount as zero rather than inflating the balance", () => {
    const r = row(50_000, -1_000);
    expect(amountPaidOf(r)).toBe(0);
    expect(unpaidBalance(r)).toBe(50_000);
  });
});

describe("clampAmount", () => {
  it("caps an over-amount at the payable and reports that it did", () => {
    expect(clampAmount(row(50_000), 99_000)).toEqual({ amount: 50_000, clamped: true });
  });

  it("leaves a valid partial amount alone", () => {
    expect(clampAmount(row(50_000), 30_000)).toEqual({ amount: 30_000, clamped: false });
  });

  it("floors a negative entry at zero without calling it clamped", () => {
    expect(clampAmount(row(50_000), -5)).toEqual({ amount: 0, clamped: false });
  });

  it("coerces a non-finite entry to zero instead of writing NaN", () => {
    expect(clampAmount(row(50_000), Number.NaN)).toEqual({ amount: 0, clamped: false });
  });
});

describe("settles — the rule that decides whether the slip email fires", () => {
  it("is false for a partial amount", () => {
    expect(settles(row(50_000), 30_000)).toBe(false);
  });

  it("is true at exactly the payable", () => {
    expect(settles(row(50_000), 50_000)).toBe(true);
  });

  it("is true above the payable", () => {
    expect(settles(row(50_000), 60_000)).toBe(true);
  });
});

describe("a zero payable", () => {
  it("reads as settled — there is no money to send, so it is not a standing alarm", () => {
    const r = row(0, 0);
    expect(unpaidBalance(r)).toBe(0);
    expect(paymentStatusOf(r)).toBe("paid");
  });
});
