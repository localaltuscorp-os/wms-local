// Apply 0063_mobile_devices (idempotent). See migration-journal-out-of-sync memory.
//   pnpm tsx --env-file=.env.local scripts/apply-mobile-devices.ts
import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const sql = postgres(url, { max: 1 });

async function main() {
  await sql.unsafe(readFileSync("db/migrations/0063_mobile_devices.sql", "utf8"));
  const [tbl] = await sql<{ count: number }[]>`select count(*)::int as count from mobile_devices`;
  const [col] = await sql<{ exists: boolean }[]>`
    select exists(
      select 1 from information_schema.columns
      where table_name = 'attendance_logs' and column_name = 'mobile_device_id'
    ) as exists`;
  console.log(`OK — mobile_devices ready (${tbl?.count} rows); attendance_logs.mobile_device_id present: ${col?.exists}`);
}
main().then(() => sql.end()).catch(async (e) => { console.error(e); await sql.end(); process.exit(1); });
