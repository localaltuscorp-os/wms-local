// Targeted, SAFE single-migration applier — applies exactly ONE named
// db/migrations/*.sql file and records it in the __schema_applied ledger.
//
// Why this exists (do NOT use apply-all-migrations.ts against a live DB):
// that bulk applier's ledger backfill only stamps up to 0028, so on a
// populated prod DB it re-attempts migrations 0029-0104. This script touches
// ONLY the file you name — nothing else — so applying a new additive migration
// to production can never disturb any earlier migration.
//
// Usage:
//   pnpm tsx --env-file=.env.local scripts/apply-one-migration.ts db/migrations/0105_incentive_config.sql          # DRY RUN (prints SQL)
//   pnpm tsx --env-file=.env.local scripts/apply-one-migration.ts db/migrations/0105_incentive_config.sql --apply  # APPLY
import { readFileSync } from "node:fs";
import postgres from "postgres";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const file = args.find((a) => a.endsWith(".sql"));
if (!file) throw new Error("Pass a migration file path, e.g. db/migrations/0105_incentive_config.sql");

const filename = file.replace(/^.*[\\/]/, ""); // basename only — the ledger key
const contents = readFileSync(file, "utf8");

async function main() {
  console.log(`\n=== apply-one-migration · ${filename} · ${APPLY ? "APPLY" : "DRY RUN"} ===\n`);
  console.log("---- SQL ----\n" + contents + "\n-------------\n");

  // DRY RUN is fully offline — no DB connection, no writes. Only --apply touches prod.
  if (!APPLY) {
    console.log(`▶ ${filename} — DRY RUN only (offline). Re-run with --apply to execute the SQL above against DATABASE_URL.`);
    return;
  }

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");
  const sql = postgres(url, { max: 1, prepare: false });

  await sql.unsafe(`
    create table if not exists __schema_applied (
      filename text primary key,
      applied_at timestamptz not null default now()
    );
  `);

  try {
    const already = (await sql.unsafe(
      `select 1 from __schema_applied where filename = $1`,
      [filename],
    )) as unknown as unknown[];
    if (already.length > 0) {
      console.log(`⊘ ${filename} is already recorded as applied — no-op.`);
      return;
    }
    await sql.unsafe(contents);
    await sql.unsafe(
      `insert into __schema_applied (filename) values ($1) on conflict do nothing`,
      [filename],
    );
    console.log(`✓ applied ${filename} and recorded in __schema_applied.`);
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
