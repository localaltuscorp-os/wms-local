import { describe, it, expect } from "vitest";
import type { ModuleSubmissionRow } from "@/lib/queries/modules";
import {
  CLAIM_CARD_FILTER,
  CLAIM_STATUS_CARD,
  CLAIM_STATUS_LABEL,
  CLAIM_STATUS_STRIPE,
  computeClaimKpis,
  settledShare,
} from "@/lib/reimbursements/claim-kpis";
import {
  filterClaims,
  sumClaims,
  type DerivedClaimStatus,
} from "@/lib/reimbursements/claim-status";

/**
 * THE KEY CARDS ON /reimbursements.
 *
 * The property under test is that the five cards RECONCILE: the four state
 * cards add up to the total card, in both money and count, and each card's
 * figure equals the list its click produces. The old strip could not be tested
 * this way — two of its cards filtered to the same set, so "the cards partition
 * the book" was not true of it.
 */

let seq = 0;
function claim(over: { amount?: string | number; status?: string; paymentDate?: string } = {}): ModuleSubmissionRow {
  seq += 1;
  return {
    id: `00000000-0000-0000-0000-${String(seq).padStart(12, "0")}`,
    module: "reimbursement",
    employeeId: "emp-1",
    employeeName: "Om Jadhav",
    fields: { expense_for: "Cab", amount: String(over.amount ?? 1000) },
    adminFields: over.paymentDate ? { payment_date: over.paymentDate } : {},
    status: over.status ?? "pending",
    decidedByName: null,
    decidedAt: null,
    createdAt: new Date("2026-09-01T10:00:00Z"),
  };
}

/** pending 750 · approved-unpaid 1000 · paid 2400 · rejected 9999 */
const book = (): ModuleSubmissionRow[] => [
  claim({ amount: 500 }),
  claim({ amount: 250 }),
  claim({ amount: 1000, status: "approved" }),
  claim({ amount: 2000, status: "approved", paymentDate: "2026-09-05" }),
  claim({ amount: 400, status: "approved", paymentDate: "2026-09-06" }),
  claim({ amount: 9999, status: "rejected" }),
];

describe("computeClaimKpis", () => {
  it("totals the whole book", () => {
    const f = computeClaimKpis(book());
    expect(f.total.count).toBe(6);
    expect(f.total.amount).toBe(500 + 250 + 1000 + 2000 + 400 + 9999);
  });

  it("splits the four states apart", () => {
    const f = computeClaimKpis(book());
    expect(f.pending).toEqual({ amount: 750, count: 2 });
    expect(f.approved).toEqual({ amount: 1000, count: 1 });
    expect(f.paid).toEqual({ amount: 2400, count: 2 });
    expect(f.rejected).toEqual({ amount: 9999, count: 1 });
  });

  it("keeps APPROVED narrow — approved money that is still owed, not the paid money too", () => {
    // The old single "Approved · paid" card merged these and needed a caption
    // to explain itself. Approved must not silently include the settled ones.
    const f = computeClaimKpis(book());
    expect(f.approved.amount).toBe(1000);
    expect(f.approved.amount).not.toBe(1000 + 2400);
  });

  it("PARTITIONS the book — the four state cards add up to the total card", () => {
    const f = computeClaimKpis(book());
    expect(f.pending.count + f.approved.count + f.paid.count + f.rejected.count).toBe(f.total.count);
    expect(f.pending.amount + f.approved.amount + f.paid.amount + f.rejected.amount).toBe(f.total.amount);
  });

  it("gives every card a figure equal to the list its click produces", () => {
    const rows = book();
    const f = computeClaimKpis(rows);
    for (const key of ["total", "pending", "approved", "paid", "rejected"] as const) {
      const list = filterClaims(rows, CLAIM_CARD_FILTER[key]);
      expect(list).toHaveLength(f[key].count);
      expect(sumClaims(list)).toBe(f[key].amount);
    }
  });

  it("is 0 everywhere for an empty book — never NaN, never undefined", () => {
    const f = computeClaimKpis([]);
    for (const key of ["total", "pending", "approved", "paid", "rejected"] as const) {
      expect(f[key]).toEqual({ amount: 0, count: 0 });
    }
  });

  it("does not mutate the rows it folds", () => {
    const rows = book();
    const before = JSON.stringify(rows);
    computeClaimKpis(rows);
    expect(JSON.stringify(rows)).toBe(before);
  });

  it("counts a pending claim with a stray payment date as PENDING", () => {
    // Admin fields are editable before the verdict; only the verdict settles.
    const f = computeClaimKpis([claim({ amount: 100, paymentDate: "2026-09-05" })]);
    expect(f.pending).toEqual({ amount: 100, count: 1 });
    expect(f.paid).toEqual({ amount: 0, count: 0 });
  });

  it("survives the currency noise people paste into the amount field", () => {
    const f = computeClaimKpis([claim({ amount: "₹ 1,500" }), claim({ amount: "abc" })]);
    expect(f.total).toEqual({ amount: 1500, count: 2 });
  });
});

describe("settledShare", () => {
  it("is the paid share of everything approved", () => {
    expect(settledShare(computeClaimKpis(book()))).toBeCloseTo(2400 / 3400, 10);
  });

  it("is null — not 0 — when nothing has been approved at all", () => {
    // 0 would draw an empty bar, which says "none of it has been paid". That is
    // a different statement from "there is none".
    expect(settledShare(computeClaimKpis([claim({ amount: 500 })]))).toBeNull();
    expect(settledShare(computeClaimKpis([]))).toBeNull();
  });

  it("is 1 when every approved claim has been settled", () => {
    const rows = [claim({ amount: 800, status: "approved", paymentDate: "2026-09-05" })];
    expect(settledShare(computeClaimKpis(rows))).toBe(1);
  });
});

describe("the claim palette", () => {
  const states: DerivedClaimStatus[] = ["pending", "approved", "paid", "rejected"];

  it("names a card token, a stripe and a label for every claim state", () => {
    for (const s of states) {
      expect(CLAIM_STATUS_CARD[s]).toBeTruthy();
      expect(CLAIM_STATUS_STRIPE[s]).toBeTruthy();
      expect(CLAIM_STATUS_LABEL[s]).toBeTruthy();
    }
  });

  it("gives the four states four DIFFERENT colours", () => {
    // Approved and Paid sharing a green is exactly what hid the difference
    // between "we said yes" and "the money left" on the old strip.
    expect(new Set(states.map((s) => CLAIM_STATUS_CARD[s])).size).toBe(4);
    expect(new Set(states.map((s) => CLAIM_STATUS_STRIPE[s])).size).toBe(4);
  });

  it("uses only Tailwind classes for the stripe — no module-local hex", () => {
    for (const s of states) expect(CLAIM_STATUS_STRIPE[s]).toMatch(/^bg-[a-z]+-\d{3}$/);
  });
});
