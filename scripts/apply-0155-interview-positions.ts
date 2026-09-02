// Apply migration 0155 — Interview Positions master (Candidate Interview Form).
// Idempotent — safe to re-run. Apply path (drizzle journal is stale by design):
//   pnpm tsx --env-file=.env.local scripts/apply-0155-interview-positions.ts
import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const sql = postgres(url, { max: 1, prepare: false });

const FILE = "db/migrations/0155_interview_positions.sql";

async function main() {
  await sql.unsafe(
    `create table if not exists __schema_applied (filename text primary key, applied_at timestamptz not null default now());`,
  );
  await sql.unsafe(readFileSync(FILE, "utf8"));
  await sql.unsafe(
    `insert into __schema_applied (filename) values ('0155_interview_positions.sql') on conflict do nothing`,
  );
  const rows = (await sql`
    select label from interview_positions where is_active order by sort_order, label
  `) as unknown as { label: string }[];
  console.log(`OK — applied ${FILE}`);
  console.log(`   interview_positions (${rows.length}): ${rows.map((r) => r.label).join(", ")}`);
}
main()
  .then(() => sql.end())
  .catch(async (e) => {
    console.error(e);
    await sql.end();
    process.exit(1);
  });
