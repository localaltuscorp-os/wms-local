// Apply 0024_dont_know_status: ADD VALUE must run on its own (no txn),
// then the index + seed. See migration-journal-out-of-sync memory.
import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const sql = postgres(url, { max: 1 });

async function main() {
  // Step 1 — enum value, standalone.
  await sql.unsafe("alter type task_status add value if not exists 'dont_know'");
  // Step 2/3 — rest of the migration file (index + seed).
  const rest = readFileSync("db/migrations/0024_dont_know_status.sql", "utf8");
  await sql.unsafe(rest);
  const rows = await sql<{ count: number }[]>`
    select count(*)::int as count from status_settings where status = 'dont_know'`;
  console.log(`OK — dont_know enum value added; status_settings row present: ${rows[0]?.count === 1}`);
}
main().then(() => sql.end()).catch(async (e) => { console.error(e); await sql.end(); process.exit(1); });
