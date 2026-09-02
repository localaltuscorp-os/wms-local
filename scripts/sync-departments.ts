import { pathToFileURL } from "url";
import { sql } from "drizzle-orm";
import { db, employees, departments } from "@/lib/db";
import { DEPARTMENTS } from "@/db/enums";

/**
 * Re-runs the M3 migration's seed block: populate the `departments` table
 * from any distinct non-empty values in `employees.department`, then
 * backfill `employees.department_id` for any rows still missing it.
 *
 * Idempotent — every step is `ON CONFLICT DO NOTHING` or guarded by
 * `is null`, so it's safe to call from CLI or from a seed script.
 *
 * Why this exists: the M3 soft migration seeds `departments` ONCE at
 * migration time from whatever was on `employees` at that moment. Our
 * dev seed scripts (`pnpm seed` / seed-demo) write to the legacy text
 * column but not to the new table, so a fresh DB seeded after the
 * migration ends up with an empty `departments` table — visible in
 * /admin/departments but invisible everywhere reading the text column.
 */
export async function syncDepartmentsFromEmployees(): Promise<{
  inserted: { id: string; name: string }[];
  linked: number;
}> {
  // Pass 1 — seed the canonical departments from `db/enums.ts` so the
  // /admin/departments panel matches the dashboard filter bar (which reads
  // the enum directly). Idempotent: `onConflictDoNothing` preserves any
  // admin deactivation or rename.
  const enumInserted = await db
    .insert(departments)
    .values(DEPARTMENTS.map((name) => ({ name })))
    .onConflictDoNothing({ target: departments.name })
    .returning({ id: departments.id, name: departments.name });

  // Pass 2 — anything else that historically landed on employees.department
  // (e.g. seed-demo's "Operations"/"Underwriting", legacy imports).
  const distinctRows = await db
    .selectDistinct({ name: sql<string>`trim(${employees.department})` })
    .from(employees)
    .where(
      sql`${employees.department} is not null and trim(${employees.department}) <> ''`,
    );

  const employeeNames = distinctRows
    .map((r) => r.name)
    .filter((n) => n.length > 0);

  const employeeInserted =
    employeeNames.length === 0
      ? []
      : await db
          .insert(departments)
          .values(employeeNames.map((name) => ({ name })))
          .onConflictDoNothing({ target: departments.name })
          .returning({ id: departments.id, name: departments.name });

  const inserted = [...enumInserted, ...employeeInserted];

  const linkResult = await db.execute(sql`
    update employees e
      set department_id = d.id
      from departments d
      where e.department_id is null
        and e.department is not null
        and lower(trim(e.department)) = lower(d.name)
  `);

  const linked =
    (linkResult as unknown as { count?: number }).count ??
    (Array.isArray(linkResult) ? linkResult.length : 0);

  // Pass 3 — backfill primary memberships into the join table for any
  // employee linked to a department but missing a membership row. Mirrors
  // the 0023 migration's backfill so dev DBs seeded via scripts get
  // multi-department membership too.
  await db.execute(sql`
    insert into employee_departments (employee_id, department_id, is_primary)
      select id, department_id, true
      from employees
      where department_id is not null
    on conflict (employee_id, department_id) do nothing
  `);

  return { inserted, linked };
}

const invokedAsScript =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedAsScript) {
  syncDepartmentsFromEmployees()
    .then(({ inserted, linked }) => {
      if (inserted.length === 0) {
        console.log("→ No new department rows needed.");
      } else {
        console.log(`→ Inserted ${inserted.length} department row(s):`);
        inserted.forEach((d) => console.log(`    - ${d.name}`));
      }
      console.log(`→ Linked ${linked} employee row(s) to department_id.`);
      process.exit(0);
    })
    .catch((err) => {
      console.error("✗ Sync failed:", err);
      process.exit(1);
    });
}
