// Apply 0060_employee_probation — adds employees.probation_end (additive,
// idempotent). Pulled forward from Phase C because Phase B's leave-cycle
// allowance is anchored at probation-end.
// Run via:  pnpm tsx --env-file=.env.local scripts/apply-employee-probation.ts
import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const sql = postgres(url, { max: 1 });

async function main() {
  const file = readFileSync("db/migrations/0060_employee_probation.sql", "utf8");
  await sql.unsafe(file);
  console.log("Applied 0060_employee_probation.sql");

  console.log("\n--- VERIFICATION ---");
  const [row] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'employees'
       AND column_name = 'probation_end'`;
  const ok = row?.n === 1;
  console.log(`column employees.probation_end: ${ok ? "OK" : "MISSING"}`);
  console.log(`\n${ok ? "COLUMN OK" : "COLUMN MISSING"}`);
}

main()
  .then(() => sql.end())
  .catch(async (e) => {
    console.error(e);
    await sql.end();
    process.exit(1);
  });
