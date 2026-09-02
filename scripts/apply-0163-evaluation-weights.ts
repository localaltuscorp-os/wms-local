// Apply migration 0163 — Weighted Candidate-Evaluation section scoring:
// org_settings.evaluation_weights (jsonb, nullable).
// Idempotent. Safe to re-run.
// pnpm tsx --env-file=.env.local scripts/apply-0163-evaluation-weights.ts
import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const sql = postgres(url, { max: 1, prepare: false });

const FILE = "db/migrations/0163_evaluation_weights.sql";

async function main() {
  await sql.unsafe(
    `create table if not exists __schema_applied (filename text primary key, applied_at timestamptz not null default now());`,
  );
  await sql.unsafe(readFileSync(FILE, "utf8"));
  await sql.unsafe(
    `insert into __schema_applied (filename) values ('0163_evaluation_weights.sql') on conflict do nothing`,
  );

  const cols = (await sql`
    select column_name from information_schema.columns
    where table_name = 'org_settings' and column_name = 'evaluation_weights'
  `) as unknown as { column_name: string }[];

  console.log(
    `OK — applied ${FILE}.\n` +
      `  org_settings.evaluation_weights column: ${cols[0]?.column_name ?? "MISSING"}`,
  );
}
main()
  .then(() => sql.end())
  .catch(async (e) => {
    console.error(e);
    await sql.end();
    process.exit(1);
  });
