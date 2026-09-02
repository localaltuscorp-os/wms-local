import { describe, it, expect } from "vitest";
import {
  computeTrendSeries,
  computeTrendWindows,
  MIN_PCT_BASELINE,
  MAX_PCT_MAGNITUDE,
} from "@/lib/transforms/kpi-trend";

const now = new Date("2026-08-22T09:30:00Z");
const day = (iso: string) => new Date(`${iso}T06:00:00Z`);

describe("computeTrendSeries", () => {
  it("returns one dense point per day, oldest first, ending today", () => {
    const points = computeTrendSeries([], now, 14);
    expect(points).toHaveLength(14);
    expect(points[0]!.date).toBe("2026-08-09");
    expect(points[13]!.date).toBe("2026-08-22");
    // Dense, not sparse: the chart plots by index, so a quiet day must still
    // occupy its slot or every label after it points at the wrong date.
    expect(points.every((p) => p.created === 0 && p.completed === 0)).toBe(true);
  });

  it("buckets created and completed independently", () => {
    const points = computeTrendSeries(
      [{ createdAt: day("2026-08-12"), completedAt: day("2026-08-20") }],
      now,
      14,
    );
    const at = (d: string) => points.find((p) => p.date === d)!;
    expect(at("2026-08-12")).toMatchObject({ created: 1, completed: 0 });
    expect(at("2026-08-20")).toMatchObject({ created: 0, completed: 1 });
  });

  it("counts a task completed inside the window but created before it", () => {
    // The old sparkline scan keyed on created_at alone, so these rows — most of
    // a real week's throughput — never appeared in the completed series.
    const points = computeTrendSeries(
      [{ createdAt: day("2026-05-02"), completedAt: day("2026-08-18") }],
      now,
      14,
    );
    expect(points.find((p) => p.date === "2026-08-18")!.completed).toBe(1);
    expect(points.reduce((s, p) => s + p.created, 0)).toBe(0);
  });

  it("ignores days outside the window entirely", () => {
    const points = computeTrendSeries(
      [{ createdAt: day("2026-08-08"), completedAt: null }],
      now,
      14,
    );
    expect(points.reduce((s, p) => s + p.created, 0)).toBe(0);
  });
});

describe("computeTrendWindows", () => {
  const series = (createdPerDay: number[]) =>
    createdPerDay.map((created, i) => ({
      date: `2026-08-${String(9 + i).padStart(2, "0")}`,
      created,
      completed: 0,
    }));

  it("compares the last 7 days against the 7 before", () => {
    // previous week = 7 × 2 = 14, current week = 7 × 3 = 21 → +50%
    const w = computeTrendWindows(series([2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3]));
    expect(w).toMatchObject({ windowDays: 7, previous: 14, current: 21, changePct: 50 });
  });

  it("reports a fall as a negative percentage", () => {
    const w = computeTrendWindows(series([4, 4, 4, 4, 4, 4, 4, 1, 1, 1, 1, 1, 1, 1]));
    expect(w.changePct).toBe(-75);
  });

  it("returns null rather than a fake percentage when last week was empty", () => {
    // There is no percentage change from zero. The "+100%" a naive guard
    // produces makes one new task look like a doubling.
    const w = computeTrendWindows(series([0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0]));
    expect(w).toMatchObject({ previous: 0, current: 1, changePct: null });
  });

  it("suppresses the percentage when the baseline is under MIN_PCT_BASELINE", () => {
    // The "▲ 1155%" case. previous = 1, current = 12 is a true +1100%, and
    // printing it makes an ordinary week look like a broken metric.
    const w = computeTrendWindows(series([1, 0, 0, 0, 0, 0, 0, 12, 0, 0, 0, 0, 0, 0]));
    expect(w).toMatchObject({ previous: 1, current: 12, changePct: null });
  });

  it("keeps the percentage the moment the baseline reaches the floor", () => {
    // previous = 5 is the first baseline wide enough to divide by, so the
    // guard must not swallow it. 5 → 10 is a plain +100%.
    const w = computeTrendWindows(series([5, 0, 0, 0, 0, 0, 0, 10, 0, 0, 0, 0, 0, 0]));
    expect(w).toMatchObject({ previous: 5, current: 10, changePct: 100 });
    expect(MIN_PCT_BASELINE).toBe(5);
  });

  it("still suppresses at one task below the floor", () => {
    const w = computeTrendWindows(series([4, 0, 0, 0, 0, 0, 0, 8, 0, 0, 0, 0, 0, 0]));
    expect(w).toMatchObject({ previous: 4, changePct: null });
  });

  it("keeps a large-but-readable percentage under the cap", () => {
    // 22 -> 50 is +127%: over a doubling, still a figure a reader can act on.
    const w = computeTrendWindows(series([22, 0, 0, 0, 0, 0, 0, 50, 0, 0, 0, 0, 0, 0]));
    expect(w).toMatchObject({ previous: 22, current: 50 });
    expect(w.changePct).toBeCloseTo(127.3, 1);
  });

  it("still computes the raw percentage past the cap — the cap is a DISPLAY rule", () => {
    // 6 -> 64 is a true +967%. The transform reports it; formatTrendPct is what
    // decides not to print it (see MAX_PCT_MAGNITUDE). Keeping the maths honest
    // here means the number is still available to anything that wants it.
    const w = computeTrendWindows(series([6, 0, 0, 0, 0, 0, 0, 64, 0, 0, 0, 0, 0, 0]));
    expect(w).toMatchObject({ previous: 6, current: 64 });
    expect(w.changePct).toBeCloseTo(966.7, 1);
    expect(Math.abs(w.changePct!)).toBeGreaterThan(MAX_PCT_MAGNITUDE);
  });

  it("is flat, not null, when both windows match", () => {
    const w = computeTrendWindows(series([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]));
    expect(w.changePct).toBe(0);
  });

  it("can measure the completed series instead", () => {
    const points = series([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]).map((p, i) => ({
      ...p,
      completed: i < 7 ? 1 : 2,
    }));
    expect(computeTrendWindows(points, 7, "completed")).toMatchObject({
      previous: 7,
      current: 14,
      changePct: 100,
    });
  });
});
