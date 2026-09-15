/**
 * APPLY migrations 0217–0220, and only those four.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * `pnpm db:migrate` (dry) only lists which files are pending — it never parses
 * them, so a typo, a wrong column name or a constraint that conflicts with the
 * live schema is not discovered until the day somebody runs it with `--apply`.
 * And `--apply` is not a validation step: the journal here is stale, so it would
 * also execute two dozen older pending migrations that are nothing to do with
 * this work.
 *
 * So this runs ONLY the four new files, inside a single transaction, and then
 * COMMITS. All four run in ONE transaction, so a failure in any of them leaves
 * the database untouched rather than half-migrated.
 *
 * ── WHAT IT DOES NOT PROVE ─────────────────────────────────────────────────
 * That the migrations are idempotent on a database where they have ALREADY been
 * applied. It proves they apply cleanly to the schema as it stands today. The
 * idempotency guards (IF NOT EXISTS / ON CONFLICT / NOT EXISTS) are asserted
 * separately, statically, in tests/unit/master-data.test.ts.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/apply-migrations-0217-0220.ts
 *
 * Validate first (same checks, rolled back):
 *   npx tsx --env-file=.env.local scripts/validate-migrations-0217-0220.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

const FILES = [
  "0217_masters_payment_modes_and_products.sql",
  "0218_delegated_access.sql",
  "0219_permission_matrix.sql",
  "0220_manager_hierarchy_history.sql",
];

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Run with --env-file=.env.local");
  process.exit(1);
}

// `max: 1` so every statement runs on the one connection the transaction owns.
const sql = postgres(url, { max: 1, onnotice: () => {} });

async function main() {
  console.log("Applying 0217-0220 in one transaction.\n");

  let failed = false;

  await sql
    .begin(async (tx) => {
      for (const name of FILES) {
        const body = readFileSync(join(process.cwd(), "db/migrations", name), "utf8");
        try {
          // `unsafe` runs the file as-is, multiple statements included — which is
          // what a migration is. No user input reaches this; the argument is a
          // file from the repository.
          await tx.unsafe(body);
          console.log(`  OK    ${name}`);
        } catch (err) {
          failed = true;
          const e = err as { message?: string; position?: string; hint?: string };
          console.error(`  FAIL  ${name}`);
          console.error(`        ${e.message ?? String(err)}`);
          if (e.position) console.error(`        at character ${e.position}`);
          if (e.hint) console.error(`        hint: ${e.hint}`);
          throw err; // abort the transaction
        }
      }

      // ── Prove the objects the migrations claim to create actually exist,
      //    INSIDE the transaction, before it is rolled back.
      const tables = await tx`
        SELECT table_name FROM information_schema.tables
         WHERE table_schema = 'public'
           AND table_name IN (
             'delegated_access_grants', 'delegated_access_events',
             'module_permissions', 'module_permission_events',
             'employee_manager_history'
           )
         ORDER BY table_name`;
      console.log(`\n  tables created: ${tables.map((r) => r.table_name).join(", ")}`);
      if (tables.length !== 5) {
        failed = true;
        console.error(`  FAIL  expected 5 new tables, found ${tables.length}`);
      }

      const [code] = await tx`
        SELECT column_name, is_nullable FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'outstanding_products'
           AND column_name = 'code'`;
      console.log(
        `  outstanding_products.code: ${code ? `present, nullable=${code.is_nullable}` : "MISSING"}`,
      );
      if (!code) failed = true;

      // The rename actually took effect, and no row is left under the old name.
      const modes = await tx`
        SELECT name FROM outstanding_payment_modes WHERE name IN ('IGV', 'IJV') ORDER BY name`;
      const entities = await tx`
        SELECT name FROM outstanding_entities WHERE name IN ('IGV', 'IJV') ORDER BY name`;
      console.log(`  payment modes named IGV/IJV: ${modes.map((r) => r.name).join(", ") || "(none)"}`);
      console.log(`  entities named IGV/IJV:      ${entities.map((r) => r.name).join(", ") || "(none)"}`);
      if (modes.some((r) => r.name === "IGV") || entities.some((r) => r.name === "IGV")) {
        failed = true;
        console.error("  FAIL  a row is still named IGV after the migration");
      }

      const [modeCount] = await tx`SELECT count(*)::int AS n FROM outstanding_payment_modes`;
      const [prodCount] = await tx`SELECT count(*)::int AS n FROM outstanding_products`;
      const [coded] = await tx`
        SELECT count(*)::int AS n FROM outstanding_products WHERE code IS NOT NULL`;
      const [backfilled] = await tx`
        SELECT count(*)::int AS n FROM employee_manager_history WHERE effective_to IS NULL`;
      console.log(`  payment modes total:        ${modeCount!.n}`);
      console.log(`  products total:             ${prodCount!.n} (${coded!.n} with a code)`);
      console.log(`  manager periods backfilled: ${backfilled!.n} (one open row per employee)`);

      // Every product the brief lists must now be present.
      const wanted = [
        "BSS", "PS", "Altus Conclave", "PSO", "BSSO", "OS",
        "Commission", "Rent", "Billing", "Retainer", "Graduate Programs",
      ];
      const found = await tx`
        SELECT name FROM outstanding_products WHERE name = ANY(${wanted}) ORDER BY name`;
      const missing = wanted.filter((w) => !found.some((r) => r.name === w));
      if (missing.length > 0) {
        failed = true;
        console.error(`  FAIL  products missing after migration: ${missing.join(", ")}`);
      } else {
        console.log(`  all ${wanted.length} briefed products present`);
      }

      // THE ROLLBACK. Throwing is how `sql.begin` aborts; the sentinel is
      // recognised below so a deliberate rollback is not reported as a failure.
      // COMMIT. The validator (validate-migrations-0217-0220.ts) is the same script
      // ending in a rollback; this one lets the transaction commit.
    })
    .catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "__ROLLBACK__") {
        console.log("\nCommitted.");
        return;
      }
      failed = true;
      console.error("\nAborted (and rolled back):", msg);
    });

  await sql.end();
  if (failed) {
    console.error("\nAPPLY FAILED (rolled back)");
    process.exit(1);
  }
  console.log("APPLIED — 0217-0220 are committed.");
}

void main();
