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
    expect(ankit?.departments).toEqual(["Operations"]);
    expect(priya?.departments).toEqual(["Underwriting"]);
  });

  // Regression: a multi-department person used to get one row PER department,
  // each counting ALL their tasks — so they appeared N times and every metric
  // column was inflated N×. The suite missed it because every other test here
  // omits `departmentMap`, which takes the single-department fallback path.
  describe("multi-department employees", () => {
    const ankitId = fixtureEmployees.find((e) => e.name === "Ankit Sharma")!.id;
    const departmentMap = new Map([
      [
        ankitId,
        [{ name: "Operations" }, { name: "Apps" }, { name: "Founder Office" }],
      ],
    ]);

    it("emits exactly ONE row per person regardless of department count", () => {
      const rows = computeEmployeeStatusTable(
        fixtureTasks,
        fixtureEmployees,
        "doer",
        departmentMap,
      );
      const ankitRows = rows.filter((r) => r.employeeId === ankitId);
      expect(ankitRows).toHaveLength(1);
      expect(ankitRows[0]!.departments).toEqual([
        "Operations",
        "Apps",
        "Founder Office",
      ]);
    });

    it("counts each task once — totals are not multiplied by department count", () => {
      const rows = computeEmployeeStatusTable(
        fixtureTasks,
        fixtureEmployees,
        "doer",
        departmentMap,
      );
      // Same figures as the no-map case: 3 departments must not treble them.
      expect(rows.find((r) => r.employeeId === ankitId)).toMatchObject({
        done: 5,
        approved: 2,
        total: 8,
      });
      // And the table as a whole still accounts for every fixture task exactly once.
      expect(rows.reduce((s, r) => s + r.total, 0)).toBe(fixtureTasks.length);
    });
  });
});
