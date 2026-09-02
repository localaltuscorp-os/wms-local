// Apply 0065_weekly_goals (idempotent). See migration-journal-out-of-sync memory.
//   pnpm tsx --env-file=.env.local scripts/apply-weekly-goals.ts
import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const sql = postgres(url, { max: 1 });

async function main() {
  await sql.unsafe(readFileSync("db/migrations/0065_weekly_goals.sql", "utf8"));
  const [tbl] = await sql<{ count: number }[]>`select count(*)::int as count from weekly_goals`;
  const [col] = await sql<{ exists: boolean }[]>`
    select exists(
      select 1 from information_schema.columns
      where table_name = 'weekly_goals' and column_name = 'incentive_amount'
    ) as exists`;
  console.log(`OK — weekly_goals ready (${tbl?.count} rows); incentive_amount present: ${col?.exists}`);
}
main().then(() => sql.end()).catch(async (e) => { console.error(e); await sql.end(); process.exit(1); });
