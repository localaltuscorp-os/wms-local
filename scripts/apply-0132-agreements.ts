// Apply migration 0132 — Agreements module (ADDITIVE: one new `agreements` table).
// Idempotent — safe to re-run. Apply path (drizzle journal is stale by design):
//   pnpm tsx --env-file=.env.local scripts/apply-0132-agreements.ts
import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const sql = postgres(url, { max: 1, prepare: false });

const FILE = "db/migrations/0132_agreements.sql";

async function main() {
  await sql.unsafe(
    `create table if not exists __schema_applied (filename text primary key, applied_at timestamptz not null default now());`,
  );
  await sql.unsafe(readFileSync(FILE, "utf8"));
  await sql.unsafe(
    `insert into __schema_applied (filename) values ('0132_agreements.sql') on conflict do nothing`,
  );
  const cols = (await sql`
    select column_name from information_schema.columns
    where table_name = 'agreements'
    order by ordinal_position
  `) as unknown as { column_name: string }[];
  console.log(`OK — applied ${FILE}`);
  console.log(`   agreements columns (${cols.length}): ${cols.map((c) => c.column_name).join(", ")}`);
}
main()
  .then(() => sql.end())
  .catch(async (e) => {
    console.error(e);
    await sql.end();
    process.exit(1);
  });
