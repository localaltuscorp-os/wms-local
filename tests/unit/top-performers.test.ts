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
