import { describe, expect, it } from "vitest";
import { codeOf } from "../fixtures/source-code";

const DESIGNATIONS = [
  "Intern - First Year", "Intern - Second Year", "Intern - Third Year",
  "Executive", "Sr. Executive", "Consultant", "Sr. Consultant",
  "Assistant Manager", "Deputy Manager", "Manager", "AVP", "DVP", "VP",
  "SVP", "President", "Sr President", "AGM", "GM", "Sr GM",
  "Associate Director", "Deputy Director", "Senior Director", "CEO",
  "Managing Director", "Chairman",
];

describe("Employee Master Function and Designation masters", () => {
  const migration = codeOf("db/migrations/0267_employee_master_function_designation_values.sql");
  const query = codeOf("lib/employees/master-query.ts");
  const workspace = codeOf("components/admin/employee-master/workspace.tsx");
  const table = codeOf("components/admin/employee-master/master-table.tsx");

  it("stores required Designations in exact order", () => {
    const names = DESIGNATIONS.map((name) => `'${name}'`).join("\\s*,\\s*");
    expect(migration).toMatch(new RegExp(names));
  });

  it("uses Admin master tables for both selectors", () => {
    expect(query).toMatch(/from\(functions\)/);
    expect(query).toMatch(/from\(designations\)/);
    expect(query).toMatch(/orderBy\(asc\(functions\.sortOrder\), asc\(functions\.name\)\)/);
    expect(query).toMatch(/orderBy\(asc\(designations\.sortOrder\), asc\(designations\.name\)\)/);
    expect(workspace).toMatch(/options\.functions/);
    expect(workspace).toMatch(/options\.designations/);
    expect(table).toMatch(/options\.functions/);
    expect(table).toMatch(/options\.designations/);
  });

  it("keeps referenced legacy values active instead of deleting them", () => {
    expect(migration).toMatch(/NOT EXISTS \(SELECT 1 FROM employees e WHERE e\.department_id = f\.id\)/);
    expect(migration).toMatch(/NOT EXISTS \(SELECT 1 FROM employees e WHERE e\.designation_id = d\.id\)/);
    expect(migration).not.toMatch(/DELETE FROM (functions|designations)/i);
  });
});
