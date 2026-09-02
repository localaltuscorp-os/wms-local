// Apply migration 0161 — Rich ("Google Docs") HR letters (document_instances
// body_rich / body_html / content_kind columns).
// Idempotent. pnpm tsx --env-file=.env.local scripts/apply-0161-letter-rich.ts
import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const sql = postgres(url, { max: 1, prepare: false });

const FILE = "db/migrations/0161_letter_rich.sql";

async function main() {
  await sql.unsafe(
    `create table if not exists __schema_applied (filename text primary key, applied_at timestamptz not null default now());`,
  );
  await sql.unsafe(readFileSync(FILE, "utf8"));
  await sql.unsafe(
    `insert into __schema_applied (filename) values ('0161_letter_rich.sql') on conflict do nothing`,
  );
  const cols = (await sql`
    select column_name from information_schema.columns
    where table_name = 'document_instances'
      and column_name in ('body_rich', 'body_html', 'content_kind')
    order by column_name
  `) as unknown as { column_name: string }[];
  console.log(`OK — applied ${FILE}. new document_instances columns: ${cols.map((c) => c.column_name).join(", ")}`);
}
main()
  .then(() => sql.end())
  .catch(async (e) => {
    console.error(e);
    await sql.end();
    process.exit(1);
  });
