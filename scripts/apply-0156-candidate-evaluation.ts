// Apply migration 0156 — Candidate Evaluation Checklist column on candidate_intake.
// Idempotent. Apply path (drizzle journal is stale by design):
//   pnpm tsx --env-file=.env.local scripts/apply-0156-candidate-evaluation.ts
import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const sql = postgres(url, { max: 1, prepare: false });

const FILE = "db/migrations/0156_candidate_evaluation.sql";

async function main() {
  await sql.unsafe(
    `create table if not exists __schema_applied (filename text primary key, applied_at timestamptz not null default now());`,
  );
  await sql.unsafe(readFileSync(FILE, "utf8"));
  await sql.unsafe(
    `insert into __schema_applied (filename) values ('0156_candidate_evaluation.sql') on conflict do nothing`,
  );
  const cols = (await sql`
    select column_name from information_schema.columns
    where table_name = 'candidate_intake' and column_name = 'evaluation'
  `) as unknown as { column_name: string }[];
  console.log(`OK — applied ${FILE}. evaluation column present: ${cols.length === 1}`);
}
main()
  .then(() => sql.end())
  .catch(async (e) => {
    console.error(e);
    await sql.end();
    process.exit(1);
  });
