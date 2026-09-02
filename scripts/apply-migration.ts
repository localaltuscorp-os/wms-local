// Generic idempotent-migration applier (no ALTER TYPE ADD VALUE — those need
// the standalone path). Usage: pnpm tsx --env-file=.env.local \
//   scripts/apply-migration.ts db/migrations/0026_xxx.sql
import { readFileSync } from "node:fs";
import postgres from "postgres";

const file = process.argv[2];
if (!file) throw new Error("Pass a migration .sql path");
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
// `prepare: false` is MANDATORY: DATABASE_URL points at the Supabase Supavisor
// TRANSACTION pooler (port 6543), where prepared statements break. Every other
// DB entry point in this repo passes it (see lib/db/index.ts); this script was
// the one that did not, which made it a coin-flip on anything parameterised.
const sql = postgres(url, { prepare: false, max: 1, connect_timeout: 10, idle_timeout: 5 });

async function main() {
  await sql.unsafe(readFileSync(file as string, "utf8"));
  console.log(`OK — applied ${file}`);

  // Record it in the SAME ledger `apply-all-migrations.ts` reads. Without this,
  // a migration applied through this script stays "pending" forever, so the next
  // `pnpm db:migrate` re-runs it — harmless for the idempotent ones, and a live
  // hazard for any that are not. The ledger is the only honest answer to "has
  // this shipped?", and half the tooling writing to it was worse than none.
  const name = (file as string).split(/[\/]/).pop() ?? (file as string);
  await sql`
    create table if not exists __schema_applied (
      filename   text primary key,
      applied_at timestamptz not null default now()
    )`;
  await sql`insert into __schema_applied (filename) values (${name}) on conflict do nothing`;
  console.log(`OK — ledger records ${name}`);
}
main().then(() => sql.end()).catch(async (e) => { console.error(e); await sql.end(); process.exit(1); });
