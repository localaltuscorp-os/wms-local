import { describe, it, expect } from "vitest";
import { taskMetricDelta } from "@/lib/projections/task-metrics-rule";
import { deriveCommands } from "@/lib/commands/derive";
import { upcast } from "@/lib/events/upcasters";
import {
  TASK_AGGREGATE,
  TaskEventTypes,
  type StoredEvent,
} from "@/lib/events/types";

function ev(partial: Partial<StoredEvent> & { eventType: string; payload: Record<string, unknown> }): StoredEvent {
  return {
    seq: 1,
    eventId: "00000000-0000-0000-0000-000000000001",
    aggregateType: TASK_AGGREGATE,
    aggregateId: "11111111-1111-1111-1111-111111111111",
    eventVersion: 1,
    orgId: null,
    correlationId: null,
    causationId: null,
    actorId: "22222222-2222-2222-2222-222222222222",
    occurredAt: new Date("2026-06-29T10:00:00Z"),
    ...partial,
  };
}

describe("taskMetricDelta — the pure projection rule", () => {
  it("counts a creation under createdCount for the doer + event day", () => {
    const d = taskMetricDelta(ev({ eventType: TaskEventTypes.Created, payload: { doerId: "doe" } }));
    expect(d).toEqual({ day: "2026-06-29", doerId: "doe", column: "createdCount" });
  });

  it("maps status transitions into the right counter", () => {
    const done = taskMetricDelta(ev({ eventType: TaskEventTypes.StatusChanged, payload: { doerId: "x", toStatus: "done" } }));
    expect(done?.column).toBe("doneCount");
    const appr = taskMetricDelta(ev({ eventType: TaskEventTypes.StatusChanged, payload: { doerId: "x", toStatus: "approved" } }));
    expect(appr?.column).toBe("approvedCount");
    const na = taskMetricDelta(ev({ eventType: TaskEventTypes.StatusChanged, payload: { doerId: "x", toStatus: "not_approved" } }));
    expect(na?.column).toBe("notApprovedCount");
  });

  it("ignores non-counting transitions and non-task events", () => {
    expect(taskMetricDelta(ev({ eventType: TaskEventTypes.StatusChanged, payload: { doerId: "x", toStatus: "in_progress" } }))).toBeNull();
    expect(taskMetricDelta(ev({ eventType: TaskEventTypes.Archived, payload: { doerId: "x" } }))).toBeNull();
    expect(taskMetricDelta(ev({ aggregateType: "goal", eventType: TaskEventTypes.Created, payload: { doerId: "x" } }))).toBeNull();
  });

  it("counts ApprovalDecided by decision", () => {
    expect(taskMetricDelta(ev({ eventType: TaskEventTypes.ApprovalDecided, payload: { doerId: "x", decision: "approved" } }))?.column).toBe("approvedCount");
    expect(taskMetricDelta(ev({ eventType: TaskEventTypes.ApprovalDecided, payload: { doerId: "x", decision: "not_approved" } }))?.column).toBe("notApprovedCount");
  });

  it("skips events with a blank doer (matches the handler's guard)", () => {
    expect(taskMetricDelta(ev({ eventType: TaskEventTypes.Created, payload: { doerId: "" } }))).toBeNull();
    expect(taskMetricDelta(ev({ eventType: TaskEventTypes.Created, payload: {} }))).toBeNull();
  });

  it("buckets by the UTC day of occurrence", () => {
    const d = taskMetricDelta(ev({ eventType: TaskEventTypes.Created, payload: { doerId: "x" }, occurredAt: new Date("2026-06-29T23:30:00Z") }));
    expect(d?.day).toBe("2026-06-29");
  });
});

describe("deriveCommands — exactly-once dedupe keys (Law 8)", () => {
  it("derives a notify command for a reassign to a new doer", () => {
    const cmds = deriveCommands(ev({ eventType: TaskEventTypes.Reassigned, payload: { fromDoerId: "a", toDoerId: "b", resetStatus: false } }));
    expect(cmds).toHaveLength(1);
    expect(cmds[0]?.commandType).toBe("notify");
    expect(cmds[0]?.payload.userId).toBe("b");
  });

  it("produces a STABLE dedupe key for the same event (replay-safe)", () => {
    const e = ev({ eventType: TaskEventTypes.Reassigned, eventId: "abc", payload: { toDoerId: "b" } });
    const k1 = deriveCommands(e)[0]?.dedupeKey;
    const k2 = deriveCommands(e)[0]?.dedupeKey; // same event re-processed/replayed
    expect(k1).toBe(k2);
    expect(k1).toBe("abc:notify:b");
  });

  it("derives nothing for events without an external effect", () => {
    expect(deriveCommands(ev({ eventType: TaskEventTypes.Created, payload: { doerId: "x" } }))).toEqual([]);
    expect(deriveCommands(ev({ eventType: TaskEventTypes.StatusChanged, payload: { doerId: "x", toStatus: "done" } }))).toEqual([]);
  });
});

describe("upcast — versioning seam (Law 3)", () => {
  it("is the identity when no upcaster is registered", () => {
    const e = ev({ eventType: TaskEventTypes.Created, payload: { doerId: "x" } });
    expect(upcast(e)).toBe(e);
  });
});
