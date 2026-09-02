// Apply migration 0134 — Unified "Plan My Day" (ADDITIVE: daily_checklist.done_pct
// + daily_plan_day table). Idempotent — safe to re-run. The drizzle journal is
// stale by design (memory: "Migration journal out of sync"), so this is the path:
//   pnpm tsx --env-file=.env.local scripts/apply-0134-plan-my-day.ts
import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const sql = postgres(url, { max: 1, prepare: false });

const FILE = "db/migrations/0134_plan_my_day.sql";

async function main() {
  await sql.unsafe(
    `create table if not exists __schema_applied (filename text primary key, applied_at timestamptz not null default now());`,
  );
  await sql.unsafe(readFileSync(FILE, "utf8"));
  await sql.unsafe(
    `insert into __schema_applied (filename) values ('0134_plan_my_day.sql') on conflict do nothing`,
  );
  const col = (await sql`
    select column_name from information_schema.columns
    where table_name = 'daily_checklist' and column_name = 'done_pct'
  `) as unknown as { column_name: string }[];
  const tbl = (await sql`
    select table_name from information_schema.tables where table_name = 'daily_plan_day'
  `) as unknown as { table_name: string }[];
  console.log(`OK — applied ${FILE}`);
  console.log(`   daily_checklist.done_pct present: ${col.length === 1}`);
  console.log(`   daily_plan_day table present: ${tbl.length === 1}`);
}
main()
  .then(() => sql.end())
  .catch(async (e) => {
    console.error(e);
    await sql.end();
    process.exit(1);
  });
