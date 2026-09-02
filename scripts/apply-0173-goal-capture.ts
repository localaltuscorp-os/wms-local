// Apply migration 0173 — Goal Capture (goals.capture_batch_id + goal_capture_log).
// Additive + idempotent.
// pnpm exec tsx --env-file=.env.local scripts/apply-0173-goal-capture.ts
import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const sql = postgres(url, { max: 1, prepare: false });
const FILE = "db/migrations/0173_goal_capture.sql";

async function main() {
  await sql.unsafe(
    `create table if not exists __schema_applied (filename text primary key, applied_at timestamptz not null default now());`,
  );
  await sql.unsafe(readFileSync(FILE, "utf8"));
  await sql.unsafe(
    `insert into __schema_applied (filename) values ('0173_goal_capture.sql') on conflict do nothing`,
  );
  const col = (await sql`
    select column_name from information_schema.columns
    where table_name = 'goals' and column_name = 'capture_batch_id'
  `) as unknown as { column_name: string }[];
  const tbl = (await sql`
    select table_name from information_schema.tables where table_name = 'goal_capture_log'
  `) as unknown as { table_name: string }[];
  console.log(
    `OK — applied ${FILE}.\n  goals.capture_batch_id: ${col.length ? "present" : "MISSING"}\n  goal_capture_log table: ${tbl.length ? "present" : "MISSING"}`,
  );
}
main()
  .then(() => sql.end())
  .catch(async (e) => {
    console.error(e);
    await sql.end();
    process.exit(1);
  });
