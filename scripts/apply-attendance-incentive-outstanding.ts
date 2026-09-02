// Apply 0053_attendance_incentive_outstanding — DDL-only, additive, idempotent.
// Run via:  pnpm tsx --env-file=.env.local scripts/apply-attendance-incentive-outstanding.ts
import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const sql = postgres(url, { max: 1 });

async function main() {
  const file = readFileSync(
    "db/migrations/0053_attendance_incentive_outstanding.sql",
    "utf8",
  );
  await sql.unsafe(file);

  const tables = [
    "attendance_logs",
    "incentive_requests",
    "outstanding_entries",
    "outstanding_followups",
  ];
  for (const t of tables) {
    const [row] = await sql<{ n: number }[]>`
      select count(*)::int as n from information_schema.tables
       where table_schema = 'public' and table_name = ${t}`;
    console.log(`${t}: ${row?.n === 1 ? "OK" : "MISSING"}`);
  }
}

main()
  .then(() => sql.end())
  .catch(async (e) => {
    console.error(e);
    await sql.end();
    process.exit(1);
  });
