// Apply 0059_attendance_phase_b — additive tables only, idempotent, no row data
// touched. The new `attendance_late_deduction` NOTIFICATION_KIND is a TS const
// (notifications.kind is text, not a pgEnum) so there is no ALTER TYPE step.
// Run via:  pnpm tsx --env-file=.env.local scripts/apply-attendance-phase-b.ts
import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const sql = postgres(url, { max: 1 });

async function main() {
  // 1. Apply the idempotent migration SQL.
  const file = readFileSync("db/migrations/0059_attendance_phase_b.sql", "utf8");
  await sql.unsafe(file);
  console.log("Applied 0059_attendance_phase_b.sql");

  console.log("\n--- VERIFICATION ---");

  const tables = ["holidays", "leave_requests", "comp_off_credits"];
  let allOk = true;
  for (const table of tables) {
    const [row] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name = ${table}`;
    const ok = row?.n === 1;
    if (!ok) allOk = false;
    console.log(`table ${table}: ${ok ? "OK" : "MISSING"}`);
  }

  console.log(`\n${allOk ? "ALL TABLES OK" : "SOME TABLES MISSING"}`);
}

main()
  .then(() => sql.end())
  .catch(async (e) => {
    console.error(e);
    await sql.end();
    process.exit(1);
  });
