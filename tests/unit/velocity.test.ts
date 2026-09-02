import { describe, it, expect } from "vitest";
import { computeVelocity } from "@/lib/transforms/velocity";
import type { Task } from "@/db/schema";

function task(p: Partial<Task>): Task {
  return {
    id: crypto.randomUUID(),
    title: "t",
    description: null,
    doerId: "d",
    initiatorId: "i",
    priority: "not_imp_urgent",
    status: "done",
    createdAt: new Date("2026-05-01"),
    dueAt: new Date("2026-05-08"),
    completedAt: null,
    transferredFromId: null,
    notes: null,
    subject: null,
    client: null,
    googleEventId: null,
    googleSyncedDoerId: null,
    firstReadAt: null,
    archived: false,
    createdById: null,
    approvedById: null,
    approvedAt: null,
    approvalNote: null,
    updatedAt: new Date("2026-05-01"),
    legacyImportKey: null,
    shortId: null,
    taskNo: null,
    tags: null,
    approvalStatus: null,
    revisedTargetDate: null,
    startsAt: null,
    endsAt: null,
    allDay: false,
    recurrence: null,
    recurrenceRule: null,
    recurrenceParentId: null,
    recurrenceOccurrenceDate: null,
    projectNodeId: null,
    searchText: null,
    ...p,
  };
}

describe("computeVelocity", () => {
  it("returns daily points with created and completed counts", () => {
    const start = new Date("2026-05-01T00:00:00Z");
    const end = new Date("2026-05-04T00:00:00Z");
    const tasks: Task[] = [
      task({
        createdAt: new Date("2026-05-01T03:00:00Z"),
        completedAt: new Date("2026-05-02T03:00:00Z"),
        status: "done",
      }),
      task({
        createdAt: new Date("2026-05-02T05:00:00Z"),
        completedAt: new Date("2026-05-03T05:00:00Z"),
        status: "approved",
      }),
    ];
    const result = computeVelocity(tasks, start, end);
    expect(result.length).toBe(3);
    expect(result[0]).toMatchObject({ date: "2026-05-01", created: 1, completed: 0 });
    expect(result[1]).toMatchObject({ date: "2026-05-02", created: 1, completed: 1 });
    expect(result[2]).toMatchObject({ date: "2026-05-03", created: 0, completed: 1 });
  });
});
