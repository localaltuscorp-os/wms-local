import { describe, it, expect } from "vitest";
import { computeEmployeeAgingTable } from "@/lib/transforms/employee-aging-table";
import {
  fixtureTasks,
  fixtureEmployees,
  fixtureNow,
} from "../fixtures/tasks";

describe("computeEmployeeAgingTable", () => {
  it("only returns rows for employees with pending tasks", () => {
    const rows = computeEmployeeAgingTable(
      fixtureTasks,
      fixtureEmployees,
      fixtureNow,
    );
    expect(rows.length).toBe(2);
  });

  it("buckets correctly per employee", () => {
    const rows = computeEmployeeAgingTable(
      fixtureTasks,
      fixtureEmployees,
      fixtureNow,
    );
    const ankit = rows.find((r) => r.employeeName === "Ankit Sharma");
    expect(ankit?.buckets["8-14"]).toBe(1);
    expect(ankit?.total).toBe(1);

    const priya = rows.find((r) => r.employeeName === "Priya Iyer");
    expect(priya?.buckets["4-7"]).toBe(2);
    expect(priya?.total).toBe(2);
  });
});
