import { describe, it, expect } from "vitest";
import { computeEmployeeStatusTable } from "@/lib/transforms/employee-status-table";
import { fixtureTasks, fixtureEmployees } from "../fixtures/tasks";

describe("computeEmployeeStatusTable (by doer)", () => {
  it("aggregates Ankit's tasks correctly", () => {
    const rows = computeEmployeeStatusTable(
      fixtureTasks,
      fixtureEmployees,
      "doer",
    );
    const ankit = rows.find((r) => r.employeeName === "Ankit Sharma");
    expect(ankit).toMatchObject({
      done: 5,
      approved: 2,
      initiated: 1,
      total: 8,
      pendingTotal: 1,
    });
  });

  it("aggregates Priya's tasks correctly", () => {
    const rows = computeEmployeeStatusTable(
      fixtureTasks,
      fixtureEmployees,
      "doer",
    );
    const priya = rows.find((r) => r.employeeName === "Priya Iyer");
    expect(priya).toMatchObject({
      done: 3,
      cancelled: 1,
      needHelp: 1,
      followUp: 1,
      total: 6,
      pendingTotal: 2,
    });
  });

  it("row totals sum to fixture length", () => {
    const rows = computeEmployeeStatusTable(
      fixtureTasks,
      fixtureEmployees,
      "doer",
    );
    const total = rows.reduce((s, r) => s + r.total, 0);
    expect(total).toBe(fixtureTasks.length);
  });

  it("projects each employee's department through to their row", () => {
    const rows = computeEmployeeStatusTable(
      fixtureTasks,
      fixtureEmployees,
      "doer",
    );
    const ankit = rows.find((r) => r.employeeName === "Ankit Sharma");
    const priya = rows.find((r) => r.employeeName === "Priya Iyer");
    expect(ankit?.department).toBe("Operations");
    expect(priya?.department).toBe("Underwriting");
  });
});
