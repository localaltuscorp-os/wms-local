import { describe, it, expect } from "vitest";
import type { ModuleSubmissionRow } from "@/lib/queries/modules";
import {
  CLAIM_FILTER_LABELS,
  claimAmount,
  deriveStatus,
  filterClaims,
  isPaid,
  matchesFilter,
  sumClaims,
  type ClaimFilter,
} from "@/lib/reimbursements/claim-status";

/**
 * REIMBURSEMENT KPI FILTERS — the property under test is CONSISTENCY.
 *
 * Making a KPI clickable is only safe if the set it filters to is the same set
 * it counted. These tests assert that for every card: the figure on the card and
 * the length/total of the list it produces are computed from one predicate, so
 * a card reading "₹12,000 across 4 claims" cannot show three rows.
 */

let seq = 0;
function claim(over: {
  amount?: string | number;
  status?: string;
  paymentDate?: string;
} = {}): ModuleSubmissionRow {
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

/** A realistic mixed book: pending, approved-unpaid, paid, rejected. */
function book() {
  return {
    pending: [claim({ amount: 500 }), claim({ amount: 250 })],
    approvedUnpaid: [claim({ amount: 1000, status: "approved" })],
    paid: [
      claim({ amount: 2000, status: "approved", paymentDate: "2026-09-05" }),
      claim({ amount: 400, status: "approved", paymentDate: "2026-09-06" }),
    ],
    rejected: [claim({ amount: 9999, status: "rejected" })],
  };
}
const flat = (b: ReturnType<typeof book>) => [
  ...b.pending,
  ...b.approvedUnpaid,
  ...b.paid,
  ...b.rejected,
];

/* ── The pieces ───────────────────────────────────────────────────────────── */

describe("claim amount", () => {
  it("reads the string field as a number", () => {
    expect(claimAmount(claim({ amount: "1500" }))).toBe(1500);
  });

  it("survives the currency noise people paste into a number field", () => {
    expect(claimAmount(claim({ amount: "₹ 1,500" }))).toBe(1500);
  });

  it("is 0 — never NaN — for a missing or unparseable amount", () => {
    expect(claimAmount(claim({ amount: "" }))).toBe(0);
    expect(claimAmount(claim({ amount: "abc" }))).toBe(0);
  });
});

describe("derived status", () => {
  it("is paid only when approved AND a payment date is logged", () => {
    expect(deriveStatus(claim({ status: "approved", paymentDate: "2026-09-05" }))).toBe("paid");
    expect(deriveStatus(claim({ status: "approved" }))).toBe("approved");
  });

  it("does NOT call a pending claim paid just because a date got typed", () => {
    // The admin fields are editable before the verdict; only the verdict settles.
    expect(isPaid(claim({ status: "pending", paymentDate: "2026-09-05" }))).toBe(false);
    expect(deriveStatus(claim({ status: "pending", paymentDate: "2026-09-05" }))).toBe("pending");
  });

  it("passes pending and rejected straight through", () => {
    expect(deriveStatus(claim({ status: "pending" }))).toBe("pending");
    expect(deriveStatus(claim({ status: "rejected" }))).toBe("rejected");
  });
});

/* ── The filters ──────────────────────────────────────────────────────────── */

describe("each KPI filters to its own definition", () => {
  it("Total claimed / Claims → every row (both cards describe the whole set)", () => {
    const rows = flat(book());
    expect(filterClaims(rows, "all")).toHaveLength(rows.length);
    expect(sumClaims(filterClaims(rows, "all"))).toBe(sumClaims(rows));
  });

  it("Pending → exactly the pending claims", () => {
    const b = book();
    const got = filterClaims(flat(b), "pending");
    expect(got).toHaveLength(b.pending.length);
    expect(got.every((r) => r.status === "pending")).toBe(true);
  });

  it("Approved · paid → approved claims, SETTLED OR NOT", () => {
    // This is the card's own definition. Filtering to the narrower
    // approved-but-unpaid would drop the settled ones and contradict the total
    // printed on the card.
    const b = book();
    const got = filterClaims(flat(b), "approvedAll");
    expect(got).toHaveLength(b.approvedUnpaid.length + b.paid.length);
    expect(got.every((r) => r.status === "approved")).toBe(true);
  });

  it("the Approved CHIP stays narrower — approved but not yet settled", () => {
    const b = book();
    const got = filterClaims(flat(b), "approved");
    expect(got).toHaveLength(b.approvedUnpaid.length);
    expect(got.every((r) => !isPaid(r))).toBe(true);
  });

  it("Paid → only the settled ones", () => {
    const b = book();
    const got = filterClaims(flat(b), "paid");
    expect(got).toHaveLength(b.paid.length);
    expect(got.every(isPaid)).toBe(true);
  });

  it("Rejected → only the rejected ones", () => {
    const b = book();
    const got = filterClaims(flat(b), "rejected");
    expect(got).toHaveLength(b.rejected.length);
    expect(got.every((r) => r.status === "rejected")).toBe(true);
  });
});

/* ── The consistency property ─────────────────────────────────────────────── */

describe("KPI figures reconcile with the lists they filter to", () => {
  const b = book();
  const rows = flat(b);

  it("the Pending card's ₹ total equals the ₹ total of its filtered list", () => {
    const cardTotal = sumClaims(rows.filter((r) => r.status === "pending"));
    expect(sumClaims(filterClaims(rows, "pending"))).toBe(cardTotal);
  });

  it("the Approved · paid card's ₹ total equals its filtered list's total", () => {
    const cardTotal = sumClaims(rows.filter((r) => r.status === "approved"));
    expect(sumClaims(filterClaims(rows, "approvedAll"))).toBe(cardTotal);
  });

  it("the Approved · paid card's 'N of M settled' caption matches its list", () => {
    const list = filterClaims(rows, "approvedAll");
    // M — the denominator on the card.
    expect(list).toHaveLength(3);
    // N — the settled count on the card.
    expect(list.filter(isPaid)).toHaveLength(2);
  });

  it("the Claims card's count equals the row count of its filtered list", () => {
    expect(filterClaims(rows, "all")).toHaveLength(rows.length);
  });

  it("pending + approved(all) + rejected PARTITION the book — nothing is stranded", () => {
    const buckets: ClaimFilter[] = ["pending", "approvedAll", "rejected"];
    const counted = buckets.reduce((n, f) => n + filterClaims(rows, f).length, 0);
    expect(counted).toBe(rows.length);
    const totalled = buckets.reduce((n, f) => n + sumClaims(filterClaims(rows, f)), 0);
    expect(totalled).toBe(sumClaims(rows));
  });

  it("approved(unpaid) + paid also partition the approved ones exactly", () => {
    const all = filterClaims(rows, "approvedAll").length;
    expect(filterClaims(rows, "approved").length + filterClaims(rows, "paid").length).toBe(all);
  });

  it("every claim matches 'all' and exactly one of the four derived states", () => {
    for (const r of rows) {
      expect(matchesFilter(r, "all")).toBe(true);
      const states: ClaimFilter[] = ["pending", "approved", "paid", "rejected"];
      expect(states.filter((f) => matchesFilter(r, f))).toHaveLength(1);
    }
  });
});

/* ── Edges ────────────────────────────────────────────────────────────────── */

describe("edges", () => {
  it("an empty book gives every filter an empty list and a ₹0 total", () => {
    for (const f of Object.keys(CLAIM_FILTER_LABELS) as ClaimFilter[]) {
      expect(filterClaims([], f)).toEqual([]);
      expect(sumClaims(filterClaims([], f))).toBe(0);
    }
  });

  it("clearing back to All restores every row", () => {
    const rows = flat(book());
    expect(filterClaims(rows, "pending").length).toBeLessThan(rows.length);
    expect(filterClaims(rows, "all")).toHaveLength(rows.length);
  });

  it("names every filter, so the active-state line can always say what is on", () => {
    for (const f of Object.keys(CLAIM_FILTER_LABELS) as ClaimFilter[]) {
      expect(CLAIM_FILTER_LABELS[f]).toBeTruthy();
    }
  });

  it("does not mutate or reorder the rows it filters", () => {
    const rows = flat(book());
    const before = rows.map((r) => r.id);
    const out = filterClaims(rows, "all");
    expect(rows.map((r) => r.id)).toEqual(before);
    expect(out).not.toBe(rows); // a copy, so a caller's sort cannot reorder props
    expect(out.map((r) => r.id)).toEqual(before);
  });
});
