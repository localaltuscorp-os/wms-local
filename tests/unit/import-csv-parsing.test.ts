import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  LegacyEmployeeRowSchema,
  LegacyTaskRowSchema,
  parseLegacyEmployees,
  parseLegacyTasks,
} from "@/lib/import/csv-schemas";

void LegacyEmployeeRowSchema;
void LegacyTaskRowSchema;

const empCsv = readFileSync("tests/fixtures/legacy-employees.csv", "utf8");
const taskCsv = readFileSync("tests/fixtures/legacy-tasks.csv", "utf8");

describe("parseLegacyEmployees", () => {
  it("parses 3 rows from the fixture", () => {
    const { rows, errors } = parseLegacyEmployees(empCsv);
    expect(rows).toHaveLength(3);
    expect(errors).toHaveLength(0);
    expect(rows[0]!.email).toBe("pravin@vpinnacle.com");
    expect(rows[0]!.isAdmin).toBe(true);
    expect(rows[2]!.isAdmin).toBe(false);
  });

  it("rejects rows missing required fields", () => {
    const bad = "name,email,role,department,is_admin\n,,,,,";
    const { rows, errors } = parseLegacyEmployees(bad);
    expect(rows).toHaveLength(0);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe("parseLegacyTasks", () => {
  it("parses 2 rows from the fixture", () => {
    const { rows, errors } = parseLegacyTasks(taskCsv);
    expect(rows).toHaveLength(2);
    expect(errors).toHaveLength(0);
    expect(rows[0]!.status).toBe("Done");
    expect(rows[0]!.priority).toBe("imp_urgent");
    expect(rows[1]!.priority).toBeNull();
  });
});
