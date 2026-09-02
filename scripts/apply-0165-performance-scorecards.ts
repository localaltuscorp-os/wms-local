// Apply migration 0165 — performance_scorecards table. Idempotent, safe to re-run.
// pnpm tsx --env-file=.env.local scripts/apply-0165-performance-scorecards.ts
import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const sql = postgres(url, { max: 1, prepare: false });

const FILE = "db/migrations/0165_performance_scorecards.sql";

async function main() {
  await sql.unsafe(
    `create table if not exists __schema_applied (filename text primary key, applied_at timestamptz not null default now());`,
  );
  await sql.unsafe(readFileSync(FILE, "utf8"));
  await sql.unsafe(
    `insert into __schema_applied (filename) values ('0165_performance_scorecards.sql') on conflict do nothing`,
  );
  const tbl = (await sql`
    select table_name from information_schema.tables where table_name = 'performance_scorecards'
  `) as unknown as { table_name: string }[];
  console.log(`OK — applied ${FILE}.\n  performance_scorecards table: ${tbl[0]?.table_name ?? "MISSING"}`);
}
main()
  .then(() => sql.end())
  .catch(async (e) => {
    console.error(e);
    await sql.end();
    process.exit(1);
  });
