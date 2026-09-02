// Apply migration 0168 — Goal type taxonomy (additive, idempotent).
// pnpm exec tsx --env-file=.env.local scripts/apply-0168-goal-type.ts
import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const sql = postgres(url, { max: 1, prepare: false });
const FILE = "db/migrations/0168_goal_type.sql";

async function main() {
  await sql.unsafe(
    `create table if not exists __schema_applied (filename text primary key, applied_at timestamptz not null default now());`,
  );
  await sql.unsafe(readFileSync(FILE, "utf8"));
  await sql.unsafe(
    `insert into __schema_applied (filename) values ('0168_goal_type.sql') on conflict do nothing`,
  );

  const cols = (await sql`
    select table_name, column_name from information_schema.columns
    where column_name='goal_type' and table_name in ('goals','weekly_goals')
    order by table_name
  `) as unknown as { table_name: string; column_name: string }[];
  const counts = (await sql`
    select 'goals' as tbl, goal_type, count(*)::int as n from goals group by goal_type
    union all
    select 'weekly_goals' as tbl, goal_type, count(*)::int as n from weekly_goals group by goal_type
    order by tbl, goal_type
  `) as unknown as { tbl: string; goal_type: string | null; n: number }[];
  console.log(
    `OK — applied ${FILE}.\n  columns: ${cols.map((c) => `${c.table_name}.${c.column_name}`).join(", ") || "MISSING"}\n  goal_type distribution:\n    ${counts.map((r) => `${r.tbl}: ${r.goal_type ?? "NULL"} = ${r.n}`).join("\n    ") || "(no rows)"}`,
  );
}
main()
  .then(() => sql.end())
  .catch(async (e) => {
    console.error(e);
    await sql.end();
    process.exit(1);
  });
