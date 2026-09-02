// Apply migration 0158 — reconcile paying_entities to the 5 canonical Altus
// entities (rename legacy MJV/JSV HUF, insert missing). Idempotent.
// pnpm tsx --env-file=.env.local scripts/apply-0158-paying-entities.ts
import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const sql = postgres(url, { max: 1, prepare: false });

const FILE = "db/migrations/0158_paying_entities_reconcile.sql";

async function main() {
  await sql.unsafe(
    `create table if not exists __schema_applied (filename text primary key, applied_at timestamptz not null default now());`,
  );
  await sql.unsafe(readFileSync(FILE, "utf8"));
  await sql.unsafe(
    `insert into __schema_applied (filename) values ('0158_paying_entities_reconcile.sql') on conflict do nothing`,
  );
  const rows = (await sql`
    select name, is_active, sort_order from paying_entities order by sort_order, name
  `) as unknown as { name: string; is_active: boolean; sort_order: number }[];
  console.log(`OK — applied ${FILE}. paying_entities now:`);
  for (const r of rows) console.log(`  [${r.sort_order}] ${r.name}${r.is_active ? "" : " (inactive)"}`);
}
main()
  .then(() => sql.end())
  .catch(async (e) => {
    console.error(e);
    await sql.end();
    process.exit(1);
  });
