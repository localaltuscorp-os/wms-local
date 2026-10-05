import { describe, it, expect, vi } from "vitest";

// task-list-page imports task-table → server actions → server-only + @/lib/db
// (which validates env at import). Mock those so the module loads in vitest.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: {}, tasks: {}, employees: {} }));

import { computeStatCounts } from "@/components/tasks/task-list-page";
import type { TaskListRow } from "@/lib/types";

function row(p: Partial<TaskListRow>): TaskListRow {
  return {
    id: "task", title: "Task", subject: null, client: null, description: null,
    status: "not_started", priority: "not_imp_not_urgent",
    doerId: "doer", doerName: null, doerDept: null,
    initiatorId: "initiator", initiatorName: null,
    createdAt: new Date(), dueAt: new Date(), ageDays: 0,
    archived: false, createdById: null, updatedAt: new Date(),
    approvalStatus: null, firstReadAt: new Date(),
    ...p,
  } as TaskListRow;
}

describe("computeStatCounts", () => {
  it("counts done Doer Status values", () => {
    const rows = [row({ status: "done" }), row({ status: "approved" }), row({ status: "not_started" })];
    expect(computeStatCounts(rows).done).toBe(2);
  });

  it("counts pending Initiator Status values", () => {
    const rows = [
      row({ status: "not_started" }),
      row({ status: "follow_up" }),
      row({ status: "done", approvalStatus: "approved" }),
    ];
    expect(computeStatCounts(rows).pending).toBe(2);
  });

  it("counts the current Doer Status cards", () => {
    const rows = [row({ status: "not_started" }), row({ status: "initiated" }), row({ status: "initiated" })];
    const counts = computeStatCounts(rows);
    expect(counts.notStarted).toBe(1);
    expect(counts.initiated).toBe(2);
  });

  it("counts only the Initiator Status column for not-approved work", () => {
    const rows = [
      row({ approvalStatus: "not_approved" }),
      row({ status: "done", approvalStatus: "not_approved" }),
      row({ status: "not_approved" }),
      row({ status: "done", approvalStatus: null }),
    ];
    expect(computeStatCounts(rows).notApproved).toBe(2);
  });

  it("counts the Doer Status value used for not-read work", () => {
    const rows = [
      row({ status: "dont_know", firstReadAt: null }),
      row({ status: "dont_know", firstReadAt: new Date() }),
      row({ status: "not_started", firstReadAt: null }),
      row({ status: "done", firstReadAt: null }),
    ];
    expect(computeStatCounts(rows).notRead).toBe(2);
  });
});
