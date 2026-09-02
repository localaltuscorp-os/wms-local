// Targeted, idempotent apply of migration 0094 (Phase B event spine).
// Own max:1 connection. Safe to re-run. ADDITIVE only — touches no existing table.
//   pnpm tsx --env-file=.env.local scripts/apply-0094-event-spine.ts
import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const sql = postgres(url, { max: 1, prepare: false });

async function main() {
  await sql.unsafe(`create table if not exists __schema_applied (filename text primary key, applied_at timestamptz not null default now());`);
  const f = "0094_event_spine.sql";
  await sql.unsafe(readFileSync(`db/migrations/${f}`, "utf8"));
  await sql.unsafe(`insert into __schema_applied (filename) values ($1) on conflict do nothing`, [f]);
  console.log(`✓ applied ${f}`);
  const tables = ["event_log", "event_consumers", "command_log", "task_metrics_daily"];
  for (const name of tables) {
    const [t] = (await sql.unsafe(
      `select count(*)::int as n from information_schema.tables where table_name=$1`,
      [name],
    )) as unknown as { n: number }[];
    console.log(`  ${name.padEnd(20)} ${t?.n ? "present ✓" : "MISSING ✗"}`);
  }
}

main().then(() => sql.end()).catch(async (e) => { console.error(e); await sql.end(); process.exit(1); });
