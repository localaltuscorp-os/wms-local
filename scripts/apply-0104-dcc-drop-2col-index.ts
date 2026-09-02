// Apply migration 0104 — drop the legacy 2-column dcc_entries_uq so the roster
// re-import can write participant rows (same item_id+entry_date, differ by
// subject_id). Idempotent.
//   pnpm tsx --env-file=.env.local scripts/apply-0104-dcc-drop-2col-index.ts
import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const sql = postgres(url, { max: 1, prepare: false });

const FILE = "db/migrations/0104_dcc_drop_2col_index.sql";

async function main() {
  await sql.unsafe(readFileSync(FILE, "utf8"));
  await sql.unsafe(
    `insert into __schema_applied (filename) values ('0104_dcc_drop_2col_index.sql') on conflict do nothing`,
  );
  const idx = (await sql`select indexname from pg_indexes where indexname in ('dcc_entries_uq','dcc_entries_subject_uq') order by indexname`) as unknown as { indexname: string }[];
  console.log(`OK — applied ${FILE}`);
  console.log(`  remaining entry indexes: ${idx.map((i) => i.indexname).join(", ") || "(none)"}`);
  console.log(`  2-col dcc_entries_uq dropped: ${!idx.some((i) => i.indexname === "dcc_entries_uq")}`);
}
main()
  .then(() => sql.end())
  .catch(async (e) => {
    console.error(e);
    await sql.end();
    process.exit(1);
  });
