import { describe, expect, it } from "vitest";
import { codeOf } from "../fixtures/source-code";

describe("employee backend regression fixes", () => {
  const actions = codeOf("app/(admin)/admin/employees/actions.ts");
  const salary = codeOf("app/(admin)/admin/salary-profiles/actions.ts");

  it("returns success when only a grant changed", () => {
    expect(actions).toContain("let grantChanged = false;");
    expect(actions).toMatch(/grantChanged = true;/);
    expect(actions).toMatch(/if \(grantChanged\)[\s\S]*?return \{ ok: true \};/);
  });

  it("forwards bulk internship fields into editEmployee", () => {
    expect(actions).toContain("fields.internshipStart = p.internshipStart;");
    expect(actions).toContain("fields.employeeType = p.employeeType;");
  });

  it("requires internship start after an employee becomes an intern", () => {
    expect(actions).toContain('error: "Set the Internship Start Date for an intern."');
    expect(actions).toMatch(/effectiveType === "intern" && internshipStartAfter == null/);
  });

  it("syncs salary breakup entity in salary profile transaction", () => {
    expect(salary).toContain("salaryCtcBreakup");
    expect(salary).toContain("set({ payingEntityId: data.payingEntityId })");
  });

  it("checks protected financial history before employee deletion", () => {
    for (const table of [
      "salaryProfiles", "salaryCtcBreakup", "salaryAdvances", "salaryRuns",
      "salaryBreakup", "salaryPayments", "incentiveRequests", "incentiveEntries",
      "incentiveProjects", "incentiveParticipants", "incentivePayoutEvents",
      "compensationApprovals",
    ]) {
      expect(actions, table).toContain(`from(${table})`);
    }
    const guard = actions.indexOf("protected financial history exists");
    const hardDelete = actions.indexOf("tx.delete(employees)");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(hardDelete);
  });
});
