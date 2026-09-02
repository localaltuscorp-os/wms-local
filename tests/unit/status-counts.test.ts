import { describe, it, expect } from "vitest";
import {
  computeKpiTotals,
} from "@/lib/transforms/status-counts";
import { fixtureTasks, task } from "../fixtures/tasks";

describe("computeKpiTotals", () => {
  it("breaks Pending umbrella into pending (initiated+follow_up), notStarted, needHelp", () => {
    const totals = computeKpiTotals(fixtureTasks);
    expect(totals).toEqual({
      // 16 fixture rows MINUS the cancelled one and the transferred one.
      // Those used to count toward Total while appearing on no card, which is
      // why the five status cards summed short of the Total card.
      total: 14,
      pending: 2,       // 1 initiated + 1 follow_up
      notStarted: 0,    // fixture has none currently
      needHelp: 1,
      done: 10,         // 8 done + 2 approved
      notApproved: 1,
    });
  });

  // The bug the whole kpi-buckets module exists to stop coming back.
  it("keeps Total equal to the sum of the five status cards", () => {
    const t = computeKpiTotals(fixtureTasks);
    expect(t.pending + t.notStarted + t.needHelp + t.done + t.notApproved).toBe(
      t.total,
    );
  });

  it("lets the approval verdict override the doer's status", () => {
    const rows = [
      // Doer says done, admin sent it back — this is NOT APPROVED.
      task({ status: "done", approvalStatus: "not_approved" }),
      // Doer still working, admin approved anyway — this is DONE.
      task({ status: "initiated", approvalStatus: "approved" }),
    ];
    const t = computeKpiTotals(rows);
    expect(t).toMatchObject({ total: 2, done: 1, notApproved: 1, pending: 0 });
  });

  it("drops archived tasks from every bucket, Total included", () => {
    const t = computeKpiTotals([
      task({ status: "done" }),
      task({ status: "done", archived: true }),
    ]);
    expect(t).toMatchObject({ total: 1, done: 1 });
  });

  it("counts statuses with no card of their own as Pending", () => {
    // dont_know / on_hold / follow_up_1 previously fell through every branch
    // and were counted in Total but shown nowhere.
    const t = computeKpiTotals([
      task({ status: "dont_know" }),
      task({ status: "on_hold" }),
      task({ status: "follow_up_1" }),
    ]);
    expect(t).toMatchObject({ total: 3, pending: 3 });
  });
});

