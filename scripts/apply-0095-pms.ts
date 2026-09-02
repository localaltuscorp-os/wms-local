// Targeted, idempotent apply of migration 0095 (PMS / Employee Intelligence).
// Own max:1 connection. Safe to re-run. ADDITIVE only — touches no existing table.
//   pnpm tsx --env-file=.env.local scripts/apply-0095-pms.ts
import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const sql = postgres(url, { max: 1, prepare: false });

async function main() {
  await sql.unsafe(`create table if not exists __schema_applied (filename text primary key, applied_at timestamptz not null default now());`);
  const f = "0095_pms.sql";
  await sql.unsafe(readFileSync(`db/migrations/${f}`, "utf8"));
  await sql.unsafe(`insert into __schema_applied (filename) values ($1) on conflict do nothing`, [f]);
  console.log(`✓ applied ${f}`);
  const tables = [
    "employee_twin",
    "employee_score_daily",
    "pms_score_config",
    "pms_review",
    "pms_recognition",
    "pms_promotion_signal",
  ];
  for (const name of tables) {
    const [t] = (await sql.unsafe(
      `select count(*)::int as n from information_schema.tables where table_name=$1`,
      [name],
    )) as unknown as { n: number }[];
    console.log(`  ${name.padEnd(22)} ${t?.n ? "present ✓" : "MISSING ✗"}`);
  }
  const [cfg] = (await sql.unsafe(
    `select count(*)::int as n from pms_score_config where id='default'`,
  )) as unknown as { n: number }[];
  console.log(`  pms_score_config 'default' seed ${cfg?.n ? "present ✓" : "MISSING ✗"}`);
}

main().then(() => sql.end()).catch(async (e) => { console.error(e); await sql.end(); process.exit(1); });
