// Apply migration 0153 — Appraisal v2 (ADDITIVE: fresh appr_* tables backing
// the new one-live-rolling-scorecard appraisal module).
// Idempotent — safe to re-run. Apply path (drizzle journal is stale by design):
//   pnpm tsx --env-file=.env.local scripts/apply-0153-appraisal-v2.ts
import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const sql = postgres(url, { max: 1, prepare: false });

const FILE = "db/migrations/0153_appraisal_v2.sql";

const TABLES = [
  "appr_config",
  "appr_kpi",
  "appr_skill",
  "appr_attitude",
  "appr_scorecard",
  "appr_item_score",
];

async function main() {
  await sql.unsafe(
    `create table if not exists __schema_applied (filename text primary key, applied_at timestamptz not null default now());`,
  );
  await sql.unsafe(readFileSync(FILE, "utf8"));
  await sql.unsafe(
    `insert into __schema_applied (filename) values ('0153_appraisal_v2.sql') on conflict do nothing`,
  );
  console.log(`OK — applied ${FILE}`);
  for (const table of TABLES) {
    const cols = (await sql`
      select column_name from information_schema.columns
      where table_name = ${table}
      order by ordinal_position
    `) as unknown as { column_name: string }[];
    console.log(
      `   ${table} (${cols.length}): ${cols.map((c) => c.column_name).join(", ")}`,
    );
  }
}
main()
  .then(() => sql.end())
  .catch(async (e) => {
    console.error(e);
    await sql.end();
    process.exit(1);
  });
