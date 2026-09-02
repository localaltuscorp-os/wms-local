import { describe, it, expect } from "vitest";
import { computeEmployeeStatusTable } from "@/lib/transforms/employee-status-table";
import { fixtureTasks, fixtureEmployees } from "../fixtures/tasks";

describe("computeEmployeeStatusTable criticalCount", () => {
  it("counts only tasks with priority=imp_urgent", () => {
    const rows = computeEmployeeStatusTable(
      fixtureTasks,
      fixtureEmployees,
      "doer",
    );
    for (const r of rows) {
      expect(r.criticalCount).toBe(0); // fixture has no imp_urgent
    }
  });
});
