// Apply migration 0130 — Monthly Events Master (ADDITIVE: event_categories,
// event_batch_types, event_batch_schedules, calendar_events, holidays,
// obligations, obligation_completions + employees.religion).
// Idempotent — safe to re-run. The drizzle journal is stale by design
// (memory: "Migration journal out of sync"), so this is the apply path:
//   pnpm tsx --env-file=.env.local scripts/apply-0130-monthly-events.ts
import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const sql = postgres(url, { max: 1, prepare: false });

const FILE = "db/migrations/0130_monthly_events.sql";

async function main() {
  await sql.unsafe(
    `create table if not exists __schema_applied (filename text primary key, applied_at timestamptz not null default now());`,
  );
  await sql.unsafe(readFileSync(FILE, "utf8"));
  await sql.unsafe(
    `insert into __schema_applied (filename) values ('0130_monthly_events.sql') on conflict do nothing`,
  );
  const tables = (await sql`
    select table_name from information_schema.tables
    where table_name in (
      'event_categories','event_batch_types','event_batch_schedules',
      'calendar_events','event_holidays','obligations','obligation_completions'
    )
    order by table_name
  `) as unknown as { table_name: string }[];
  const cats = (await sql`select count(*)::int as n from event_categories`) as unknown as { n: number }[];
  const types = (await sql`select count(*)::int as n from event_batch_types`) as unknown as { n: number }[];
  console.log(`OK — applied ${FILE}`);
  console.log(`   tables present: ${tables.map((t) => t.table_name).join(", ")}`);
  console.log(`   seeded: ${cats[0]?.n ?? 0} categories, ${types[0]?.n ?? 0} batch types`);
}
main()
  .then(() => sql.end())
  .catch(async (e) => {
    console.error(e);
    await sql.end();
    process.exit(1);
  });
