// Apply migration 0157 — Candidate draft/resume columns (instances, submitted_at).
// Idempotent. pnpm tsx --env-file=.env.local scripts/apply-0157-candidate-draft.ts
import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const sql = postgres(url, { max: 1, prepare: false });

const FILE = "db/migrations/0157_candidate_draft.sql";

async function main() {
  await sql.unsafe(
    `create table if not exists __schema_applied (filename text primary key, applied_at timestamptz not null default now());`,
  );
  await sql.unsafe(readFileSync(FILE, "utf8"));
  await sql.unsafe(
    `insert into __schema_applied (filename) values ('0157_candidate_draft.sql') on conflict do nothing`,
  );
  const cols = (await sql`
    select column_name from information_schema.columns
    where table_name = 'candidate_intake' and column_name in ('instances','submitted_at')
  `) as unknown as { column_name: string }[];
  console.log(`OK — applied ${FILE}. new columns present: ${cols.map((c) => c.column_name).sort().join(", ")}`);
}
main()
  .then(() => sql.end())
  .catch(async (e) => {
    console.error(e);
    await sql.end();
    process.exit(1);
  });
