import { describe, it, expect } from "vitest";
import { computeTopPerformers } from "@/lib/transforms/top-performers";
import {
  fixtureTasks,
  fixtureEmployees,
  fixtureNow,
} from "../fixtures/tasks";

describe("computeTopPerformers", () => {
  it("ranks by done+approved descending", () => {
    const result = computeTopPerformers(
      fixtureTasks,
      fixtureEmployees,
      fixtureNow,
      5,
    );
    expect(result[0]?.employeeName).toBe("Ankit Sharma");
    expect(result[0]?.doneCount).toBe(7);
    expect(result[1]?.employeeName).toBe("Priya Iyer");
    expect(result[1]?.doneCount).toBe(3);
  });

  it("respects the limit", () => {
    const result = computeTopPerformers(
      fixtureTasks,
      fixtureEmployees,
      fixtureNow,
      2,
    );
    expect(result.length).toBeLessThanOrEqual(2);
  });

  it("each performer has 7-element sparkline", () => {
    const result = computeTopPerformers(
      fixtureTasks,
      fixtureEmployees,
      fixtureNow,
      5,
    );
    for (const p of result) {
      expect(p.weeklySparkline.length).toBe(7);
    }
  });
});

/* ── Dense sequential ranking + tie-breakers (Option A) ─────────────────── */

const NOW = new Date("2026-08-10T12:00:00Z");

/** Minimal completed task; `due` null ⇒ unmeasurable for the on-time rate. */
function task(doerId: string, created: string, completed: string, due: string | null) {
  return {
    doerId,
    status: "done",
    createdAt: new Date(created),
    completedAt: new Date(completed),
    dueAt: due ? new Date(due) : null,
  } as never;
}
const emp = (id: string, name: string) =>
  ({ id, name, department: null }) as never;

describe("tie-breaking and rank sequence", () => {
  it("breaks a count tie by on-time rate, then turnaround, and keeps ranks unique", () => {
    // Raj and Proveeka both complete 2. Raj is 2/2 on time; Proveeka 1/2.
    const rows = computeTopPerformers(
      [
        task("raj", "2026-08-01", "2026-08-02", "2026-08-03"), // on time
        task("raj", "2026-08-01", "2026-08-02", "2026-08-03"), // on time
        task("pro", "2026-08-01", "2026-08-02", "2026-08-03"), // on time
        task("pro", "2026-08-01", "2026-08-09", "2026-08-03"), // late
      ],
      [emp("raj", "Raj"), emp("pro", "Proveeka")],
      NOW,
      10,
    );

    expect(rows.map((r) => r.employeeName)).toEqual(["Raj", "Proveeka"]);
    // Sequential and unique — never 1, 1 or 1, 3.
    expect(rows.map((r) => r.rank)).toEqual([1, 2]);
    expect(rows[0]?.onTimeRate).toBe(100);
    expect(rows[1]?.onTimeRate).toBe(50);
  });

  it("ranks every position uniquely and without gaps", () => {
    const rows = computeTopPerformers(
      [
        task("a", "2026-08-01", "2026-08-02", "2026-08-03"),
        task("b", "2026-08-01", "2026-08-02", "2026-08-03"),
        task("c", "2026-08-01", "2026-08-02", "2026-08-03"),
      ],
      [emp("a", "Aaa"), emp("b", "Bbb"), emp("c", "Ccc")],
      NOW,
      10,
    );
    // All three tie on every metric, so the name breaks it — but the RANKS are
    // still 1,2,3 rather than 1,1,1 (which is what produced "#4, #4, #6").
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3]);
    expect(new Set(rows.map((r) => r.rank)).size).toBe(3);
  });

  it("reports N/A, not 0%, when nothing is measurable", () => {
    const [row] = computeTopPerformers(
      [task("x", "2026-08-01", "2026-08-02", null)], // completed, but never dated
      [emp("x", "Xavier")],
      NOW,
      10,
    );
    expect(row?.doneCount).toBe(1);
    expect(row?.datedCompletions).toBe(0);
    expect(row?.onTimeRate).toBeNull(); // ⇒ the UI prints "N/A"
  });

  it("reports a real 0% when work WAS measurable and all of it was late", () => {
    const [row] = computeTopPerformers(
      [task("y", "2026-08-01", "2026-08-09", "2026-08-03")],
      [emp("y", "Yasmin")],
      NOW,
      10,
    );
    expect(row?.datedCompletions).toBe(1);
    expect(row?.completedOnTime).toBe(0);
    expect(row?.onTimeRate).toBe(0);
  });
});
