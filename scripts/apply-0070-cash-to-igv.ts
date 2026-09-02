// Apply 0070_cash_to_igv — renames the "Cash" entity + payment mode to "IGV"
// across the Outstanding rosters. Idempotent + reversible (pure label change;
// rows are referenced by id, not name). Prints a before/after snapshot so the
// rename is auditable.
// Run via:  pnpm tsx --env-file=.env.local scripts/apply-0070-cash-to-igv.ts
import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const sql = postgres(url, { max: 1 });

const TABLES = ["outstanding_entities", "outstanding_payment_modes"] as const;

async function snapshot(label: string) {
  for (const table of TABLES) {
    const rows = await sql<{ name: string }[]>`
      SELECT name FROM ${sql(table)}
       WHERE lower(name) IN ('cash', 'igv')
       ORDER BY name`;
    console.log(`[${label}] ${table}: ${rows.map((r) => r.name).join(", ") || "(no cash/igv rows)"}`);
  }
}

async function main() {
  console.log("--- BEFORE ---");
  await snapshot("before");

  const file = readFileSync("db/migrations/0070_cash_to_igv.sql", "utf8");
  await sql.unsafe(file);
  console.log("\nApplied 0070_cash_to_igv.sql");

  console.log("\n--- AFTER ---");
  await snapshot("after");

  let allOk = true;
  for (const table of TABLES) {
    const [cash] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM ${sql(table)} WHERE lower(name) = 'cash'`;
    const [igv] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM ${sql(table)} WHERE name = 'IGV'`;
    const cashN = cash?.n ?? 0;
    const igvN = igv?.n ?? 0;
    const ok = cashN === 0;
    if (!ok) allOk = false;
    console.log(`${table}: cash=${cashN} igv=${igvN} ${ok ? "OK" : "STILL HAS CASH"}`);
  }
  console.log(`\n${allOk ? "RENAME OK — no 'Cash' rows remain" : "REVIEW NEEDED"}`);
}

main()
  .then(() => sql.end())
  .catch(async (e) => {
    console.error(e);
    await sql.end();
    process.exit(1);
  });
