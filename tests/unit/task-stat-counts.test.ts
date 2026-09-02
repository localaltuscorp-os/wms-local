import { describe, it, expect, vi } from "vitest";

// task-list-page imports task-table → server actions → server-only + @/lib/db
// (which validates env at import). Mock those so the module loads in vitest.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: {}, tasks: {} }));

import { computeStatCounts } from "@/components/tasks/task-list-page";
import type { TaskListRow } from "@/lib/types";

function row(p: Partial<TaskListRow>): TaskListRow {
  return {
    id: "t", title: "t", subject: null, client: null, description: null,
    status: "not_started", priority: "not_imp_not_urgent",
    doerId: "d", doerName: null, doerDept: null,
    initiatorId: "i", initiatorName: null,
    createdAt: new Date(), dueAt: new Date(), ageDays: 0,
    archived: false, createdById: null, updatedAt: new Date(),
    approvalStatus: null, firstReadAt: new Date(),
    ...p,
  } as TaskListRow;
}

describe("computeStatCounts", () => {
  it("counts done = done + approved", () => {
    const rows = [row({ status: "done" }), row({ status: "approved" }), row({ status: "not_started" })];
    expect(computeStatCounts(rows).done).toBe(2);
  });

  it("counts pending statuses", () => {
    const rows = [row({ status: "not_started" }), row({ status: "follow_up" }), row({ status: "done" })];
    expect(computeStatCounts(rows).pending).toBe(2);
  });

  it("counts critical (imp_urgent) and urgent (not_imp_urgent)", () => {
    const rows = [row({ priority: "imp_urgent" }), row({ priority: "not_imp_urgent" }), row({ priority: "not_imp_urgent" })];
    const c = computeStatCounts(rows);
    expect(c.critical).toBe(1);
    expect(c.urgent).toBe(2);
  });

  it("notApproved = declined via column, declined via legacy status, or done-awaiting", () => {
    const rows = [
      row({ approvalStatus: "not_approved" }),
      row({ status: "not_approved" }),
      row({ status: "done", approvalStatus: null }),
      row({ status: "done", approvalStatus: "approved" }),
      row({ status: "not_started" }),
    ];
    expect(computeStatCounts(rows).notApproved).toBe(3);
  });

  it("notRead = pending status AND firstReadAt null only", () => {
    const rows = [
      row({ status: "not_started", firstReadAt: null }),
      row({ status: "follow_up", firstReadAt: null }),
      row({ status: "not_started", firstReadAt: new Date() }),
      row({ status: "done", firstReadAt: null }),
    ];
    expect(computeStatCounts(rows).notRead).toBe(2);
  });
});
