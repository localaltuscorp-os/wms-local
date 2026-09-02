// Targeted, idempotent apply of migration 0092 (Ambassadors).
// Own max:1 connection — not the app pool. Safe to re-run.
//
//   pnpm tsx --env-file=.env.local scripts/apply-0092-ambassadors.ts
import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const sql = postgres(url, { max: 1, prepare: false });

async function main() {
  await sql.unsafe(`
    create table if not exists __schema_applied (
      filename text primary key, applied_at timestamptz not null default now()
    );
  `);
  const f = "0092_ambassadors.sql";
  const ddl = readFileSync(`db/migrations/${f}`, "utf8");
  await sql.unsafe(ddl);
  await sql.unsafe(`insert into __schema_applied (filename) values ($1) on conflict do nothing`, [f]);
  console.log(`✓ applied ${f}`);
  const [t] = (await sql.unsafe(
    `select count(*)::int as n from information_schema.tables where table_name in
       ('amb_products','amb_ambassadors','amb_ambassador_products','amb_referrals',
        'amb_payouts','amb_payout_referrals','amb_activities','amb_documents')`,
  )) as unknown as { n: number }[];
  const [c] = (await sql.unsafe(
    `select count(*)::int as n from information_schema.columns where table_name='tasks' and column_name='amb_referral_id'`,
  )) as unknown as { n: number }[];
  const [p] = (await sql.unsafe(`select count(*)::int as n from amb_products`)) as unknown as { n: number }[];
  console.log(`tables present: ${t?.n ?? 0}/8 · tasks.amb_referral_id: ${c?.n ? "yes" : "no"} · products seeded: ${p?.n ?? 0}`);
}

main()
  .then(() => sql.end())
  .catch(async (e) => { console.error(e); await sql.end(); process.exit(1); });
