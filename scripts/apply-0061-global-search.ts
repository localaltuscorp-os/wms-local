// Apply 0061_global_search — extensions + generated columns + GIN indexes
// (additive, idempotent). Run via:
//   pnpm tsx --env-file=.env.local scripts/apply-0061-global-search.ts
import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const sql = postgres(url, { max: 1 });

async function main() {
  const file = readFileSync("db/migrations/0061_global_search.sql", "utf8");
  await sql.unsafe(file);
  console.log("Applied 0061_global_search.sql");

  console.log("\n--- VERIFICATION ---");
  const ext = await sql<{ extname: string }[]>`
    SELECT extname FROM pg_extension WHERE extname IN ('pg_trgm','unaccent') ORDER BY extname`;
  console.log("extensions:", ext.map((e) => e.extname).join(", ") || "NONE");

  const cols = await sql<{ column_name: string }[]>`
    SELECT column_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name='tasks'
       AND column_name IN ('search_tsv','search_text') ORDER BY column_name`;
  console.log("tasks columns:", cols.map((c) => c.column_name).join(", ") || "NONE");

  const idx = await sql<{ indexname: string }[]>`
    SELECT indexname FROM pg_indexes
     WHERE schemaname='public' AND (indexname LIKE '%_trgm_idx' OR indexname='tasks_search_tsv_idx')
     ORDER BY indexname`;
  console.log("indexes:", idx.length, "found");

  const ok = ext.length === 2 && cols.length === 2 && idx.length >= 8;
  console.log(`\n${ok ? "MIGRATION OK" : "MIGRATION INCOMPLETE"}`);
}

main()
  .then(() => sql.end())
  .catch(async (e) => {
    console.error(e);
    await sql.end();
    process.exit(1);
  });
