// Apply 0062_salary (additive, idempotent).
// Run: pnpm tsx --env-file=.env.local scripts/apply-0062-salary.ts
import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const sql = postgres(url, { max: 1 });

async function main() {
  await sql.unsafe(readFileSync("db/migrations/0062_salary.sql", "utf8"));
  console.log("Applied 0062_salary.sql");
  const tables = await sql<{ table_name: string }[]>`
    SELECT table_name FROM information_schema.tables
     WHERE table_schema='public' AND table_name IN
       ('designations','paying_entities','salary_profiles','salary_advances','salary_runs','salary_policies','salary_policy_consents')
     ORDER BY table_name`;
  console.log("tables:", tables.map((t) => t.table_name).join(", "));
  const cols = await sql<{ column_name: string }[]>`
    SELECT column_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name='employees'
       AND column_name IN ('designation_id','paying_entity_id') ORDER BY column_name`;
  console.log("employee cols:", cols.map((c) => c.column_name).join(", "));
  const ok = tables.length === 7 && cols.length === 2;
  console.log(`\n${ok ? "MIGRATION OK" : "MIGRATION INCOMPLETE"}`);
}
main().then(() => sql.end()).catch(async (e) => { console.error(e); await sql.end(); process.exit(1); });
