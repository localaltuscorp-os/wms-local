// Apply migration 0140 — attendance_discipline_notes. Idempotent.
//   pnpm tsx --env-file=.env.local scripts/apply-0140-discipline-notes.ts
import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const sql = postgres(url, { max: 1, prepare: false });

const FILE = "db/migrations/0140_attendance_discipline_notes.sql";

async function main() {
  await sql.unsafe(
    `create table if not exists __schema_applied (filename text primary key, applied_at timestamptz not null default now());`,
  );
  await sql.unsafe(readFileSync(FILE, "utf8"));
  await sql.unsafe(
    `insert into __schema_applied (filename) values ('0140_attendance_discipline_notes.sql') on conflict do nothing`,
  );
  const tbl = (await sql`select table_name from information_schema.tables where table_name = 'attendance_discipline_notes'`) as unknown as { table_name: string }[];
  console.log(`OK — applied ${FILE}; table present: ${tbl.length === 1}`);
}
main()
  .then(() => sql.end())
  .catch(async (e) => {
    console.error(e);
    await sql.end();
    process.exit(1);
  });
