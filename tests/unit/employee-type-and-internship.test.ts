import { describe, it, expect } from "vitest";
import {
  EMPLOYEE_KIND_OPTIONS,
  isEmployeeTypeCode,
  isIntern,
  resolveEmployeeType,
} from "@/lib/employees/employee-type";
import { EditEmployeeSchema, BulkEditEmployeesSchema } from "@/lib/validators/employee";
import { codeOf } from "../fixtures/source-code";

/**
 * EMPLOYEE TYPE, THE INTERN RULE, AND THE TWO DATES IT DRIVES (0244).
 *
 * Two kinds of assertion:
 *   1. the resolver answers correctly, including when a value it reads from the
 *      database is not one of the two codes, and
 *   2. NO CODE reads a designation's NAME to decide intern status — the one
 *      matching that ever existed is inside migration 0244, which materialised
 *      it into a column. That is a property of the source, so it is asserted on
 *      the source.
 */

describe("resolveEmployeeType", () => {
  it("lets the person's own override win", () => {
    expect(resolveEmployeeType({ override: "intern", designationType: "employee" })).toBe("intern");
    expect(resolveEmployeeType({ override: "employee", designationType: "intern" })).toBe("employee");
  });

  it("falls through to the designation when there is no override", () => {
    expect(resolveEmployeeType({ override: null, designationType: "intern" })).toBe("intern");
    expect(resolveEmployeeType({ override: undefined, designationType: "intern" })).toBe("intern");
    expect(resolveEmployeeType({ override: null, designationType: "employee" })).toBe("employee");
  });

  it("treats 'no designation' as an employee, not as an intern", () => {
    // Nobody is an intern by accident. An unset designation is an incomplete
    // record, not a statement that the person is on an internship.
    expect(resolveEmployeeType({ override: null, designationType: null })).toBe("employee");
    expect(resolveEmployeeType({})).toBe("employee");
  });

  it("IGNORES a value that is neither code, rather than trusting its type", () => {
    // The columns are text + CHECK, and these two functions run against rows
    // read from the database. A value from an older row must not be returned
    // just because the parameter is typed as the union.
    expect(resolveEmployeeType({ override: "INTERN", designationType: "intern" })).toBe("intern");
    expect(resolveEmployeeType({ override: "contractor", designationType: null })).toBe("employee");
    expect(resolveEmployeeType({ override: null, designationType: "" })).toBe("employee");
  });

  it("is the same answer isIntern reads off a resolved type", () => {
    expect(isIntern({ employeeType: "intern" })).toBe(true);
    expect(isIntern({ employeeType: "employee" })).toBe(false);
    // An unset value is an employee — the same default the resolver uses, so the
    // two cannot disagree.
    expect(isIntern({})).toBe(false);
    expect(isIntern({ employeeType: null })).toBe(false);
  });
});

describe("the employee-type vocabulary", () => {
  it("offers exactly the two kinds, employee first", () => {
    expect(EMPLOYEE_KIND_OPTIONS.map((o) => o.value)).toEqual(["employee", "intern"]);
    expect(EMPLOYEE_KIND_OPTIONS.map((o) => o.label)).toEqual(["Employee", "Intern"]);
  });

  it("recognises only the two codes", () => {
    expect(isEmployeeTypeCode("employee")).toBe(true);
    expect(isEmployeeTypeCode("intern")).toBe(true);
    expect(isEmployeeTypeCode("Intern")).toBe(false);
    expect(isEmployeeTypeCode(null)).toBe(false);
    expect(isEmployeeTypeCode(7)).toBe(false);
  });
});

describe("the edit schemas carry the two new fields", () => {
  it("accepts an internship start date and an employee-type override", () => {
    const single = EditEmployeeSchema.safeParse({
      internshipStart: "2026-09-01",
      employeeType: "intern",
    });
    expect(single.success).toBe(true);
    const bulk = BulkEditEmployeesSchema.safeParse({
      internshipStart: "2026-09-01",
      employeeType: "intern",
    });
    expect(bulk.success).toBe(true);
  });

  it("accepts empty as 'follow the designation' rather than rejecting it", () => {
    // "" is how a form says "no override"; rejecting it would make the common
    // case — clearing the override back to the designation — impossible.
    for (const v of ["", null]) {
      expect(EditEmployeeSchema.safeParse({ employeeType: v }).success).toBe(true);
      expect(BulkEditEmployeesSchema.safeParse({ employeeType: v }).success).toBe(true);
    }
  });

  it("rejects a type that is not one of the two codes", () => {
    expect(EditEmployeeSchema.safeParse({ employeeType: "contractor" }).success).toBe(false);
  });

  it("rejects a malformed internship start date", () => {
    expect(EditEmployeeSchema.safeParse({ internshipStart: "01-09-2026" }).success).toBe(false);
    expect(EditEmployeeSchema.safeParse({ internshipStart: "2026-02-31" }).success).toBe(false);
  });
});

describe("the internship END date is computed, never typed", () => {
  it("is declared as a stored generated column on the employee", () => {
    const schema = codeOf("db/schema.ts");
    // The end date is generated FROM the start date, which is what makes a
    // disagreeing pair impossible rather than merely unlikely.
    expect(schema).toMatch(/internshipEnd:\s*date\("internship_end"\)\s*\.generatedAlwaysAs\(/);
    expect(schema).toMatch(/interval '6 months'/);
  });

  it("is written by no action, script or validator", () => {
    // A write path that could set it would defeat the generated column. Only the
    // SCHEMA may mention the name, and only as a read.
    for (const file of [
      "app/(admin)/admin/employees/actions.ts",
      "lib/validators/employee.ts",
    ]) {
      expect(codeOf(file)).not.toMatch(/internshipEnd/);
      expect(codeOf(file)).not.toMatch(/internship_end/);
    }
  });

  it("lets an edit set the START date", () => {
    expect(codeOf("app/(admin)/admin/employees/actions.ts")).toMatch(/patch\.internshipStart\s*=/);
  });
});

describe("the intern rule reads a flag, never a designation's name", () => {
  it("keeps the text heuristic out of the rule and out of the employee-type module", () => {
    for (const file of [
      "lib/incentive/master.ts",
      "lib/employees/employee-type.ts",
      "lib/queries/incentive-master.ts",
      "lib/queries/my-incentives.ts",
      "lib/incentive/notifications/eligibility.ts",
      "lib/incentive/prepare-request.ts",
    ]) {
      expect(codeOf(file), file).not.toContain("looksLikeInternDesignation");
    }
  });

  it("matches designation text in exactly one place — the migration", () => {
    // 0244 materialised the old heuristic into `designations.employee_type`
    // ONCE. No runtime file may do the same, which is the whole point of the
    // flag.
    const migration = codeOf("db/migrations/0244_incentive_applicability_and_intern_type.sql");
    expect(migration).toMatch(/intern\|trainee\|apprentice/);
  });

  it("resolves the effective type in the query layer, from BOTH columns", () => {
    // The override and the designation's flag are read together wherever a
    // person's type is needed, so neither level of the fallback can be skipped.
    for (const file of [
      "lib/queries/incentive-master.ts",
      "lib/queries/my-incentives.ts",
      "lib/employees/master-query.ts",
    ]) {
      expect(codeOf(file), file).toMatch(/resolveEmployeeType\(\{/);
    }
  });
});

describe("probation is required for a non-intern, wherever an employee is saved", () => {
  const actions = codeOf("app/(admin)/admin/employees/actions.ts");

  it("refuses an edit that would leave a non-intern without a date", () => {
    expect(actions).toContain("Set the Probation End Date before saving this employee.");
    // Gated on the EFFECTIVE type, so an intern is exempt.
    expect(actions).toMatch(/effectiveType !== "intern" && probationEndAfter == null/);
  });

  it("applies the same rule to a new invite", () => {
    expect(actions).toMatch(/inviteType !== "intern" && inviteProbationEnd == null/);
    expect(actions).toContain("Set the Internship Start Date for an intern.");
  });

  it("checks the invite BEFORE the Firebase account exists", () => {
    // Creating the login first and refusing after would leave an orphaned
    // account behind every rejected invite.
    const checkAt = actions.indexOf("inviteType !== \"intern\" && inviteProbationEnd == null");
    const createAt = actions.indexOf("auth.createUser");
    expect(checkAt).toBeGreaterThan(-1);
    expect(createAt).toBeGreaterThan(-1);
    expect(checkAt).toBeLessThan(createAt);
  });

  it("keeps the column nullable, because two other features read NULL", () => {
    // NOT NULL would rewrite the leave cycle ("no anchor yet") and the HR
    // confirmation cron ("not scheduled"), so the requirement lives in the
    // action and the column stays as it was.
    expect(codeOf("db/schema.ts")).toMatch(/probationEnd:\s*date\("probation_end"\)/);
    expect(codeOf("db/schema.ts")).not.toMatch(/probationEnd:\s*date\("probation_end"\)\.notNull\(\)/);
  });
});

describe("probation is displayed as a date AND a state", () => {
  const cell = codeOf("components/admin/employee-master/probation-cell.tsx");

  it("shows the date in both states and never replaces it with the word", () => {
    expect(cell).toContain("Completed");
    expect(cell).toContain("On Probation");
    // The date is rendered in the same branch that renders the tag.
    expect(cell).toMatch(/formatDate\(probationEnd\)/);
  });

  it("derives the state from the date, and says so when there is no date", () => {
    expect(cell).toContain("probationEnd < today");
    expect(cell).toContain("Not set — required");
  });

  it("is used by the Employee Master table's Probation column", () => {
    const table = codeOf("components/admin/employee-master/master-table.tsx");
    expect(table).toContain("ProbationCell");
  });
});
