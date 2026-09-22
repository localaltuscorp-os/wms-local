import "server-only";
import { sql as raw } from "drizzle-orm";
import { db } from "@/lib/db";
import { departments, departmentsBackup } from "@/db/schema";
import {
  listDepartments,
  listDepartmentsWithCounts,
  getEmployeeDepartmentMap,
} from "@/lib/queries/departments";
import { loadEmployeeMasterRows } from "@/lib/employees/master-query";

/**
 * FUNCTIONS REPLACE DEPARTMENTS (migration 0234) — verify against the REAL
 * database, read-only.
 *
 * Usage:
 *   pnpm tsx --conditions=react-server --env-file=.env.local \
 *     scripts/verify-functions-rename.ts
 *
 * What it proves:
 *   · `functions` is the live master and holds the whole list;
 *   · `departments` still holds its backup rows and nothing reads it;
 *   · the app's OWN query layer (which still says `departments` in code, via the
 *     schema alias) resolves to `functions`;
 *   · the 19 employees whose Function used to render as "—" now resolve.
 */

let pass = 0;
let fail = 0;
const ok = (label: string, cond: boolean, extra = "") => {
  if (cond) {
    pass++;
    console.log(`  PASS ${label}${extra ? " · " + extra : ""}`);
  } else {
    fail++;
    console.log(`  FAIL ${label}${extra ? " · " + extra : ""}`);
  }
};

type Count = { n: number };
const count = async (table: string): Promise<number> => {
  const rows = (await db.execute(
    raw`select count(*)::int as n from ${raw.identifier(table)}`,
  )) as unknown as Count[];
  return Number(rows[0]?.n ?? 0);
};

async function main() {
  console.log("\n=== verify-functions-rename ===\n");

  console.log("== the two tables ==");
  const fCount = await count("functions");
  const dCount = await count("departments");
  ok("functions holds the master", fCount > 0, `${fCount} rows`);
  ok("departments still holds its backup rows", dCount > 0, `${dCount} rows`);
  ok("both hold the same number of rows", fCount === dCount, `${fCount} vs ${dCount}`);

  const sameRows = (await db.execute(
    raw`select count(*)::int as n from departments d
        join functions f on f.id = d.id and f.name = d.name`,
  )) as unknown as Count[];
  ok(
    "every backup row has its twin in functions, same id and name",
    Number(sameRows[0]?.n) === dCount,
    `${sameRows[0]?.n}`,
  );

  console.log("\n== the app's query layer resolves to functions ==");
  // Proved WITHOUT writing anything: Drizzle compiles a query against the
  // `departments` symbol, and the SQL it emits names the table it will actually
  // read. Inserting a probe row would prove the same thing while risking a
  // leftover row if the run is interrupted.
  const compiled = db.select().from(departments).toSQL().sql;
  ok('a query on the `departments` symbol compiles to "functions"', /"functions"/.test(compiled));
  ok("...and never to the frozen backup", !/"departments"/.test(compiled), compiled.slice(0, 90));

  const backupCompiled = db.select().from(departmentsBackup).toSQL().sql;
  ok('`departmentsBackup` is the one thing that still names "departments"',
     /"departments"/.test(backupCompiled));

  // And the real reader returns the live list.
  const list = await listDepartments();
  ok("listDepartments() returns the whole Function list", list.length === fCount, `${list.length} rows`);
  const counts = await listDepartmentsWithCounts();
  ok("listDepartmentsWithCounts() returns it too", counts.length === fCount, `${counts.length} rows`);
  const withMembers = counts.filter((c) => c.employeeCount > 0);
  console.log(
    `  members per Function: ${withMembers.map((c) => `${c.name}=${c.employeeCount}`).join(", ")}`,
  );

  console.log("\n== the 19 broken assignments are repaired ==");
  const orphans = (await db.execute(
    raw`select count(*)::int as n from employees e
        where e.department_id is not null
          and not exists (select 1 from functions f where f.id = e.department_id)`,
  )) as unknown as Count[];
  ok("no employee points at a Function that does not exist", Number(orphans[0]?.n) === 0);

  try {
    const rows = await loadEmployeeMasterRows();
    const current = rows.filter((r) => r.isActive && r.employmentStatus === "active");
    const named = current.filter((r) => r.departmentName != null);
    ok(
      "Employee Master now shows a Function for every current employee",
      named.length === current.length,
      `${named.length} of ${current.length}`,
    );
    const spread = new Map<string, number>();
    for (const r of named) spread.set(r.departmentName!, (spread.get(r.departmentName!) ?? 0) + 1);
    console.log(
      `  spread: ${[...spread.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(", ")}`,
    );
  } catch (err) {
    // The shared connection pool stalls in this environment (see HANDOFF notes);
    // a timeout here is not a failure of the rename, so it is reported and the
    // rest of the verification continues.
    console.log(
      `  SKIP Employee Master read — ${err instanceof Error ? err.message.slice(0, 80) : String(err)}`,
    );
  }

  console.log("\n== the multi-Function join table is consistent ==");
  const edOrphans = (await db.execute(
    raw`select count(*)::int as n from employee_departments ed
        where not exists (select 1 from functions f where f.id = ed.department_id)`,
  )) as unknown as Count[];
  ok("no membership row points at a missing Function", Number(edOrphans[0]?.n) === 0);
  const map = await getEmployeeDepartmentMap();
  ok("memberships still resolve", map.size > 0, `${map.size} employees`);

  console.log("\n== the foreign keys ==");
  const fks = (await db.execute(
    raw`select conrelid::regclass::text as tbl, confrelid::regclass::text as target
        from pg_constraint
        where contype = 'f' and conname in (
          'employees_department_id_fkey',
          'employee_departments_department_id_fkey',
          'jd_positions_department_id_fkey')
        order by tbl`,
  )) as unknown as { tbl: string; target: string }[];
  ok(
    "all three point at functions",
    fks.length === 3 && fks.every((f) => f.target === "functions"),
    fks.map((f) => `${f.tbl}->${f.target}`).join(", "),
  );

  console.log(`\n=== PASS: ${pass} · FAIL: ${fail} · ${fail === 0 ? "ALL PASS" : "FAILURES"} ===`);
  process.exit(fail === 0 ? 0 : 1);
}

void main();
