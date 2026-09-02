// Apply 0174_employee_official_email (idempotent). See migration-journal-out-of-sync memory.
//   pnpm tsx --env-file=.env.local scripts/apply-0174-official-email.ts
import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const sql = postgres(url, { max: 1 });

async function main() {
  await sql.unsafe(readFileSync("db/migrations/0174_employee_official_email.sql", "utf8"));
  const rows = await sql<{ column_name: string }[]>`
    select column_name from information_schema.columns
    where table_name = 'employees'
      and column_name in ('official_email','personal_email','email_provisioned_at','assets_allocated_at')
    order by column_name`;
  console.log(`OK — employees columns present: ${rows.map((r) => r.column_name).join(", ")}`);
}
main().then(() => sql.end()).catch(async (e) => { console.error(e); await sql.end(); process.exit(1); });
