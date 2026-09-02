#!/usr/bin/env tsx
/**
 * Wipe only tasks that came from the legacy importer (legacy_import_key
 * is NOT NULL).  Cascades to task_events.  Leaves employees + Firebase
 * users in place so we don't re-do the auth-side work.
 *
 * Usage: pnpm tsx scripts/wipe-imported.ts --commit
 */
import { isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { tasks } from "@/db/schema";

async function main() {
  const commit = process.argv.includes("--commit");
  const count = await db.$count(tasks, isNotNull(tasks.legacyImportKey));
  console.log(`Tasks with legacyImportKey: ${count}`);
  if (!commit) {
    console.log("(dry run — pass --commit to delete)");
    return;
  }
  const res = await db.delete(tasks).where(isNotNull(tasks.legacyImportKey));
  console.log(`Deleted: ${(res as any).rowCount ?? "?"} rows (task_events cascade).`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
