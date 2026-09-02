// Apply 0058_attendance_phase_a — additive cols only, idempotent, no row data
// touched. NOTIFICATION_KINDS is a TS const array (notifications.kind is text,
// not a pgEnum) so there is no ALTER TYPE step here.
// Run via:  pnpm tsx --env-file=.env.local scripts/apply-attendance-phase-a.ts
import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const sql = postgres(url, { max: 1 });

async function main() {
  // 1. Apply the idempotent migration SQL.
  const file = readFileSync("db/migrations/0058_attendance_phase_a.sql", "utf8");
  await sql.unsafe(file);
  console.log("Applied 0058_attendance_phase_a.sql");

  console.log("\n--- VERIFICATION ---");

  const checks: Array<{ table: string; column: string }> = [
    { table: "org_settings", column: "att_late_after" },
    { table: "org_settings", column: "att_early_before" },
    { table: "org_settings", column: "att_full_day_hours" },
    { table: "org_settings", column: "att_half_day_hours" },
    { table: "employees", column: "weekly_off" },
    { table: "employees", column: "att_official_start" },
    { table: "employees", column: "att_late_after" },
    { table: "employees", column: "att_official_end" },
    { table: "employees", column: "att_early_before" },
    { table: "attendance_logs", column: "source" },
    { table: "attendance_logs", column: "reason" },
    { table: "attendance_logs", column: "recorded_by_id" },
  ];

  let allOk = true;
  for (const { table, column } of checks) {
    const [row] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = ${table}
         AND column_name = ${column}`;
    const ok = row?.n === 1;
    if (!ok) allOk = false;
    console.log(`${table}.${column}: ${ok ? "OK" : "MISSING"}`);
  }

  // FK on attendance_logs.recorded_by_id should reference employees.
  {
    const fks = await sql<{ conname: string; ref: string }[]>`
      SELECT con.conname, fref.relname AS ref
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
        JOIN pg_class fref ON fref.oid = con.confrelid
        JOIN pg_attribute att
          ON att.attrelid = con.conrelid
         AND att.attnum = ANY (con.conkey)
       WHERE con.contype = 'f'
         AND nsp.nspname = 'public'
         AND rel.relname = 'attendance_logs'
         AND att.attname = 'recorded_by_id'`;
    console.log(
      `attendance_logs.recorded_by_id FK -> employees: ${
        fks.some((f) => f.ref === "employees") ? "OK" : "MISSING"
      }`,
    );
  }

  console.log(`\n${allOk ? "ALL COLUMNS OK" : "SOME COLUMNS MISSING"}`);
}

main()
  .then(() => sql.end())
  .catch(async (e) => {
    console.error(e);
    await sql.end();
    process.exit(1);
  });
