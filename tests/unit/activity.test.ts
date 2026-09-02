import { describe, it, expect } from "vitest";
import {
  parseActivityFilters,
  groupByDay,
  type ActivityRow,
} from "@/lib/transforms/activity";

function makeRow(over: Partial<ActivityRow>): ActivityRow {
  return {
    id: over.id ?? crypto.randomUUID(),
    source: over.source ?? "task",
    taskId: over.taskId ?? "00000000-0000-0000-0000-000000000001",
    taskSubject: over.taskSubject ?? "Test subject",
    taskTitle: over.taskTitle ?? "Test title",
    taskStatus: over.taskStatus ?? "not_started",
    targetEmployeeId: over.targetEmployeeId ?? null,
    targetEmployeeName: over.targetEmployeeName ?? null,
    settingScope: over.settingScope ?? null,
    settingTargetId: over.settingTargetId ?? null,
    actorId: over.actorId ?? "00000000-0000-0000-0000-000000000aaa",
    actorName: over.actorName ?? "Alice",
    actorAvatarUrl: over.actorAvatarUrl ?? null,
    eventType: over.eventType ?? "created",
    fromValue: over.fromValue ?? null,
    toValue: over.toValue ?? null,
    note: over.note ?? null,
    createdAt: over.createdAt ?? new Date("2026-05-13T12:00:00Z"),
  };
}

describe("parseActivityFilters", () => {
  it("returns empty filters for an empty query string", () => {
    const f = parseActivityFilters({});
    expect(f).toEqual({
      before: null,
      actorIds: [],
      kinds: [],
      source: [],
      from: null,
      to: null,
    });
  });

  it("splits comma-separated actor and kind params", () => {
    const f = parseActivityFilters({
      actor: "id-a,id-b",
      kind: "created,status_changed",
    });
    expect(f.actorIds).toEqual(["id-a", "id-b"]);
    expect(f.kinds).toEqual(["created", "status_changed"]);
  });

  it("drops unknown event kinds silently", () => {
    const f = parseActivityFilters({ kind: "created,bogus,commented" });
    expect(f.kinds).toEqual(["created", "commented"]);
  });

  it("parses ISO dates for before/from/to", () => {
    const f = parseActivityFilters({
      before: "2026-05-14T00:00:00Z",
      from: "2026-05-01",
      to: "2026-05-14",
    });
    expect(f.before?.toISOString()).toBe("2026-05-14T00:00:00.000Z");
    expect(f.from?.toISOString().slice(0, 10)).toBe("2026-05-01");
    expect(f.to?.toISOString().slice(0, 10)).toBe("2026-05-14");
  });

  it("treats malformed dates as null", () => {
    const f = parseActivityFilters({ before: "not-a-date" });
    expect(f.before).toBeNull();
  });

  it("normalises array-valued params (Next searchParams quirk) to first entry", () => {
    const f = parseActivityFilters({ actor: ["foo,bar", "ignored"] });
    expect(f.actorIds).toEqual(["foo", "bar"]);
  });
});

describe("groupByDay", () => {
  it("returns an empty list for no rows", () => {
    expect(groupByDay([])).toEqual([]);
  });

  it("buckets rows into the same day and preserves their incoming order", () => {
    // Construct dates in *local time* so the test isn't timezone-dependent.
    // groupByDay() keys on the local-day yyyy-MM-dd via date-fns format.
    const t1 = new Date(2026, 4, 13, 9, 0, 0);
    const t2 = new Date(2026, 4, 13, 8, 0, 0);
    const t3 = new Date(2026, 4, 12, 22, 0, 0);
    const rows = [
      makeRow({ id: "r1", createdAt: t1 }),
      makeRow({ id: "r2", createdAt: t2 }),
      makeRow({ id: "r3", createdAt: t3 }),
    ];
    const groups = groupByDay(rows);
    expect(groups).toHaveLength(2);
    expect(groups[0]?.events.map((e) => e.id)).toEqual(["r1", "r2"]);
    expect(groups[1]?.events.map((e) => e.id)).toEqual(["r3"]);
  });

  it("labels older dates as MMM d, yyyy", () => {
    const old = new Date("2024-01-15T12:00:00Z");
    const groups = groupByDay([makeRow({ createdAt: old })]);
    expect(groups[0]?.label).toMatch(/Jan 15, 2024/);
  });
});
