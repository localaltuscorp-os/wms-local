/**
 * Controlled one-time Super Admin database backfill.
 *
 * The legacy roster is read from the existing source-of-truth module. This
 * script intentionally contains no addresses, names, IDs, or credentials.
 * It is dry-run by default; pass --apply only after migration 0264 is applied
 * and the resolved employee count has been reviewed by an authorised operator.
 */
import { parseArgs } from "node:util";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../lib/db";
import { SUPER_ADMIN_EMAILS } from "../lib/auth/super-admin";
import { employees, superAdminGrantEvents, superAdminGrants } from "../db/schema";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function main() {
  const { values } = parseArgs({ options: { apply: { type: "boolean", default: false } } });
  const expectedEmails = SUPER_ADMIN_EMAILS.map(normalizeEmail);
  const rows = await db
    .select({ id: employees.id, email: employees.email })
    .from(employees)
    .where(
      and(
        eq(employees.isActive, true),
        inArray(sql`lower(${employees.email})`, expectedEmails),
      ),
    );

  if (rows.length !== expectedEmails.length) {
    throw new Error(
      "The legacy Super Admin roster does not resolve to active employee records. No database changes were made.",
    );
  }

  const resolved = new Set(rows.map((row) => normalizeEmail(row.email)));
  if (resolved.size !== expectedEmails.length || expectedEmails.some((email) => !resolved.has(email))) {
    throw new Error("The legacy Super Admin roster is incomplete or duplicated. No database changes were made.");
  }

  const existing = await db
    .select({ employeeId: superAdminGrants.employeeId })
    .from(superAdminGrants);
  const existingIds = new Set(existing.map((row) => row.employeeId));
  const missing = rows.filter((row) => !existingIds.has(row.id));

  console.log(`Resolved ${rows.length} active legacy Super Admin employee records.`);
  console.log(`${missing.length} database grant(s) need to be created.`);
  if (!values.apply) {
    console.log("Dry run only. Re-run with --apply after review to write grants.");
    return;
  }

  await db.transaction(async (tx) => {
    if (missing.length === 0) return;
    await tx.insert(superAdminGrants).values(
      missing.map((row) => ({
        employeeId: row.id,
        employeeEmail: normalizeEmail(row.email),
        grantedById: null,
      })),
    );
    await tx.insert(superAdminGrantEvents).values(
      missing.map((row) => ({
        employeeId: row.id,
        employeeEmail: normalizeEmail(row.email),
        action: "backfilled",
        actorEmployeeId: null,
      })),
    );
  });

  console.log(`Created ${missing.length} Super Admin database grant(s) and audit record(s).`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : "Super Admin backfill failed.");
  process.exit(1);
});
