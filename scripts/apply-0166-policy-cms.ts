// Apply migration 0166 — Policy CMS tables + org_settings.admin_pin_hash.
// Idempotent. pnpm tsx --env-file=.env.local scripts/apply-0166-policy-cms.ts
import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const sql = postgres(url, { max: 1, prepare: false });
const FILE = "db/migrations/0166_policy_cms.sql";

async function main() {
  await sql.unsafe(
    `create table if not exists __schema_applied (filename text primary key, applied_at timestamptz not null default now());`,
  );
  await sql.unsafe(readFileSync(FILE, "utf8"));
  await sql.unsafe(`insert into __schema_applied (filename) values ('0166_policy_cms.sql') on conflict do nothing`);
  const tables = (await sql`
    select table_name from information_schema.tables
    where table_name in ('policy_documents','policy_versions','policy_compliance')
    order by table_name
  `) as unknown as { table_name: string }[];
  const col = (await sql`
    select column_name from information_schema.columns where table_name='org_settings' and column_name='admin_pin_hash'
  `) as unknown as { column_name: string }[];
  console.log(
    `OK — applied ${FILE}.\n  tables: ${tables.map((t) => t.table_name).join(", ") || "MISSING"}\n  org_settings.admin_pin_hash: ${col[0]?.column_name ?? "MISSING"}`,
  );
}
main()
  .then(() => sql.end())
  .catch(async (e) => {
    console.error(e);
    await sql.end();
    process.exit(1);
  });
