// Idempotent apply of migration 0176 (Task detail redesign — checklist,
// attachments, estimated_minutes). Own max:1 connection; safe to re-run.
//
//   pnpm tsx --env-file=.env.local scripts/apply-0176-task-detail-redesign.ts
import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const sql = postgres(url, { max: 1, prepare: false });

async function main() {
  const ddl = readFileSync("db/migrations/0176_task_detail_redesign.sql", "utf8");
  await sql.unsafe(ddl);
  await sql.unsafe(`
    create table if not exists __schema_applied (
      filename text primary key, applied_at timestamptz not null default now()
    );
  `);
  await sql.unsafe(`insert into __schema_applied (filename) values ($1) on conflict do nothing`, [
    "0176_task_detail_redesign.sql",
  ]);
  const [t] = (await sql.unsafe(
    `select count(*)::int as n from information_schema.tables where table_name in ('task_checklist_items','task_attachments')`,
  )) as unknown as { n: number }[];
  const [c] = (await sql.unsafe(
    `select count(*)::int as n from information_schema.columns where table_name='tasks' and column_name='estimated_minutes'`,
  )) as unknown as { n: number }[];
  console.log(`OK — new tables: ${t?.n ?? 0}/2, tasks.estimated_minutes: ${c?.n ?? 0}/1`);
}

main()
  .then(() => sql.end())
  .catch(async (e) => {
    console.error(e);
    await sql.end();
    process.exit(1);
  });
