// Apply migration 0169 — Target Date for MONTHLY cascade goals (additive, idempotent).
// pnpm exec tsx --env-file=.env.local scripts/apply-0169-goal-target-date.ts
import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const sql = postgres(url, { max: 1, prepare: false });
const FILE = "db/migrations/0169_goal_target_date.sql";

async function main() {
  await sql.unsafe(
    `create table if not exists __schema_applied (filename text primary key, applied_at timestamptz not null default now());`,
  );
  await sql.unsafe(readFileSync(FILE, "utf8"));
  await sql.unsafe(
    `insert into __schema_applied (filename) values ('0169_goal_target_date.sql') on conflict do nothing`,
  );

  const cols = (await sql`
    select table_name, column_name from information_schema.columns
    where column_name='target_date' and table_name in ('goals','weekly_goals')
    order by table_name
  `) as unknown as { table_name: string; column_name: string }[];
  const filled = (await sql`
    select count(*)::int as n from goals where target_date is not null
  `) as unknown as { n: number }[];
  console.log(
    `OK — applied ${FILE}.\n  columns: ${cols.map((c) => `${c.table_name}.${c.column_name}`).join(", ") || "MISSING"}\n  goals with target_date set: ${filled[0]?.n ?? 0}`,
  );
}
main()
  .then(() => sql.end())
  .catch(async (e) => {
    console.error(e);
    await sql.end();
    process.exit(1);
  });
