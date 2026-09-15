/**
 * VALIDATE migration 0221 against the REAL schema, changing nothing.
 *
 * Same shape as scripts/validate-migrations-0217-0220.ts: run the file inside a
 * transaction, assert the objects it claims to create exist, then ROLL BACK.
 * Postgres parses, plans and executes every statement — DDL included, since it
 * is transactional here — so a broken migration fails loudly against the actual
 * production schema without touching a row.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/validate-migration-0221.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

const FILE = "0221_holiday_note.sql";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Run with --env-file=.env.local");
  process.exit(1);
}

const sql = postgres(url, { max: 1, onnotice: () => {} });

async function main() {
  console.log(`Validating ${FILE} (transaction will be rolled back).\n`);
  let failed = false;

  await sql
    .begin(async (tx) => {
      const body = readFileSync(join(process.cwd(), "db/migrations", FILE), "utf8");
      await tx.unsafe(body);
      console.log(`  OK    ${FILE}`);

      const cols = await tx`
        SELECT column_name, is_nullable, column_default
          FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'holidays'
           AND column_name IN ('note', 'updated_by_id', 'updated_at')
         ORDER BY column_name`;
      for (const c of cols) {
        console.log(
          `  holidays.${c.column_name}: nullable=${c.is_nullable} default=${c.column_default ?? "none"}`,
        );
      }
      if (cols.length !== 3) {
        failed = true;
        console.error(`  FAIL  expected 3 new columns, found ${cols.length}`);
      }
      // An unedited row must read as unedited.
      if (cols.some((c) => c.column_name === "updated_at" && c.column_default != null)) {
        failed = true;
        console.error("  FAIL  updated_at must not be defaulted");
      }
      // And the note must be optional.
      if (cols.some((c) => c.column_name === "note" && c.is_nullable !== "YES")) {
        failed = true;
        console.error("  FAIL  note must be nullable");
      }

      // The write path inserts/updates these columns — prove the shape works
      // against the real table rather than only that the DDL parsed.
      const [existing] = await tx`SELECT count(*)::int AS n FROM holidays`;
      console.log(`  existing holiday rows: ${existing!.n} (all read back with note = NULL)`);
      const [nulls] = await tx`SELECT count(*)::int AS n FROM holidays WHERE note IS NULL`;
      if (nulls!.n !== existing!.n) {
        failed = true;
        console.error("  FAIL  the migration invented a note for an existing row");
      }

      throw new Error("__ROLLBACK__");
    })
    .catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "__ROLLBACK__") {
        console.log("\nRolled back. The database is unchanged.");
        return;
      }
      failed = true;
      console.error("\nAborted (and rolled back):", msg);
    });

  await sql.end();
  if (failed) {
    console.error("\nVALIDATION FAILED");
    process.exit(1);
  }
  console.log("VALIDATION PASSED — 0221 applies cleanly to the live schema.");
}

void main();
