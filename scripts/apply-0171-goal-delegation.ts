// Apply migration 0171 — Goal delegation (goals.delegated_to +
// weekly_goals.delegated_to). Additive + idempotent.
// pnpm exec tsx --env-file=.env.local scripts/apply-0171-goal-delegation.ts
import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const sql = postgres(url, { max: 1, prepare: false });
const FILE = "db/migrations/0171_goal_delegation.sql";

async function main() {
  await sql.unsafe(
    `create table if not exists __schema_applied (filename text primary key, applied_at timestamptz not null default now());`,
  );
  await sql.unsafe(readFileSync(FILE, "utf8"));
  await sql.unsafe(
    `insert into __schema_applied (filename) values ('0171_goal_delegation.sql') on conflict do nothing`,
  );

  const cols = (await sql`
    select table_name from information_schema.columns
    where column_name = 'delegated_to' and table_name in ('goals','weekly_goals')
    order by table_name
  `) as unknown as { table_name: string }[];
  console.log(
    `OK — applied ${FILE}.\n  delegated_to present on: ${cols.map((c) => c.table_name).join(", ") || "MISSING"}`,
  );
}
main()
  .then(() => sql.end())
  .catch(async (e) => {
    console.error(e);
    await sql.end();
    process.exit(1);
  });
