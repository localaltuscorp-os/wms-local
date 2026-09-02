// Targeted, idempotent apply of migration 0093 (weekly-goal daily actuals +
// weight even-split backfill). Own max:1 connection. Safe to re-run.
//   pnpm tsx --env-file=.env.local scripts/apply-0093-weekly-goal-actuals.ts
import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const sql = postgres(url, { max: 1, prepare: false });

async function main() {
  await sql.unsafe(`create table if not exists __schema_applied (filename text primary key, applied_at timestamptz not null default now());`);
  const f = "0093_weekly_goal_actuals.sql";
  await sql.unsafe(readFileSync(`db/migrations/${f}`, "utf8"));
  await sql.unsafe(`insert into __schema_applied (filename) values ($1) on conflict do nothing`, [f]);
  console.log(`✓ applied ${f}`);
  const [t] = (await sql.unsafe(`select count(*)::int as n from information_schema.tables where table_name='weekly_goal_actuals'`)) as unknown as { n: number }[];
  // Show the weight sums per (employee, week) for the backfilled weeks — should all be 100.
  const sums = (await sql.unsafe(`
    select week_start, count(*)::int as goals, count(distinct employee_id)::int as people,
           count(*) filter (where w.s = 100)::int as ok_people
    from (
      select employee_id, week_start, sum(weight)::int as s
      from weekly_goals where archived=false
        and week_start in ((date_trunc('week',(now() at time zone 'Asia/Kolkata'))::date),
                           (date_trunc('week',(now() at time zone 'Asia/Kolkata'))::date + 7))
      group by employee_id, week_start
    ) w group by week_start order by week_start
  `)) as unknown as { week_start: string; people: number; ok_people: number }[];
  console.log(`weekly_goal_actuals table: ${t?.n ? "present" : "MISSING"}`);
  for (const r of sums) console.log(`  week ${r.week_start}: ${r.ok_people}/${r.people} people sum to 100`);
}

main().then(() => sql.end()).catch(async (e) => { console.error(e); await sql.end(); process.exit(1); });
