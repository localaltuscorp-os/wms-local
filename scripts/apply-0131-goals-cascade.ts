// Apply migration 0131 — Goals Cascade + Daily Execution (ADDITIVE: goals,
// goal_reviews, whatsapp_media_log + additive weekly_goals columns).
// Idempotent — safe to re-run. The drizzle journal is stale by design
// (memory: "Migration journal out of sync"), so this is the apply path:
//   pnpm tsx --env-file=.env.local scripts/apply-0131-goals-cascade.ts
import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const sql = postgres(url, { max: 1, prepare: false });

const FILE = "db/migrations/0131_goals_cascade.sql";

async function main() {
  await sql.unsafe(
    `create table if not exists __schema_applied (filename text primary key, applied_at timestamptz not null default now());`,
  );
  await sql.unsafe(readFileSync(FILE, "utf8"));
  await sql.unsafe(
    `insert into __schema_applied (filename) values ('0131_goals_cascade.sql') on conflict do nothing`,
  );
  const tables = (await sql`
    select table_name from information_schema.tables
    where table_name in ('goals','goal_reviews','whatsapp_media_log')
    order by table_name
  `) as unknown as { table_name: string }[];
  const cols = (await sql`
    select column_name from information_schema.columns
    where table_name = 'weekly_goals'
      and column_name in (
        'month_goal_id','area','uom','target_qty','target_amount','actual_qty',
        'actual_amount','team_involved','team_dependency_pct','evidence_url',
        'adopted','committed_at','approved_by_manager_at'
      )
    order by column_name
  `) as unknown as { column_name: string }[];
  console.log(`OK — applied ${FILE}`);
  console.log(`   tables present: ${tables.map((t) => t.table_name).join(", ")}`);
  console.log(`   weekly_goals new cols (${cols.length}/13): ${cols.map((c) => c.column_name).join(", ")}`);
}
main()
  .then(() => sql.end())
  .catch(async (e) => {
    console.error(e);
    await sql.end();
    process.exit(1);
  });
