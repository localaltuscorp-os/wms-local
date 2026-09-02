/**
 * One-off ops script: demote every admin (set is_admin = false).
 *
 * Defaults to dry-run — prints the rows that WOULD change. Pass --commit to
 * actually apply. Reversible: set is_admin = true on any row to re-promote.
 *
 *   tsx --env-file=.env.local scripts/demote-admins.ts            # preview
 *   tsx --env-file=.env.local scripts/demote-admins.ts --commit   # apply
 *
 * Does NOT touch Firebase users, tasks, or any other row. Demoted employees
 * keep their login and continue to act as doers/initiators on existing tasks.
 */

import { parseArgs } from "node:util";
import { eq } from "drizzle-orm";
import { db } from "../lib/db";
import { employees } from "../db/schema";

async function main() {
  const { values } = parseArgs({
    options: { commit: { type: "boolean", default: false } },
  });
  const commit = values.commit === true;

  const admins = await db.query.employees.findMany({
    where: eq(employees.isAdmin, true),
  });

  if (admins.length === 0) {
    console.log("No admins to demote — is_admin = true count is 0.");
    return;
  }

  console.log(`\nCurrent admins (${admins.length}):\n`);
  console.table(
    admins.map((e) => ({
      id: e.id,
      name: e.name,
      email: e.email,
      isActive: e.isActive,
      firebase_uid: e.firebaseUid ?? "(none)",
    })),
  );

  if (!commit) {
    console.log("\nDry-run. Re-run with --commit to set is_admin = false on every row above.");
    return;
  }

  const updated = await db
    .update(employees)
    .set({ isAdmin: false })
    .where(eq(employees.isAdmin, true))
    .returning({ id: employees.id, email: employees.email });

  console.log(`\n✓ Demoted ${updated.length} admin(s) — they retain their login and can still act as doers/initiators.\n`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
