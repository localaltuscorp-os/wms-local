// Apply migration 0139 — goals.category (ADDITIVE). Idempotent.
//   pnpm tsx --env-file=.env.local scripts/apply-0139-goal-category.ts
import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const sql = postgres(url, { max: 1, prepare: false });

const FILE = "db/migrations/0139_goal_category.sql";

async function main() {
  await sql.unsafe(
    `create table if not exists __schema_applied (filename text primary key, applied_at timestamptz not null default now());`,
  );
  await sql.unsafe(readFileSync(FILE, "utf8"));
  await sql.unsafe(
    `insert into __schema_applied (filename) values ('0139_goal_category.sql') on conflict do nothing`,
  );
  const c = await sql`select column_name from information_schema.columns where table_name='goals' and column_name='category'`;
  console.log(`OK — applied ${FILE}; category present: ${c.length === 1}`);
}
main()
  .then(() => sql.end())
  .catch(async (e) => {
    console.error(e);
    await sql.end();
    process.exit(1);
  });
