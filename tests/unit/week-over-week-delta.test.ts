import { describe, it, expect } from "vitest";
import {
  countInRange,
  computeWeekOverWeekDelta,
  computeDailySparkline,
} from "@/lib/transforms/week-over-week-delta";
import type { Task } from "@/db/schema";

function task(partial: Partial<Task>): Task {
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
    ...partial,
  };
}

describe("countInRange", () => {
  it("counts tasks within [start, end)", () => {
    const tasks: Task[] = [
      task({ createdAt: new Date("2026-04-25") }),
      task({ createdAt: new Date("2026-05-01") }),
      task({ createdAt: new Date("2026-05-04") }),
      task({ createdAt: new Date("2026-05-08") }),
    ];
    expect(
      countInRange(tasks, new Date("2026-05-01"), new Date("2026-05-08")),
    ).toBe(2);
  });
});

describe("computeWeekOverWeekDelta", () => {
  it("splits at week boundary (current = last 7d, previous = 7d before that)", () => {
    const now = new Date("2026-05-15");
    // current window  = [2026-05-08, 2026-05-15)
    // previous window = [2026-05-01, 2026-05-08)
    const tasks: Task[] = [
      task({ createdAt: new Date("2026-05-04") }), // previous
      task({ createdAt: new Date("2026-05-09") }), // current
      task({ createdAt: new Date("2026-05-12") }), // current
      task({ createdAt: new Date("2026-05-14") }), // current
    ];
    const result = computeWeekOverWeekDelta(tasks, now);
    expect(result.current).toBe(3);
    expect(result.previous).toBe(1);
  });
});

describe("computeDailySparkline", () => {
  it("returns 14 daily counts ending at now", () => {
    const now = new Date("2026-05-14T12:00:00Z");
    const tasks: Task[] = [
      task({ createdAt: new Date("2026-05-14T03:00:00Z") }),
      task({ createdAt: new Date("2026-05-14T05:00:00Z") }),
      task({ createdAt: new Date("2026-05-13T10:00:00Z") }),
      task({ createdAt: new Date("2026-04-30T10:00:00Z") }),
    ];
    const sparkline = computeDailySparkline(tasks, now, 14);
    expect(sparkline.length).toBe(14);
    expect(sparkline[13]).toBe(2);
    expect(sparkline[12]).toBe(1);
    expect(sparkline.slice(0, 12).every((n) => n === 0)).toBe(true);
  });
});
