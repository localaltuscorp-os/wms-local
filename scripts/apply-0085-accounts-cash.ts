// Targeted, idempotent apply of migration 0085 (Cash Withdrawal Tracker).
// Own max:1 connection — not the app pool. Safe to re-run.
//
//   pnpm tsx --env-file=.env.local scripts/apply-0085-accounts-cash.ts
import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const sql = postgres(url, { max: 1, prepare: false });

async function main() {
  const ddl = readFileSync("db/migrations/0085_accounts_cash_withdrawal.sql", "utf8");
  await sql.unsafe(ddl);
  await sql.unsafe(`create table if not exists __schema_applied (filename text primary key, applied_at timestamptz not null default now());`);
  await sql.unsafe(`insert into __schema_applied (filename) values ($1) on conflict do nothing`, ["0085_accounts_cash_withdrawal.sql"]);
  const [t] = (await sql.unsafe(
    `select count(*)::int as n from information_schema.tables where table_name in ('accounts_cash_items','accounts_cash_months','accounts_cash_limits')`,
  )) as unknown as { n: number }[];
  console.log(`OK — cash tables present: ${t?.n ?? 0}/3`);
}

main().then(() => sql.end()).catch(async (e) => { console.error(e); await sql.end(); process.exit(1); });
