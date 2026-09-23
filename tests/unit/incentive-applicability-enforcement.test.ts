import { describe, it, expect } from "vitest";
import { codeOf } from "../fixtures/source-code";

/**
 * WHERE 0244's RULES ARE ENFORCED, AND WHERE THEY ARE ONLY SHOWN.
 *
 * The brief is explicit that eligibility must be a SERVER rule and not a hidden
 * button, that the intern rule must hold across the whole system, and that the
 * rate an employee sees must come from the Incentive Master. None of those are
 * properties of a value that a unit test can compare — they are properties of
 * WHICH CODE exists — so they are asserted against the source, using the same
 * comment-stripping helper the other structural tests use (comments here
 * discuss exactly the things being forbidden).
 */

describe("the request gate is server-side, on both clients", () => {
  const prepare = codeOf("lib/incentive/prepare-request.ts");

  it("refuses an intern unconditionally, before any scheme is even consulted", () => {
    expect(prepare).toContain("Interns are not eligible for incentives.");
    // Fails on the employee TYPE, not on the presence of a scheme — an intern
    // filing for a type with no Incentive Master row yet is exactly the case a
    // UI-only fix misses.
    expect(prepare).toMatch(/isIntern\(\{ employeeType \}\)/);
  });

  it("answers with the SAME rule the employee's own screen uses", () => {
    expect(prepare).toMatch(/resolveIncentiveEligibility\(/);
    // …and does not restate it: no second copy of the window or mode logic.
    expect(prepare).not.toMatch(/applicability === "FUNCTION"/);
  });

  it("is the one gate both entry points pass through", () => {
    // The web action and the mobile POST must not each carry their own copy —
    // that is how a crafted API call outlives a UI fix.
    expect(codeOf("app/(app)/incentive/actions.ts")).toMatch(/prepareIncentiveRequest\(/);
    expect(codeOf("app/api/mobile/incentive/route.ts")).toMatch(/prepareIncentiveRequest\(/);
  });
});

describe("who may change the audience", () => {
  const actions = codeOf("app/(admin)/admin/incentive-master/actions.ts");

  it("requires the eligibility capability to change applicability", () => {
    // Editing an AMOUNT is an ordinary admin action; choosing WHO collects it is
    // the eligibility authority. Without this, applicability could be rewritten
    // by editing the amount in the same payload.
    expect(actions).toMatch(/mayManageIncentiveEligibility\(\)/);
    expect(actions).toMatch(/audienceChanged/);
    expect(actions).toContain("INCENTIVE_ELIGIBILITY_REFUSAL");
  });

  it("refuses a FUNCTION scheme with no function chosen", () => {
    expect(actions).toContain("Pick at least one function, or choose All Employees.");
  });

  it("writes the function scope in the same transaction as the catalog row", () => {
    expect(actions).toMatch(/replaceFunctionScope\(tx, id, v\.applicability, v\.functionIds\)/);
    expect(actions).toMatch(/replaceFunctionScope\(tx, row\.id, v\.applicability, v\.functionIds\)/);
  });
});

describe("the employee's rate is read, never repeated", () => {
  const mine = codeOf("lib/queries/my-incentives.ts");

  it("takes the figure straight off the catalog row", () => {
    expect(mine).toMatch(/rate:\s*Number\(c\.amount\)/);
    expect(mine).toContain("incentiveCatalog");
  });

  it("holds no rate table of its own", () => {
    // No literal money figure may appear in this module: the moment one does,
    // an admin's edit to the Incentive Master stops reaching the employee.
    const numbers = [...mine.matchAll(/(?<![\w.])(\d{2,})(?![\w.])/g)].map((m) => m[1]);
    expect(numbers).toEqual([]);
  });

  it("loads four things and folds them, rather than querying per incentive", () => {
    // The no-N+1 shape the admin list already established: catalog, scope,
    // this person's grants, and their own row.
    const awaits = [...mine.matchAll(/\.from\(/g)].length;
    expect(awaits).toBeLessThanOrEqual(4);
  });

  it("scopes to the employee id it is given, with no widening argument", () => {
    expect(mine).toMatch(/export async function listMyIncentives\(\s*employeeId: string/);
    expect(mine).toMatch(/eq\(incentiveEligibility\.employeeId, employeeId\)/);
    expect(mine).toMatch(/eq\(employees\.id, employeeId\)/);
  });
});

describe("the Applicability column shows the rule, not the legacy flags", () => {
  it("lists all three modes on the admin master table", () => {
    const table = codeOf("components/admin/incentive-master/master-table.tsx");
    expect(table).toContain("All employees");
    expect(table).toContain("By function");
    expect(table).toContain("Selected employees");
  });

  it("no longer prints the two group flags as eligibility", () => {
    // The flags survive as COLUMNS (every pre-0244 change record carries them)
    // but nothing decides or displays by them any more.
    expect(codeOf("components/incentive/incentive-catalog-dialog.tsx")).not.toContain(
      "Sales Eligible",
    );
    expect(codeOf("components/admin/incentive-master/workspace.tsx")).not.toContain("Interns eligible");
  });
});

describe("the intern gate reaches the roster the admin picks from", () => {
  it("excludes interns from the employees offered for new eligibility", () => {
    const q = codeOf("lib/queries/incentive-master.ts");
    // The picker's set — what the dialog offers AND what the server re-checks —
    // is filtered by the resolved type, so an intern cannot be NAMED eligible.
    expect(q).toMatch(/resolveEmployeeType\(\{ override: r\.override, designationType: r\.designationType \}\)/);
    expect(q).toMatch(/!==\s*"intern"/);
  });

  it("feeds the notification audience the same two facts", () => {
    const service = codeOf("lib/incentive/notifications/service.ts");
    expect(service).toMatch(/resolveEmployeeType\(/);
  });
});
