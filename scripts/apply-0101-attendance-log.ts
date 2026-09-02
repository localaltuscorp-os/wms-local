// Apply migration 0101 — "Attendance log" sheet import tables (ADDITIVE:
// attendance_sheet_month, attendance_sheet_day, paid_leave_cycle).
// Idempotent — safe to re-run. The drizzle journal is stale by design
// (memory: "Migration journal out of sync"), so this is the apply path:
//   pnpm tsx --env-file=.env.local scripts/apply-0101-attendance-log.ts
import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const sql = postgres(url, { max: 1, prepare: false });

const FILE = "db/migrations/0101_attendance_log_import.sql";

async function main() {
  await sql.unsafe(
    `create table if not exists __schema_applied (filename text primary key, applied_at timestamptz not null default now());`,
  );
  await sql.unsafe(readFileSync(FILE, "utf8"));
  await sql.unsafe(
    `insert into __schema_applied (filename) values ('0101_attendance_log_import.sql') on conflict do nothing`,
  );
  const tables = (await sql`
    select table_name from information_schema.tables
    where table_name in ('attendance_sheet_month','attendance_sheet_day','paid_leave_cycle')
    order by table_name
  `) as unknown as { table_name: string }[];
  console.log(`OK — applied ${FILE}`);
  console.log(`   tables present: ${tables.map((t) => t.table_name).join(", ")}`);
}
main()
  .then(() => sql.end())
  .catch(async (e) => {
    console.error(e);
    await sql.end();
    process.exit(1);
  });
