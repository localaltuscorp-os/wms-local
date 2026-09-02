// Apply migration 0170 — KPI Management (kpi_assignments + append-only
// kpi_assignment_history). Additive + idempotent.
// pnpm exec tsx --env-file=.env.local scripts/apply-0170-kpi-management.ts
import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const sql = postgres(url, { max: 1, prepare: false });
const FILE = "db/migrations/0170_kpi_management.sql";

async function main() {
  await sql.unsafe(
    `create table if not exists __schema_applied (filename text primary key, applied_at timestamptz not null default now());`,
  );
  await sql.unsafe(readFileSync(FILE, "utf8"));
  await sql.unsafe(
    `insert into __schema_applied (filename) values ('0170_kpi_management.sql') on conflict do nothing`,
  );

  const tables = (await sql`
    select table_name from information_schema.tables
    where table_name in ('kpi_assignments','kpi_assignment_history')
    order by table_name
  `) as unknown as { table_name: string }[];
  const cols = (await sql`
    select count(*)::int as n from information_schema.columns
    where table_name = 'kpi_assignments'
  `) as unknown as { n: number }[];
  console.log(
    `OK — applied ${FILE}.\n  tables: ${tables.map((t) => t.table_name).join(", ") || "MISSING"}\n  kpi_assignments columns: ${cols[0]?.n ?? 0}`,
  );
}
main()
  .then(() => sql.end())
  .catch(async (e) => {
    console.error(e);
    await sql.end();
    process.exit(1);
  });
