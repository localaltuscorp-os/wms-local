/**
 * Audit which employees have Firebase auth accounts (and can therefore
 * use forgot-password / sign-in) vs which were imported with a placeholder
 * email and have never been invited.
 *
 * Usage:
 *   pnpm tsx --env-file=.env.local scripts/audit-employee-firebase-state.ts
 */
import { sql, isNull, isNotNull, and, eq } from "drizzle-orm";
import { db } from "../lib/db";
import { employees } from "../db/schema";

async function main() {
  const total = await db.select({ c: sql<number>`count(*)::int` }).from(employees);
  const active = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(employees)
    .where(eq(employees.isActive, true));
  const withUid = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(employees)
    .where(and(eq(employees.isActive, true), isNotNull(employees.firebaseUid)));
  const withoutUid = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(employees)
    .where(and(eq(employees.isActive, true), isNull(employees.firebaseUid)));
  const joined = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(employees)
    .where(and(eq(employees.isActive, true), isNotNull(employees.joinedAt)));

  console.log("Total employees:                              ", total[0]?.c);
  console.log("Active employees:                             ", active[0]?.c);
  console.log("  with Firebase UID (forgot-password works):  ", withUid[0]?.c);
  console.log("  WITHOUT Firebase UID (need invite):         ", withoutUid[0]?.c);
  console.log("  already joined (signed in at least once):   ", joined[0]?.c);

  // List the no-UID rows so the admin can decide who to invite first.
  const noUidRows = await db
    .select({
      id: employees.id,
      name: employees.name,
      email: employees.email,
      role: employees.role,
      department: employees.department,
    })
    .from(employees)
    .where(and(eq(employees.isActive, true), isNull(employees.firebaseUid)));

  if (noUidRows.length > 0) {
    console.log("\nActive employees WITHOUT a Firebase UID:");
    for (const r of noUidRows) {
      const placeholder = /^placeholder|@placeholder|@local|@example/.test(r.email);
      console.log(
        `  - ${r.name.padEnd(28)} ${r.email.padEnd(40)} ${r.role.padEnd(8)} ${r.department ?? ""} ${placeholder ? "[PLACEHOLDER EMAIL]" : ""}`,
      );
    }
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
