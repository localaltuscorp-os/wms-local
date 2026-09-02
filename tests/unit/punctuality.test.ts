import { describe, it, expect } from "vitest";
import type { Task } from "@/db/schema";
import { computePunctuality } from "@/lib/transforms/punctuality";

/** Minimal Task factory (mirrors the other transform tests). `dueAt` is the
 *  EFFECTIVE due the caller projects in (revised ?? original). */
function task(p: Partial<Task>): Task {
  return {
    id: crypto.randomUUID(),
    title: "t",
    description: null,
    estimatedMinutes: null,
    doerId: "d",
    initiatorId: "i",
    priority: "not_imp_urgent",
    status: "done",
    createdAt: new Date("2026-06-01"),
    dueAt: new Date("2026-06-10T12:00:00Z"),
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
    updatedAt: new Date("2026-06-01"),
    legacyImportKey: null,
    shortId: null,
    taskNo: null,
    tags: null,
    approvalStatus: null,
    // Two-stage approval (mig 0185) — defaults keep these fixtures on the
    // un-approved path, so no existing assertion changes meaning.
    approvalLevel: "none",
    managerApprovedById: null,
    managerApprovedAt: null,
    managerApprovalNote: null,
    adminApprovedById: null,
    adminApprovedAt: null,
    adminApprovalNote: null,
    revisedTargetDate: null,
    startsAt: null,
    endsAt: null,
    allDay: false,
    recurrence: null,
    recurrenceRule: null,
    recurrenceParentId: null,
    recurrenceOccurrenceDate: null,
    projectNodeId: null,
    originGoalId: null,
    searchText: null,
    calendarAttempts: 0,
    calendarNextAttemptAt: null,
    calendarLastSyncAt: null,
    calendarLastError: null,
    ambReferralId: null,
    abandonedAt: null,
    abandonedById: null,
    ...p,
  };
}

const names = new Map([
  ["alice", "Alice"],
  ["bob", "Bob"],
]);

describe("computePunctuality (D16)", () => {
  it("classifies on time when completed on/before the due DAY", () => {
    const tasks: Task[] = [
      // due 2026-06-10; finished same calendar day (later clock time) = on time
      task({ doerId: "alice", dueAt: new Date("2026-06-10T12:00:00Z"), completedAt: new Date("2026-06-10T18:30:00Z") }),
      // finished the day before = on time
      task({ doerId: "alice", completedAt: new Date("2026-06-09T09:00:00Z") }),
    ];
    const r = computePunctuality(tasks, names);
    expect(r.onTime).toBe(2);
    expect(r.late).toBe(0);
    expect(r.onTimeRate).toBe(100);
  });

  it("classifies late when completed after the due day", () => {
    const tasks: Task[] = [
      task({ doerId: "bob", dueAt: new Date("2026-06-10T12:00:00Z"), completedAt: new Date("2026-06-11T00:30:00Z") }),
    ];
    const r = computePunctuality(tasks, names);
    expect(r.late).toBe(1);
    expect(r.onTime).toBe(0);
    expect(r.onTimeRate).toBe(0);
  });

  it("uses the EFFECTIVE due passed in (revised) — caller projects the COALESCE", () => {
    // dueAt already carries the revised date 2026-06-20; completed 2026-06-15 = on time.
    const r = computePunctuality(
      [task({ dueAt: new Date("2026-06-20T12:00:00Z"), completedAt: new Date("2026-06-15T10:00:00Z") })],
      names,
    );
    expect(r.onTime).toBe(1);
  });

  it("excludes approved + archived; counts only live `done`", () => {
    const tasks: Task[] = [
      task({ status: "done", completedAt: new Date("2026-06-09") }),
      task({ status: "approved", completedAt: new Date("2026-06-09") }),
      task({ status: "done", archived: true, completedAt: new Date("2026-06-09") }),
      task({ status: "initiated" }),
    ];
    const r = computePunctuality(tasks, names);
    expect(r.total).toBe(1);
    expect(r.dated).toBe(1);
  });

  it("buckets done-without-completed_at as undated, excluded from the rate", () => {
    const tasks: Task[] = [
      task({ doerId: "alice", completedAt: new Date("2026-06-09") }), // on time
      task({ doerId: "alice", completedAt: null }), // undated
    ];
    const r = computePunctuality(tasks, names);
    expect(r.total).toBe(2);
    expect(r.undated).toBe(1);
    expect(r.dated).toBe(1);
    expect(r.onTimeRate).toBe(100);
  });

  it("builds a per-person breakdown, busiest first, with names + rate", () => {
    const tasks: Task[] = [
      task({ doerId: "alice", completedAt: new Date("2026-06-09") }), // on time
      task({ doerId: "alice", dueAt: new Date("2026-06-10T12:00:00Z"), completedAt: new Date("2026-06-12") }), // late
      task({ doerId: "bob", completedAt: new Date("2026-06-09") }), // on time
    ];
    const r = computePunctuality(tasks, names);
    expect(r.byPerson[0]?.employeeName).toBe("Alice"); // 2 done → busiest first
    expect(r.byPerson[0]?.done).toBe(2);
    expect(r.byPerson[0]?.onTime).toBe(1);
    expect(r.byPerson[0]?.late).toBe(1);
    expect(r.byPerson[0]?.rate).toBe(50);
    expect(r.byPerson[1]?.employeeName).toBe("Bob");
  });

  it("tolerates a STRING dueAt (the dashboard projects it via a raw COALESCE SQL fragment → drizzle returns text, not a Date)", () => {
    const tasks: Task[] = [
      // dueAt arrives as a postgres timestamptz string; must not throw.
      task({
        doerId: "alice",
        dueAt: "2026-06-10 12:00:00+00" as unknown as Date,
        completedAt: new Date("2026-06-10T18:00:00Z"), // same UTC day → on time
      }),
      task({
        doerId: "alice",
        dueAt: "2026-06-10 12:00:00+00" as unknown as Date,
        completedAt: new Date("2026-06-11T01:00:00Z"), // next day → late
      }),
    ];
    const r = computePunctuality(tasks, names);
    expect(r.onTime).toBe(1);
    expect(r.late).toBe(1);
  });

  it("is empty-safe (no done tasks)", () => {
    const r = computePunctuality([task({ status: "initiated" })], names);
    expect(r).toMatchObject({ total: 0, dated: 0, onTime: 0, late: 0, undated: 0, onTimeRate: 0 });
    expect(r.byPerson).toEqual([]);
  });
});
