// Apply 0072_office_ip_allowlist (idempotent).
//   pnpm tsx --env-file=.env.local scripts/apply-office-ip.ts
import { readFileSync } from "node:fs";
import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false });
async function main() {
  await sql.unsafe(readFileSync("db/migrations/0072_office_ip_allowlist.sql", "utf8"));
  const [c] = await sql<{ exists: boolean }[]>`
    select exists(select 1 from information_schema.columns where table_name='org_settings' and column_name='office_ip_allowlist') as exists`;
  console.log("OK — office_ip_allowlist column present:", c?.exists);
}
main().then(() => sql.end()).catch(async (e) => { console.error(e); await sql.end(); process.exit(1); });
