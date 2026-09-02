// Apply migration 0103 — DCC v2 roster-axis (dcc_clients, dcc_subjects,
// dcc_item_subjects + additive columns + generalized dcc_entries_uq). Idempotent.
//   pnpm tsx --env-file=.env.local scripts/apply-0103-dcc-roster-axis.ts
import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const sql = postgres(url, { max: 1, prepare: false });

const FILE = "db/migrations/0103_dcc_roster_axis.sql";

async function main() {
  await sql.unsafe(
    `create table if not exists __schema_applied (filename text primary key, applied_at timestamptz not null default now());`,
  );
  await sql.unsafe(readFileSync(FILE, "utf8"));
  await sql.unsafe(
    `insert into __schema_applied (filename) values ('0103_dcc_roster_axis.sql') on conflict do nothing`,
  );
  const tables = (await sql`
    select table_name from information_schema.tables
    where table_name in ('dcc_clients','dcc_subjects','dcc_item_subjects') order by table_name
  `) as unknown as { table_name: string }[];
  const cols = (await sql`
    select column_name from information_schema.columns
    where table_name = 'dcc_kpi_items'
      and column_name in ('schedule_kind','is_participant_list','client_id','template_code','needs_review')
  `) as unknown as { column_name: string }[];
  const subjCol = (await sql`
    select 1 from information_schema.columns where table_name='dcc_entries' and column_name='subject_id'
  `) as unknown as unknown[];
  const idx = (await sql`select indexdef from pg_indexes where indexname='dcc_entries_subject_uq'`) as unknown as { indexdef: string }[];
  console.log(`OK — applied ${FILE}`);
  console.log(`  new tables: ${tables.map((t) => t.table_name).join(", ")}`);
  console.log(`  kpi_items new cols: ${cols.length}/5`);
  console.log(`  dcc_entries.subject_id present: ${subjCol.length > 0}`);
  console.log(`  dcc_entries_subject_uq: ${idx[0]?.indexdef?.includes("COALESCE") ? "COALESCE expression index ✓" : idx[0]?.indexdef ?? "MISSING"}`);
}
main()
  .then(() => sql.end())
  .catch(async (e) => {
    console.error(e);
    await sql.end();
    process.exit(1);
  });
