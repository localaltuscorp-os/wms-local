import { describe, it, expect } from "vitest";
import { computeNotApprovedAging, type NotApprovedInput } from "@/lib/transforms/not-approved-aging";

const now = new Date("2026-06-20T12:00:00Z");
const names = new Map([["u1", "Alice"], ["u2", "Bob"]]);

describe("computeNotApprovedAging", () => {
  it("groups by doer, oldest-waiting first, buckets waiting days", () => {
    const rows: NotApprovedInput[] = [
      { id: "t1", title: "A", doerId: "u1", sentBackAt: "2026-06-11" }, // 9 days → w8_14
      { id: "t2", title: "B", doerId: "u1", sentBackAt: "2026-06-19" }, // 1 day  → w1
      { id: "t3", title: "C", doerId: "u2", sentBackAt: "2026-06-20" }, // 0 days → w0
    ];
    const r = computeNotApprovedAging(rows, names, now);
    expect(r.total).toBe(3);
    expect(r.byPerson[0]?.employeeName).toBe("Alice"); // 2 tasks, has the oldest
    expect(r.byPerson[0]?.count).toBe(2);
    expect(r.byPerson[0]?.tasks[0]?.waitingDays).toBe(9); // oldest first within person
    expect(r.bands.find((b) => b.id === "w8_14")?.count).toBe(1);
    expect(r.bands).toHaveLength(7);
  });
  it("a null sentBackAt is treated as 0 days waiting", () => {
    const r = computeNotApprovedAging([{ id: "t", title: "T", doerId: "u1", sentBackAt: null }], names, now);
    expect(r.byPerson[0]?.tasks[0]?.waitingDays).toBe(0);
  });
});
