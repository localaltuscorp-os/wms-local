/**
 * One-off ops script: rename a single employee by id. Applies the same
 * normalizeName() the validators use so the new value can't have stray
 * whitespace / escape sequences.
 *
 *   tsx --env-file=.env.local scripts/rename-employee.ts --id <uuid> --name "<new name>"            # dry-run
 *   tsx --env-file=.env.local scripts/rename-employee.ts --id <uuid> --name "<new name>" --commit   # apply
 */

import { parseArgs } from "node:util";
import { eq } from "drizzle-orm";
import { db } from "../lib/db";
import { employees } from "../db/schema";
import { normalizeName } from "../lib/validators/employee";

async function main() {
  const { values } = parseArgs({
    options: {
      id:     { type: "string" },
      name:   { type: "string" },
      commit: { type: "boolean", default: false },
    },
  });
  if (!values.id || !values.name) {
    console.error("Usage: rename-employee --id <uuid> --name \"<new name>\" [--commit]");
    process.exit(1);
  }
  const id = values.id;
  const newName = normalizeName(values.name);
  if (newName.length === 0) {
    console.error("Normalized name is empty — refusing to write.");
    process.exit(1);
  }

  const row = await db.query.employees.findFirst({
    where: eq(employees.id, id),
  });
  if (!row) {
    console.error(`No employee found with id=${id}`);
    process.exit(1);
  }

  console.log(`\nemployee ${id}:`);
  console.log(`  email: ${row.email}`);
  console.log(`  name was:  ${JSON.stringify(row.name)}`);
  console.log(`  name will: ${JSON.stringify(newName)}`);

  if (row.name === newName) {
    console.log("\nNo change (already normalized). Skipping write.");
    return;
  }

  if (!values.commit) {
    console.log("\nDry-run. Re-run with --commit to apply.");
    return;
  }

  await db.update(employees).set({ name: newName }).where(eq(employees.id, id));
  console.log("\n✓ Updated.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
