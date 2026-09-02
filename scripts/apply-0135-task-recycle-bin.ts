// Apply migration 0135 — Task Recycle Bin (ADDITIVE: tasks.abandoned_at +
// abandoned_by_id + partial index). Idempotent — safe to re-run.
//   pnpm tsx --env-file=.env.local scripts/apply-0135-task-recycle-bin.ts
import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const sql = postgres(url, { max: 1, prepare: false });

const FILE = "db/migrations/0135_task_recycle_bin.sql";

async function main() {
  await sql.unsafe(
    `create table if not exists __schema_applied (filename text primary key, applied_at timestamptz not null default now());`,
  );
  await sql.unsafe(readFileSync(FILE, "utf8"));
  await sql.unsafe(
    `insert into __schema_applied (filename) values ('0135_task_recycle_bin.sql') on conflict do nothing`,
  );
  const cols = (await sql`
    select column_name from information_schema.columns
    where table_name = 'tasks' and column_name in ('abandoned_at','abandoned_by_id')
    order by column_name
  `) as unknown as { column_name: string }[];
  console.log(`OK — applied ${FILE}`);
  console.log(`   tasks new cols (${cols.length}/2): ${cols.map((c) => c.column_name).join(", ")}`);
}
main()
  .then(() => sql.end())
  .catch(async (e) => {
    console.error(e);
    await sql.end();
    process.exit(1);
  });
