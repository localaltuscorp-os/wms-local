import { describe, it, expect } from "vitest";
import {
  deliveryOf,
  delegationDelta,
  avgAgingDays,
  statusDonut,
} from "@/lib/transforms/manager-drilldown";

describe("deliveryOf", () => {
  const now = new Date("2026-06-21T08:00:00Z"); // today = 2026-06-21

  it("done & completed on the due day → on_time", () => {
    expect(
      deliveryOf(
        {
          status: "done",
          dueAt: "2026-06-20",
          completedAt: "2026-06-20T23:00:00Z",
        },
        now,
      ),
    ).toBe("on_time");
  });

  it("done & completed before the due day → on_time", () => {
    expect(
      deliveryOf(
        {
          status: "done",
          dueAt: "2026-06-20",
          completedAt: "2026-06-18T10:00:00Z",
        },
        now,
      ),
    ).toBe("on_time");
  });

  it("done & completed 1 day after the due day → late", () => {
    expect(
      deliveryOf(
        {
          status: "done",
          dueAt: "2026-06-19",
          completedAt: "2026-06-20T01:00:00Z",
        },
        now,
      ),
    ).toBe("late");
  });

  it("open & 2 days overdue → aging", () => {
    expect(
      deliveryOf(
        { status: "in_progress", dueAt: "2026-06-19", completedAt: null },
        now,
      ),
    ).toBe("aging");
  });

  it("open & due today → on_time (not past due)", () => {
    expect(
      deliveryOf(
        { status: "in_progress", dueAt: "2026-06-21", completedAt: null },
        now,
      ),
    ).toBe("on_time");
  });

  it("open & due tomorrow → on_time", () => {
    expect(
      deliveryOf(
        { status: "pending", dueAt: "2026-06-22", completedAt: null },
        now,
      ),
    ).toBe("on_time");
  });

  it("done with null completedAt, not past due → on_time (falls through to open rule)", () => {
    expect(
      deliveryOf(
        { status: "done", dueAt: "2026-06-22", completedAt: null },
        now,
      ),
    ).toBe("on_time");
  });

  it("done with null completedAt, past due → aging (falls through to open rule)", () => {
    expect(
      deliveryOf(
        { status: "done", dueAt: "2026-06-19", completedAt: null },
        now,
      ),
    ).toBe("aging");
  });

  it("accepts Date objects too", () => {
    expect(
      deliveryOf(
        {
          status: "done",
          dueAt: new Date("2026-06-20T00:00:00Z"),
          completedAt: new Date("2026-06-21T05:00:00Z"),
        },
        now,
      ),
    ).toBe("late");
  });
});

describe("delegationDelta", () => {
  it("84 vs 80 → pct 84, deltaPct +4", () => {
    expect(delegationDelta(84, 80)).toEqual({ pct: 84, deltaPct: 4 });
  });

  it("negative delta when current is lower", () => {
    expect(delegationDelta(70, 90)).toEqual({ pct: 70, deltaPct: -20 });
  });

  it("zero delta when equal", () => {
    expect(delegationDelta(50, 50)).toEqual({ pct: 50, deltaPct: 0 });
  });
});

describe("avgAgingDays", () => {
  const now = new Date("2026-06-21T08:00:00Z"); // today = 2026-06-21

  it("returns 0 for an empty list", () => {
    expect(avgAgingDays([], now)).toBe(0);
  });

  it("created 2 and 4 days ago → mean 3", () => {
    expect(avgAgingDays(["2026-06-19", "2026-06-17"], now)).toBe(3);
  });

  it("rounds the mean to a whole number", () => {
    // 1, 2, 4 days ago → mean 2.33 → 2
    expect(
      avgAgingDays(["2026-06-20", "2026-06-19", "2026-06-17"], now),
    ).toBe(2);
  });

  it("accepts Date objects", () => {
    expect(
      avgAgingDays(
        [new Date("2026-06-20T05:00:00Z"), new Date("2026-06-18T22:00:00Z")],
        now,
      ),
    ).toBe(2); // 1 and 3 days ago → mean 2
  });
});

describe("statusDonut", () => {
  const now = new Date("2026-06-21T08:00:00Z"); // today = 2026-06-21

  it("classifies a mix into onTime/late/aging plus total done", () => {
    const tasks = [
      // done on time
      { status: "done", dueAt: "2026-06-20", completedAt: "2026-06-20T10:00:00Z" },
      // done late
      { status: "done", dueAt: "2026-06-18", completedAt: "2026-06-20T10:00:00Z" },
      // done late
      { status: "done", dueAt: "2026-06-15", completedAt: "2026-06-19T10:00:00Z" },
      // open, overdue → aging
      { status: "in_progress", dueAt: "2026-06-19", completedAt: null },
      // open, due tomorrow → on_time
      { status: "pending", dueAt: "2026-06-22", completedAt: null },
    ];
    expect(statusDonut(tasks, now)).toEqual({
      onTime: 2, // 1 done-on-time + 1 open-not-past-due
      late: 2,
      aging: 1,
      done: 3, // total done regardless of on_time/late split
    });
  });

  it("empty input → all zeros", () => {
    expect(statusDonut([], now)).toEqual({
      onTime: 0,
      late: 0,
      aging: 0,
      done: 0,
    });
  });
});
