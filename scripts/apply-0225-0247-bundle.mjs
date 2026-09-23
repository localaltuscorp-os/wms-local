#!/usr/bin/env node
/**
 * apply-0225-0247-bundle.mjs — APPLY db/RUN-IN-SUPABASE-0225-0247-ALL.sql.
 *
 * Unlike apply-pending-migrations.mjs (which gates on a hardcoded checklist
 * from an older, narrower bundle and does not cover this one), this always
 * runs the bundle's SQL, then verifies the specific column that caused the
 * Management Assessment / Evaluation Checklist candidate pickers to render
 * empty: candidate_intake.merged_into_id (migration 0225_candidate_intake_merge.sql).
 *
 * The bundle itself is one BEGIN...COMMIT transaction of additive,
 * IF-NOT-EXISTS-guarded statements — safe to run even where some objects
 * already exist from an earlier ad-hoc apply.
 *
 * USAGE — from wms-local:
 *   node --env-file=.env.local scripts/apply-0225-0247-bundle.mjs
 */
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";

const require_ = createRequire(import.meta.url);
const postgres = require_("postgres");

const BUNDLE = "db/RUN-IN-SUPABASE-0225-0247-ALL.sql";

function fail(msg) {
  console.error(`\n  ${msg}\n`);
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  fail("No DATABASE_URL. Run it as:\n\n    node --env-file=.env.local scripts/apply-0225-0247-bundle.mjs");
}

function projectRef(url) {
  return /postgres\.([a-z0-9]{20})/.exec(url)?.[1] ?? "(unknown)";
}

const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false, idle_timeout: 20 });

try {
  console.log(`\n  Database: Supabase project ${projectRef(process.env.DATABASE_URL)}\n`);
  console.log(`  Applying ${BUNDLE} …`);
  const text = await readFile(BUNDLE, "utf8");
  await sql.unsafe(text).simple();
  console.log("  Applied.\n");

  const [col] = await sql`
    select count(*)::int as n from information_schema.columns
    where table_name = 'candidate_intake' and column_name = 'merged_into_id'
  `;
  const [cnt] = await sql`select count(*)::int as n from candidate_intake`;

  console.log(`  VERIFY  candidate_intake.merged_into_id exists: ${col.n === 1 ? "YES" : "NO — still missing!"}`);
  console.log(`  VERIFY  candidate_intake row count: ${cnt.n}`);
  console.log(
    col.n === 1
      ? "\n  Fixed. Reload /hr/evaluation and /hr/management-assessment — the candidate picker should now list rows.\n"
      : "\n  Something is still wrong — the column did not get created. Read any error above.\n",
  );
  process.exitCode = col.n === 1 ? 0 : 1;
} catch (err) {
  console.error(`\n  FAILED: ${err?.message ?? err}`);
  console.error("  The bundle runs in one transaction, so nothing was half-applied.\n");
  process.exitCode = 1;
} finally {
  await sql.end();
}
