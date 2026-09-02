import { describe, it, expect } from "vitest";
import {
  planIncentivePayout,
  nilView,
  round2,
  type IncentiveSource,
} from "@/lib/incentive/payout-math";
import {
  foldIncentiveSources,
  aggregateByPerson,
  sourcesForPerson,
} from "@/lib/incentive/payout-sources";
import type {
  IncentiveEntry,
  IncentiveParticipant,
  IncentiveProject,
} from "@/db/schema";

// ── factories: minimal ledger rows cast to the full row types ──────────────
// The fold only reads a handful of columns; the rest are irrelevant, so we cast
// through `unknown` rather than spell out every column.
function entry(p: Partial<IncentiveEntry>): IncentiveEntry {
  return {
    id: "e1",
    empName: "Asha",
    employeeId: null,
    periodMonth: "2026-04-01",
    approvedAmt: "0",
    bookedAmt: "0",
    accruedAmt: "0",
    paidAmt: "0",
    ...p,
  } as unknown as IncentiveEntry;
}
function project(p: Partial<IncentiveProject>): IncentiveProject {
  return {
    id: "p1",
    periodMonth: "2026-04-01",
    supervisorName: null,
    supervisorId: null,
    internName: null,
    internId: null,
    empApprovedAmt: "0",
    empBookedAmt: "0",
    empAccruedAmt: "0",
    empPaidAmt: "0",
    internApprovedAmt: "0",
    internBookedAmt: "0",
    internAccruedAmt: "0",
    internPaidAmt: "0",
    ...p,
  } as unknown as IncentiveProject;
}
function participant(p: Partial<IncentiveParticipant>): IncentiveParticipant {
  return {
    id: "pt1",
    entryId: null,
    projectId: null,
    periodMonth: "2026-04-01",
    empName: "Asha",
    employeeId: null,
    bookedAmt: "0",
    accruedAmt: "0",
    paidAmt: "0",
    ...p,
  } as unknown as IncentiveParticipant;
}

const src = (p: Partial<IncentiveSource> & { key: string }): IncentiveSource => ({
  approved: 0,
  booked: 0,
  accrued: 0,
  paid: 0,
  ...p,
});

describe("planIncentivePayout — payout math", () => {
  it("pays accrued minus already-paid (default basis)", () => {
    const plan = planIncentivePayout([src({ key: "a", accrued: 10000, paid: 0 })]);
    expect(plan.totalPayable).toBe(10000);
    expect(plan.totalPayNow).toBe(10000);
    expect(plan.sources[0]!.newPaidTotal).toBe(10000);
    expect(plan.remainderAfter).toBe(0);
    expect(plan.nils).toBe(true);
  });

  it("pays only the remaining delta when partially paid", () => {
    const plan = planIncentivePayout([src({ key: "a", accrued: 10000, paid: 4000 })]);
    expect(plan.totalPayNow).toBe(6000);
    expect(plan.sources[0]!.newPaidTotal).toBe(10000);
    expect(plan.nils).toBe(true);
  });

  it("IDEMPOTENT — re-running after a full pay pays nothing (no double-pay)", () => {
    const source = src({ key: "a", accrued: 10000, paid: 0 });
    const first = planIncentivePayout([source]);
    // simulate the write: paid becomes newPaidTotal
    const afterWrite = src({ ...source, paid: first.sources[0]!.newPaidTotal });
    const second = planIncentivePayout([afterWrite]);
    expect(second.totalPayNow).toBe(0);
    expect(second.sources[0]!.payNow).toBe(0);
  });

  it("never pays a NEGATIVE amount when over-paid", () => {
    const plan = planIncentivePayout([src({ key: "a", accrued: 5000, paid: 8000 })]);
    expect(plan.totalPayNow).toBe(0);
    expect(plan.sources[0]!.payNow).toBe(0);
    // remainder can be negative (over-paid) but never triggers a claw-back write
    expect(plan.remainderAfter).toBeLessThanOrEqual(0);
    expect(plan.nils).toBe(true);
  });

  it("does NOT pay booked-only legs (client only paid partial)", () => {
    const plan = planIncentivePayout([src({ key: "a", booked: 9000, accrued: 0, paid: 0 })]);
    expect(plan.totalPayable).toBe(0);
    expect(plan.totalPayNow).toBe(0);
  });

  it("'approved' basis pays approved instead of accrued", () => {
    const plan = planIncentivePayout(
      [src({ key: "a", approved: 12000, accrued: 8000, paid: 0 })],
      "approved",
    );
    expect(plan.totalPayable).toBe(12000);
    expect(plan.totalPayNow).toBe(12000);
  });

  it("aggregates across multiple legs", () => {
    const plan = planIncentivePayout([
      src({ key: "a", accrued: 10000, paid: 10000 }), // settled
      src({ key: "b", accrued: 5000, paid: 0 }), // owed
      src({ key: "c", accrued: 2500, paid: 1000 }), // partial
    ]);
    expect(plan.totalPayable).toBe(17500);
    expect(plan.totalAlreadyPaid).toBe(11000);
    expect(plan.totalPayNow).toBe(6500);
    expect(plan.totalPaidAfter).toBe(17500);
    expect(plan.remainderAfter).toBe(0);
    expect(plan.nils).toBe(true);
  });

  it("rounds to paise", () => {
    const plan = planIncentivePayout([src({ key: "a", accrued: 1333.333, paid: 0 })]);
    expect(plan.totalPayNow).toBe(round2(1333.333));
    expect(plan.totalPayNow).toBe(1333.33);
  });

  it("empty source list is a clean zero plan", () => {
    const plan = planIncentivePayout([]);
    expect(plan.totalPayable).toBe(0);
    expect(plan.totalPayNow).toBe(0);
    expect(plan.nils).toBe(true); // vacuously nil
  });
});

describe("nilView", () => {
  it("nils when paid ≥ payable", () => {
    expect(nilView(5000, 5000)).toEqual({ payable: 5000, paid: 5000, remainder: 0, nils: true });
    expect(nilView(5000, 6000).nils).toBe(true);
  });
  it("shows the outstanding remainder", () => {
    expect(nilView(5000, 2000)).toEqual({ payable: 5000, paid: 2000, remainder: 3000, nils: false });
  });
});

describe("foldIncentiveSources — participant replacement + exclusions", () => {
  it("emits a plain entry leg when it has no participants", () => {
    const out = foldIncentiveSources(
      [entry({ id: "e1", empName: "Asha", accruedAmt: "9000", paidAmt: "0" })],
      [],
      [],
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.table).toBe("entry");
    expect(out[0]!.key).toBe("entry:e1");
    expect(out[0]!.incentiveEntryId).toBe("e1");
    expect(out[0]!.accrued).toBe(9000);
  });

  it("participants REPLACE their parent entry (no double-count)", () => {
    const out = foldIncentiveSources(
      [entry({ id: "e1", empName: "Asha", accruedAmt: "9000" })],
      [],
      [
        participant({ id: "pt1", entryId: "e1", empName: "Asha", accruedAmt: "6000" }),
        participant({ id: "pt2", entryId: "e1", empName: "Ravi", accruedAmt: "3000" }),
      ],
    );
    // entry itself is dropped; only the two participant legs remain
    expect(out.map((s) => s.table)).toEqual(["participant", "participant"]);
    expect(out.map((s) => s.accrued).sort()).toEqual([3000, 6000]);
    // participant under an entry carries the entry id for the salary ledger FK
    expect(out.every((s) => s.incentiveEntryId === "e1")).toBe(true);
  });

  it("emits both project legs, mapping leg → key/paid column source", () => {
    const out = foldIncentiveSources(
      [],
      [
        project({
          id: "p1",
          supervisorName: "Asha",
          supervisorId: "emp-asha",
          empAccruedAmt: "5000",
          internName: "Ravi",
          internAccruedAmt: "2000",
        }),
      ],
      [],
    );
    expect(out).toHaveLength(2);
    const sup = out.find((s) => s.leg === "supervisor")!;
    const int = out.find((s) => s.leg === "intern")!;
    expect(sup.key).toBe("project:p1:sup");
    expect(sup.employeeId).toBe("emp-asha");
    expect(sup.accrued).toBe(5000);
    expect(int.key).toBe("project:p1:int");
    expect(int.accrued).toBe(2000);
  });

  it("drops excluded actors and 'none'", () => {
    const out = foldIncentiveSources(
      [
        entry({ id: "e1", empName: "Manan Vasa", accruedAmt: "9999" }),
        entry({ id: "e2", empName: "none", accruedAmt: "1" }),
        entry({ id: "e3", empName: "Asha", accruedAmt: "100" }),
      ],
      [],
      [],
    );
    expect(out.map((s) => s.empName)).toEqual(["Asha"]);
  });
});

describe("aggregateByPerson + sourcesForPerson", () => {
  it("aggregates legs per person, keyed by employeeId when known", () => {
    const folded = foldIncentiveSources(
      [
        entry({ id: "e1", empName: "Asha", employeeId: "emp-asha", accruedAmt: "5000", paidAmt: "1000" }),
        entry({ id: "e2", empName: "Asha", employeeId: "emp-asha", accruedAmt: "3000" }),
      ],
      [],
      [],
    );
    const agg = aggregateByPerson(folded);
    expect(agg).toHaveLength(1);
    expect(agg[0]!.key).toBe("emp-asha");
    expect(agg[0]!.accrued).toBe(8000);
    expect(agg[0]!.paid).toBe(1000);
    expect(agg[0]!.sourceCount).toBe(2);
  });

  it("filters legs to one person by employeeId or name", () => {
    const folded = foldIncentiveSources(
      [
        entry({ id: "e1", empName: "Asha", employeeId: "emp-asha", accruedAmt: "5000" }),
        entry({ id: "e2", empName: "asha", employeeId: null, accruedAmt: "3000" }), // name-only match
        entry({ id: "e3", empName: "Ravi", employeeId: "emp-ravi", accruedAmt: "1000" }),
      ],
      [],
      [],
    );
    const mine = sourcesForPerson(folded, { employeeId: "emp-asha", name: "Asha" });
    expect(mine.map((s) => s.rowId).sort()).toEqual(["e1", "e2"]);
  });
});
