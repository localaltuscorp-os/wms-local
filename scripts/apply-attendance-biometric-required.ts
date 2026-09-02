// Apply 0056_attendance_biometric_required — DDL-only, additive, idempotent.
// Run via:  pnpm tsx --env-file=.env.local scripts/apply-attendance-biometric-required.ts
import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const sql = postgres(url, { max: 1 });

async function main() {
  const file = readFileSync(
    "db/migrations/0056_attendance_biometric_required.sql",
    "utf8",
  );
  await sql.unsafe(file);

  const [row] = await sql<{ n: number }[]>`
    select count(*)::int as n from information_schema.columns
     where table_schema = 'public'
       and table_name = 'employees'
       and column_name = 'attendance_biometric_exempt'`;
  console.log(
    `employees.attendance_biometric_exempt: ${row?.n === 1 ? "OK" : "MISSING"}`,
  );
}

main()
  .then(() => sql.end())
  .catch(async (e) => {
    console.error(e);
    await sql.end();
    process.exit(1);
  });
