// Apply 0054_biometric_geofence_attendance — DDL-only, additive, idempotent.
// Run via:  pnpm tsx --env-file=.env.local scripts/apply-biometric-geofence.ts
import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const sql = postgres(url, { max: 1 });

async function main() {
  const file = readFileSync(
    "db/migrations/0054_biometric_geofence_attendance.sql",
    "utf8",
  );
  await sql.unsafe(file);

  const checks: Array<[string, string]> = [
    ["org_settings", "office_lat"],
    ["org_settings", "attendance_radius_m"],
    ["attendance_logs", "lat"],
    ["attendance_logs", "distance_m"],
    ["attendance_logs", "verify_method"],
  ];
  for (const [table, column] of checks) {
    const [row] = await sql<{ n: number }[]>`
      select count(*)::int as n from information_schema.columns
       where table_schema = 'public' and table_name = ${table} and column_name = ${column}`;
    console.log(`${table}.${column}: ${row?.n === 1 ? "OK" : "MISSING"}`);
  }
  const [tbl] = await sql<{ n: number }[]>`
    select count(*)::int as n from information_schema.tables
     where table_schema = 'public' and table_name = 'webauthn_credentials'`;
  console.log(`webauthn_credentials: ${tbl?.n === 1 ? "OK" : "MISSING"}`);
}

main()
  .then(() => sql.end())
  .catch(async (e) => {
    console.error(e);
    await sql.end();
    process.exit(1);
  });
