// Apply 0071_incentive_entry (idempotent). See migration-journal-out-of-sync memory.
//   pnpm tsx --env-file=.env.local scripts/apply-incentive-entry.ts
import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const sql = postgres(url, { max: 1 });

async function main() {
  await sql.unsafe(readFileSync("db/migrations/0071_incentive_entry.sql", "utf8"));
  const cols = await sql<{ column_name: string }[]>`
    select column_name from information_schema.columns
    where table_name = 'weekly_goals' and column_name in ('incentive_type','incentive_catalog_id')`;
  const [back] = await sql<{ n: number }[]>`
    select count(*)::int as n from weekly_goals where incentive_type = 'adhoc'`;
  console.log("OK — columns:", cols.map((c) => c.column_name).join(", "));
  console.log(`OK — backfilled adhoc rows: ${back?.n}`);
}
main().then(() => sql.end()).catch(async (e) => { console.error(e); await sql.end(); process.exit(1); });
