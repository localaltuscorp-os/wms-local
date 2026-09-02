// Apply migration 0172 — weekly_goals.share_with_team (column parity with goals).
// Additive + idempotent.
// pnpm exec tsx --env-file=.env.local scripts/apply-0172-weekly-share.ts
import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const sql = postgres(url, { max: 1, prepare: false });
const FILE = "db/migrations/0172_weekly_share_with_team.sql";

async function main() {
  await sql.unsafe(
    `create table if not exists __schema_applied (filename text primary key, applied_at timestamptz not null default now());`,
  );
  await sql.unsafe(readFileSync(FILE, "utf8"));
  await sql.unsafe(
    `insert into __schema_applied (filename) values ('0172_weekly_share_with_team.sql') on conflict do nothing`,
  );
  const cols = (await sql`
    select column_name from information_schema.columns
    where table_name = 'weekly_goals' and column_name = 'share_with_team'
  `) as unknown as { column_name: string }[];
  console.log(`OK — applied ${FILE}.\n  weekly_goals.share_with_team: ${cols.length ? "present" : "MISSING"}`);
}
main()
  .then(() => sql.end())
  .catch(async (e) => {
    console.error(e);
    await sql.end();
    process.exit(1);
  });
