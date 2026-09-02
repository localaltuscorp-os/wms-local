// Targeted, idempotent apply of migration 0081 (Accounts · Month/Qtr/Annual
// checklist). Runs on its own max:1 connection — not the app pool. Safe to
// re-run (CREATE TABLE IF NOT EXISTS + INSERT ON CONFLICT DO NOTHING).
//
//   pnpm tsx --env-file=.env.local scripts/apply-0081-accounts-monthly.ts
import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const sql = postgres(url, { max: 1, prepare: false });

async function main() {
  const ddl = readFileSync("db/migrations/0081_accounts_monthly_checklist.sql", "utf8");
  await sql.unsafe(ddl);
  // Record in the by-filename ledger so a later `db:migrate` skips it.
  await sql.unsafe(`
    create table if not exists __schema_applied (
      filename text primary key, applied_at timestamptz not null default now()
    );
  `);
  await sql.unsafe(
    `insert into __schema_applied (filename) values ($1) on conflict do nothing`,
    ["0081_accounts_monthly_checklist.sql"],
  );

  // Sanity: confirm the tables exist.
  const [t] = (await sql.unsafe(
    `select count(*)::int as n from information_schema.tables where table_name in ('accounts_monthly_items','accounts_monthly_checks')`,
  )) as unknown as { n: number }[];
  console.log(`OK — accounts_monthly_* tables present: ${t?.n ?? 0}/2`);
}

main()
  .then(() => sql.end())
  .catch(async (e) => {
    console.error(e);
    await sql.end();
    process.exit(1);
  });
