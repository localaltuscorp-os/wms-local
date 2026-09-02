import { describe, it, expect } from "vitest";
import {
  computeAgingByDate,
  bucketForAge,
} from "@/lib/transforms/aging-buckets";
import { fixtureTasks, fixtureNow } from "../fixtures/tasks";

describe("bucketForAge", () => {
  it("maps 0 days -> 0-3", () => expect(bucketForAge(0)).toBe("0-3"));
  it("maps 7 days -> 4-7", () => expect(bucketForAge(7)).toBe("4-7"));
  it("maps 60 days -> 46-60", () => expect(bucketForAge(60)).toBe("46-60"));
  it("maps 61 days -> 60+", () => expect(bucketForAge(61)).toBe("60+"));
  it("maps 999 days -> 60+", () => expect(bucketForAge(999)).toBe("60+"));
});

describe("computeAgingByDate", () => {
  it("only counts pending tasks", () => {
    const result = computeAgingByDate(fixtureTasks, fixtureNow);
    const total = result.reduce((s, r) => s + r.count, 0);
    expect(total).toBe(3);
  });

  it("buckets pending tasks correctly", () => {
    const result = computeAgingByDate(fixtureTasks, fixtureNow);
    expect(result.find((r) => r.bucket === "8-14")?.count).toBe(1);
    expect(result.find((r) => r.bucket === "4-7")?.count).toBe(2);
  });
});
