import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import { codeOf } from "../fixtures/source-code";
import { departments, departmentsBackup, functions } from "@/db/schema";
import { ADMIN_GROUPS } from "@/components/admin/admin-nav-config";
import {
  allPermissionNodes,
  isPermissionNodeKey,
  nodeKeyForPath,
  permissionNode,
} from "@/lib/permissions/catalog";

/**
 * DEPARTMENTS ARE NOW FUNCTIONS (migration 0234).
 *
 * The rename had a deliberate boundary, and this file is where that boundary is
 * written down so a later change cannot quietly cross it:
 *
 *   · the WORDS people read say Function;
 *   · the `functions` TABLE is the live master and `departments` is a frozen
 *     backup nothing reads;
 *   · the ~1,289 code identifiers (`departmentId`, `department_id`, the
 *     `departments` symbol) keep their names, because renaming them would have
 *     touched ~180 files for no behavioural gain;
 *   · HR POLICY PROSE is untouched, because "the Human Resources Department" is
 *     a real organisational body in a document people sign.
 */

const ROOT = path.resolve(__dirname, "../..");
const exists = (p: string) => existsSync(path.join(ROOT, p));

/** The SQL table a Drizzle table object points at. */
function tableName(t: unknown): string {
  return String((t as Record<symbol, unknown>)[Symbol.for("drizzle:Name")] ?? "");
}

/* ════════════════════════════════════════════════════════════════════════════
   THE TABLE
   ════════════════════════════════════════════════════════════════════════════ */

describe("the live master is the functions table", () => {
  it("the `departments` symbol IS the `functions` table, not a second one", () => {
    // One object, so there is no way for a reader to pick the wrong table.
    expect(departments).toBe(functions);
  });

  it("a query written against `departments` names the \"functions\" table", () => {
    expect(tableName(departments)).toBe("functions");
  });

  it("the frozen backup is a SEPARATE object that still names \"departments\"", () => {
    expect(departmentsBackup).not.toBe(functions);
    expect(tableName(departmentsBackup)).toBe("departments");
  });

  it("the backup is declared in the schema, so drizzle-kit cannot offer to drop it", () => {
    const schema = codeOf("db/schema.ts");
    expect(schema).toMatch(/export const departmentsBackup = pgTable\(\s*"departments"/);
  });

  it("every foreign key names `functions`, so a new Function is assignable", () => {
    const schema = codeOf("db/schema.ts");
    // The three columns that point at the master. If one still referenced
    // `departments` the alias would make it work by accident today and break
    // the moment the backup and the master diverged.
    expect(schema).not.toMatch(/references\(\(\) => departments\.id/);
    const fnRefs = schema.match(/references\(\(\) => functions\.id/g) ?? [];
    expect(fnRefs.length).toBeGreaterThanOrEqual(3);
  });

  it("no query joins the master to itself", () => {
    // `functions` and `departments` are the same table now, so a query joining
    // both is a self-join without an alias, which Drizzle refuses at runtime
    // ("Alias \"functions\" is already used"). That is exactly how this broke
    // Employee Master once.
    const masterQuery = codeOf("lib/employees/master-query.ts");
    const joinsFunctions = /\.leftJoin\(functions,/.test(masterQuery);
    const joinsDepartments = /\.leftJoin\(departments,/.test(masterQuery);
    expect(joinsFunctions && joinsDepartments).toBe(false);
  });

  it("the Employee Master row no longer carries a second Function name", () => {
    const masterQuery = codeOf("lib/employees/master-query.ts");
    expect(masterQuery).not.toMatch(/functionName/);
  });

  it("the migration keeps the backup and repairs rather than nulls", () => {
    const m = codeOf("db/migrations/0234_functions_replace_departments.sql");
    // Copies with the original ids — otherwise every employee's stored
    // department_id would stop resolving.
    expect(m).toMatch(/insert into functions \(id, name/);
    expect(m).toMatch(/select d\.id, d\.name/);
    // Never drops or empties the backup.
    expect(m).not.toMatch(/drop table[\s\S]*departments/i);
    expect(m).not.toMatch(/delete from departments/i);
    expect(m).not.toMatch(/truncate/i);
    // Repairs the broken assignments from the legacy text before nulling any.
    expect(m).toMatch(/lower\(btrim\(e\.department\)\) = lower\(f\.name\)/);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
   THE ROUTE, THE NAV AND THE PERMISSION NODE
   ════════════════════════════════════════════════════════════════════════════ */

describe("the screen moved to /admin/functions", () => {
  it("the new route exists", () => {
    expect(exists("app/(admin)/admin/functions/page.tsx")).toBe(true);
    expect(exists("app/(admin)/admin/functions/actions.ts")).toBe(true);
  });

  it("the old route still resolves, as a redirect", () => {
    // Bookmarks, older HR documents and the multi-select's empty state all
    // point at /admin/departments; a 404 there would read as a removed feature.
    expect(exists("app/(admin)/admin/departments/page.tsx")).toBe(true);
    const stub = codeOf("app/(admin)/admin/departments/page.tsx");
    expect(stub).toMatch(/redirect\("\/admin\/functions"\)/);
    // Not a 308: a permanent redirect is cached forever by the browser.
    expect(stub).not.toMatch(/permanentRedirect/);
  });

  it("the old route no longer holds the write actions", () => {
    expect(exists("app/(admin)/admin/departments/actions.ts")).toBe(false);
  });

  it("the admin nav offers Functions and no longer offers Departments", () => {
    const items = ADMIN_GROUPS.flatMap((g) => g.items);
    const fn = items.find((i) => i.href === "/admin/functions");
    expect(fn).toBeTruthy();
    expect(fn!.label).toBe("Functions");
    expect(items.some((i) => i.label === "Departments")).toBe(false);
    expect(items.some((i) => i.href === "/admin/departments")).toBe(false);
  });

  it("the permission node is relabelled but KEEPS its key", () => {
    // The key is stored in `module_permissions.node_key`; renaming it would
    // orphan every grant an admin has already made.
    expect(isPermissionNodeKey("admin.people.departments")).toBe(true);
    expect(permissionNode("admin.people.departments")?.label).toBe("Functions");
    expect(nodeKeyForPath("/admin/functions")).toBe("admin.people.departments");
  });

  it("no node still claims the old route", () => {
    const claiming = allPermissionNodes().filter((n) =>
      (n.routes ?? []).includes("/admin/departments"),
    );
    expect(claiming).toEqual([]);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
   THE WORDS
   ════════════════════════════════════════════════════════════════════════════ */

describe("the words people read say Function", () => {
  it("the admin screen is titled Functions", () => {
    const page = codeOf("app/(admin)/admin/functions/page.tsx");
    expect(page).toMatch(/title="Functions"/);
    expect(page).not.toMatch(/title="Departments"/);
  });

  it("the validators refuse with Function wording", () => {
    const v = codeOf("lib/validators/department.ts");
    expect(v).toMatch(/Function name is required/);
    expect(v).toMatch(/Function name is too long/);
    expect(v).not.toMatch(/Department name is/);
  });

  it("the write actions refuse with Function wording", () => {
    const a = codeOf("app/(admin)/admin/functions/actions.ts");
    expect(a).toMatch(/A Function with this name already exists\./);
    expect(a).toMatch(/Function not found/);
    expect(a).not.toMatch(/A department with this name/);
  });

  it("the duplicate check is case-insensitive and names the real index", () => {
    // It compared exactly and looked for `departments_name_unique`, which never
    // existed on this table — so "sales" beside "Sales" reached the user as a
    // raw database error.
    const a = codeOf("app/(admin)/admin/functions/actions.ts");
    expect(a).toMatch(/lower\(\$\{functions\.name\}\) = lower\(/);
    expect(a).toMatch(/functions_name_uq/);
    expect(a).not.toMatch(/departments_name_unique/);
  });

  it("the shared filter says Function, and All Functions", () => {
    const f = codeOf("components/layout/filters/department-filter.tsx");
    expect(f).toMatch(/name="Function"/);
    expect(f).toMatch(/"All Functions"/);
  });

  it("no user-visible label in the app still reads Department", () => {
    // Identifiers are exempt by design; this checks the LABELS and headings.
    const files = [
      "components/admin/employee-list.tsx",
      "components/admin/department-list.tsx",
      "components/layout/filters/department-filter.tsx",
      "components/dashboard/top-performers.tsx",
      "components/dashboard/bottom-performers.tsx",
      "components/attendance/insights/org/department-table.tsx",
      "components/attendance/insights/finance/finance-dashboard.tsx",
      "components/tasks/time/reports/manager-filter-bar.tsx",
      "components/my-day/dashboard/dashboard-view.tsx",
      "components/profile/identity/locked-fields-card.tsx",
    ];
    for (const f of files) {
      const c = codeOf(f);
      expect(c, `${f}: label="Department"`).not.toMatch(/label="Departments?"/);
      expect(c, `${f}: label: "Department"`).not.toMatch(/label: "Departments?"/);
      expect(c, `${f}: >Department<`).not.toMatch(/>\s*Departments?\s*</);
      expect(c, `${f}: All departments`).not.toMatch(/All departments/i);
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════
   WHAT MUST NOT HAVE BEEN RENAMED
   ════════════════════════════════════════════════════════════════════════════ */

describe("the rename stopped where it should", () => {
  it("HR policy prose still names the real organisational bodies", () => {
    // "the Human Resources Function" would be wrong in a document somebody
    // signs, so these were deliberately left alone.
    const posh = codeOf("lib/hr/policies/content/posh-policy.ts");
    expect(posh).toMatch(/Human Resources Department/);
    const antiHarassment = codeOf(
      "lib/hr/policies/content/anti-harassment-non-discrimination-policy.ts",
    );
    expect(antiHarassment).toMatch(/Human Resources Department/);
    // And the letter templates keep the Payroll / IT / Finance departments.
    const exitPolicy = codeOf("lib/hr/policies/content/exit-policy.ts");
    expect(exitPolicy).toMatch(/Department/);
  });

  it("the column and identifier names are unchanged", () => {
    const schema = codeOf("db/schema.ts");
    // The COLUMN is still department_id; only the constraint moved.
    expect(schema).toMatch(/departmentId: uuid\("department_id"\)/);
    const q = codeOf("lib/queries/departments.ts");
    expect(q).toMatch(/export async function listDepartments/);
    expect(q).toMatch(/export async function getEmployeeDepartmentMap/);
  });

  it("the legacy DEPARTMENTS constant is untouched — task filtering owns it", () => {
    const enums = codeOf("db/enums.ts");
    expect(enums).toMatch(/export const DEPARTMENTS = \[/);
  });

  it("one list, surfaced under both keys, never two queries", () => {
    const mq = codeOf("lib/employees/master-query.ts");
    // `departments` returns the same array as `functions`; asking the database
    // twice would invite a caller to believe they were different lists.
    expect(mq).toMatch(/departments: fn/);
    expect(mq).not.toMatch(/\.from\(departments\)/);
  });
});
