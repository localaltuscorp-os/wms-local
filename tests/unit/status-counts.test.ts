import { describe, it, expect } from "vitest";
import {
  computeKpiTotals,
  computeStatusDistribution,
} from "@/lib/transforms/status-counts";
import { fixtureTasks } from "../fixtures/tasks";

describe("computeKpiTotals", () => {
  it("breaks Pending umbrella into pending (initiated+follow_up), notStarted, needHelp", () => {
    const totals = computeKpiTotals(fixtureTasks);
    expect(totals).toEqual({
      total: 16,
      pending: 2,       // 1 initiated + 1 follow_up
      notStarted: 0,    // fixture has none currently
      needHelp: 1,
      done: 10,         // 8 done + 2 approved
      notApproved: 1,
    });
  });
});

describe("computeStatusDistribution", () => {
  it("counts sum to total tasks", () => {
    const dist = computeStatusDistribution(fixtureTasks);
    const total = dist.reduce((s, d) => s + d.count, 0);
    expect(total).toBe(fixtureTasks.length);
  });

  it("includes done=8, approved=2, cancelled=1", () => {
    const dist = computeStatusDistribution(fixtureTasks);
    expect(dist).toContainEqual({ status: "done", count: 8 });
    expect(dist).toContainEqual({ status: "approved", count: 2 });
    expect(dist).toContainEqual({ status: "cancelled", count: 1 });
  });
});
