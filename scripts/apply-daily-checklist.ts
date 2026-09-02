// Apply 0069_daily_checklist (idempotent). See migration-journal-out-of-sync memory.
//   pnpm tsx --env-file=.env.local scripts/apply-daily-checklist.ts
import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const sql = postgres(url, { max: 1 });

async function main() {
  await sql.unsafe(readFileSync("db/migrations/0069_daily_checklist.sql", "utf8"));
  const [tbl] = await sql<{ count: number }[]>`select count(*)::int as count from daily_checklist`;
  const [idx] = await sql<{ exists: boolean }[]>`
    select exists(
      select 1 from pg_indexes where indexname = 'daily_checklist_emp_date_goal_idx'
    ) as exists`;
  console.log(`OK — daily_checklist ready (${tbl?.count} rows); unique idx present: ${idx?.exists}`);
}
main().then(() => sql.end()).catch(async (e) => { console.error(e); await sql.end(); process.exit(1); });
