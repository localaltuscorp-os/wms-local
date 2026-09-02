// Targeted, idempotent apply of migration 0091 (calendar sync state).
//   pnpm tsx --env-file=.env.local scripts/apply-0091-calendar-sync.ts
import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const sql = postgres(url, { max: 1, prepare: false });

async function main() {
  await sql.unsafe(`create table if not exists __schema_applied (filename text primary key, applied_at timestamptz not null default now());`);
  const f = "0091_calendar_sync.sql";
  await sql.unsafe(readFileSync(`db/migrations/${f}`, "utf8"));
  await sql.unsafe(`insert into __schema_applied (filename) values ($1) on conflict do nothing`, [f]);
  console.log(`✓ applied ${f}`);
  const [c] = (await sql.unsafe(`select count(*)::int n from information_schema.columns where table_name='tasks' and column_name like 'calendar_%'`)) as unknown as { n: number }[];
  console.log(`tasks calendar_* columns present: ${c?.n ?? 0}/4`);
}
main().then(() => sql.end()).catch(async (e) => { console.error(e); await sql.end(); process.exit(1); });
