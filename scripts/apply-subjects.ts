// Apply 0025_subjects (idempotent). See migration-journal-out-of-sync memory.
import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const sql = postgres(url, { max: 1 });

async function main() {
  await sql.unsafe(readFileSync("db/migrations/0025_subjects.sql", "utf8"));
  const rows = await sql<{ count: number }[]>`select count(*)::int as count from subjects`;
  console.log(`OK — subjects table ready, ${rows[0]?.count} rows.`);
}
main().then(() => sql.end()).catch(async (e) => { console.error(e); await sql.end(); process.exit(1); });
