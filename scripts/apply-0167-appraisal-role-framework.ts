// Apply migration 0167 — Appraisal role framework (additive, idempotent).
// pnpm exec tsx --env-file=.env.local scripts/apply-0167-appraisal-role-framework.ts
import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const sql = postgres(url, { max: 1, prepare: false });
const FILE = "db/migrations/0167_appraisal_role_framework.sql";

async function main() {
  await sql.unsafe(
    `create table if not exists __schema_applied (filename text primary key, applied_at timestamptz not null default now());`,
  );
  await sql.unsafe(readFileSync(FILE, "utf8"));
  await sql.unsafe(
    `insert into __schema_applied (filename) values ('0167_appraisal_role_framework.sql') on conflict do nothing`,
  );

  const cols = (await sql`
    select table_name, column_name from information_schema.columns
    where (table_name='appr_config' and column_name='role_class')
       or (table_name='appr_scorecard' and column_name='kpi_actuals')
    order by table_name, column_name
  `) as unknown as { table_name: string; column_name: string }[];
  const tbl = (await sql`
    select table_name from information_schema.tables where table_name='appr_dimension_score'
  `) as unknown as { table_name: string }[];
  console.log(
    `OK — applied ${FILE}.\n  columns: ${cols.map((c) => `${c.table_name}.${c.column_name}`).join(", ") || "MISSING"}\n  table: ${tbl[0]?.table_name ?? "MISSING appr_dimension_score"}`,
  );
}
main()
  .then(() => sql.end())
  .catch(async (e) => {
    console.error(e);
    await sql.end();
    process.exit(1);
  });
