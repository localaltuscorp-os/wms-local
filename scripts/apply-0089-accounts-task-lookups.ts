// Targeted, idempotent apply of migration 0089 (Accounts task-list dropdown
// options). Own max:1 connection — not the app pool.
//
//   pnpm tsx --env-file=.env.local scripts/apply-0089-accounts-task-lookups.ts
import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const sql = postgres(url, { max: 1, prepare: false });

async function main() {
  const ddl = readFileSync("db/migrations/0089_accounts_task_lookups.sql", "utf8");
  await sql.unsafe(ddl);
  await sql.unsafe(`create table if not exists __schema_applied (filename text primary key, applied_at timestamptz not null default now());`);
  await sql.unsafe(`insert into __schema_applied (filename) values ($1) on conflict do nothing`, ["0089_accounts_task_lookups.sql"]);
  const rows = (await sql.unsafe(
    `select kind, value from accounts_lookups where kind in ('task_status','task_gear') and active = true order by kind, sort_order`,
  )) as unknown as { kind: string; value: string }[];
  console.log("OK — task_status/task_gear options:");
  for (const r of rows) console.log(`  ${r.kind}: ${r.value}`);
}

main().then(() => sql.end()).catch(async (e) => { console.error(e); await sql.end(); process.exit(1); });
