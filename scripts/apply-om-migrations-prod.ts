/**
 * Apply Om's migrations (0225–0232, 0234, 0240, 0241) to the database in
 * DATABASE_URL, then verify them.
 *
 *   npx tsx --env-file=.env.local scripts/apply-om-migrations-prod.ts
 *
 * Runs db/RUN-IN-SUPABASE-OM-0225-0241.sql as ONE transaction — it opens with a
 * guard that stops, with the cause named, on anything that would fail or clear
 * someone's Function — so it applies completely or not at all. Then runs
 * db/VERIFY-OM-0225-0241.sql in a read-only transaction and prints each row.
 *
 * Exists because the Supabase SQL editor mangled the preflight when pasted
 * (it pre-parses the text); this sends the files to Postgres exactly as they
 * are. Safe to run twice: every statement is idempotent.
 */
import { readFileSync } from "node:fs";
import postgres from "postgres";

const BUNDLE = readFileSync("db/RUN-IN-SUPABASE-OM-0225-0241.sql", "utf8");
const VERIFY = readFileSync("db/VERIFY-OM-0225-0241.sql", "utf8");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set — run with --env-file=.env.local");
  const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
  try {
    const [{ db, v }] = await sql`select current_database() as db, current_setting('server_version') as v`;
    console.log(`connected: ${db}, Postgres ${v}  (${new URL(url).hostname})`);

    const t0 = Date.now();
    try {
      // `.simple()`: the file is many statements with its own BEGIN/COMMIT.
      await sql.unsafe(BUNDLE).simple();
      console.log(`RUN: committed in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    } catch (e: any) {
      console.log("RUN FAILED — the transaction rolled back, nothing changed.");
      console.log(`  ${e.code ?? ""} ${e.message}`);
      if (e.position) {
        const line = BUNDLE.slice(0, Number(e.position)).split("\n").length;
        console.log(`  at line ${line}: ${BUNDLE.split("\n")[line - 1]}`);
      }
      if (e.where) console.log(`  where: ${e.where}`);
      process.exitCode = 1;
      return;
    }

    const rows = (await sql.begin("read only", (tx) => tx.unsafe(VERIFY))) as any[];
    console.log(`\nVERIFY (${rows.length} rows):`);
    for (const r of rows) console.log(`  ${String(r.result).padEnd(5)} ${String(r.check_name).padEnd(78)} ${r.detail ?? ""}`);
    const bad = rows.filter((r) => r.result !== "PASS");
    console.log(bad.length ? `\n${bad.length} FAIL — send this output to Claude` : "\nALL PASS");
    if (bad.length) process.exitCode = 1;
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
