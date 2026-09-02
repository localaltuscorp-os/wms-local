// Idempotent apply of 0098 (daily_checklist_reviews). Own max:1 connection.
//   pnpm tsx --env-file=.env.local scripts/apply-0098-dcr.ts
import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const sql = postgres(url, { max: 1, prepare: false });

async function main() {
  await sql.unsafe(`create table if not exists __schema_applied (filename text primary key, applied_at timestamptz not null default now());`);
  const f = "0098_daily_checklist_review.sql";
  await sql.unsafe(readFileSync(`db/migrations/${f}`, "utf8"));
  await sql.unsafe(`insert into __schema_applied (filename) values ($1) on conflict do nothing`, [f]);
  const [t] = (await sql.unsafe(
    `select count(*)::int as n from information_schema.tables where table_name='daily_checklist_reviews'`,
  )) as unknown as { n: number }[];
  console.log(`✓ applied ${f} — daily_checklist_reviews ${t?.n ? "present ✓" : "MISSING ✗"}`);
}
main().then(() => sql.end()).catch(async (e) => { console.error(e); await sql.end(); process.exit(1); });
