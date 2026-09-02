// Apply 0064_incentive_mis (idempotent). See migration-journal-out-of-sync memory.
//   pnpm tsx --env-file=.env.local scripts/apply-incentive-mis.ts
import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const sql = postgres(url, { max: 1 });

async function main() {
  await sql.unsafe(readFileSync("db/migrations/0064_incentive_mis.sql", "utf8"));
  const [cat] = await sql<{ count: number }[]>`select count(*)::int as count from incentive_catalog`;
  const [ent] = await sql<{ count: number }[]>`select count(*)::int as count from incentive_entries`;
  const [proj] = await sql<{ count: number }[]>`select count(*)::int as count from incentive_projects`;
  console.log(
    `OK — incentive_catalog (${cat?.count} rows), incentive_entries (${ent?.count} rows), incentive_projects (${proj?.count} rows)`,
  );
}
main().then(() => sql.end()).catch(async (e) => { console.error(e); await sql.end(); process.exit(1); });
