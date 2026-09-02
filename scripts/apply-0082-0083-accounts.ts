// Targeted, idempotent apply of migrations 0082 (Due Dates) + 0083 (CC Master).
// Own max:1 connection — not the app pool. Safe to re-run.
//
//   pnpm tsx --env-file=.env.local scripts/apply-0082-0083-accounts.ts
import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const sql = postgres(url, { max: 1, prepare: false });

const FILES = [
  "0082_accounts_due_dates.sql",
  "0083_accounts_cc_master.sql",
];

async function main() {
  await sql.unsafe(`
    create table if not exists __schema_applied (
      filename text primary key, applied_at timestamptz not null default now()
    );
  `);
  for (const f of FILES) {
    const ddl = readFileSync(`db/migrations/${f}`, "utf8");
    await sql.unsafe(ddl);
    await sql.unsafe(`insert into __schema_applied (filename) values ($1) on conflict do nothing`, [f]);
    console.log(`✓ applied ${f}`);
  }
  const [t] = (await sql.unsafe(
    `select count(*)::int as n from information_schema.tables where table_name in ('accounts_due_items','accounts_cc_cards','accounts_cc_months')`,
  )) as unknown as { n: number }[];
  console.log(`tables present: ${t?.n ?? 0}/3`);
}

main()
  .then(() => sql.end())
  .catch(async (e) => { console.error(e); await sql.end(); process.exit(1); });
