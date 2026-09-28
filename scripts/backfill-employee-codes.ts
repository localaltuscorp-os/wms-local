import { and, eq, ilike, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees } from "@/db/schema";
import {
  issueSuggestedEmployeeCode,
  suggestPrefixFor,
} from "@/lib/employees/code-registry";

const APPLY = process.argv.includes("--apply");
const actorArg = process.argv.find((arg) => arg.startsWith("--actor-email="));
const actorEmail = actorArg?.slice("--actor-email=".length).trim() ?? "";

async function main() {
  const candidates = await db
    .select({
      id: employees.id,
      name: employees.name,
      email: employees.email,
      accountType: employees.accountType,
      payingEntityId: employees.payingEntityId,
      designationId: employees.designationId,
    })
    .from(employees)
    .where(
      and(
        eq(employees.isActive, true),
        eq(employees.accountType, "employee"),
        isNull(employees.employeeCode),
      ),
    )
    .orderBy(employees.name);

  if (candidates.length === 0) {
    console.log("No active employee records need an Employee Code.");
    return;
  }

  const planned: { id: string; name: string; email: string; prefix: string | null }[] = [];
  for (const employee of candidates) {
    planned.push({
      id: employee.id,
      name: employee.name,
      email: employee.email,
      prefix: await suggestPrefixFor(employee.id),
    });
  }

  console.log(`${APPLY ? "APPLY" : "DRY RUN"}: ${planned.length} active employees without codes`);
  for (const row of planned) {
    console.log(`- ${row.name} <${row.email}> -> ${row.prefix ?? "NO PREFIX (skipped)"}`);
  }

  if (!APPLY) {
    console.log("Dry run only. Re-run with --apply --actor-email=admin@example.com to allocate codes.");
    return;
  }
  if (!actorEmail) throw new Error("--actor-email is required with --apply.");

  const [actor] = await db
    .select({ id: employees.id, isAdmin: employees.isAdmin, name: employees.name })
    .from(employees)
    .where(ilike(employees.email, actorEmail))
    .limit(1);
  if (!actor) throw new Error(`Acting employee was not found: ${actorEmail}`);
  if (!actor.isAdmin) throw new Error(`Acting employee is not an admin: ${actor.name}`);

  let issued = 0;
  let skipped = 0;
  for (const row of planned) {
    if (!row.prefix) {
      skipped += 1;
      continue;
    }
    const result = await issueSuggestedEmployeeCode({ employeeId: row.id, actorId: actor.id });
    if (!result.ok) throw new Error(`${row.name}: ${result.error}`);
    issued += 1;
    console.log(`  issued ${result.code} -> ${row.name}`);
  }
  console.log(`Complete: issued=${issued}, skipped_without_prefix=${skipped}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
