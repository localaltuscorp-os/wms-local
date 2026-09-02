// Apply migration 0164 — Candidate Evaluation v2:
//   · candidate_intake.evaluation_v2 (jsonb, nullable)
//   · evaluation_weight_profiles table + seeded 'default' profile row.
// Idempotent. Safe to re-run.
// pnpm tsx --env-file=.env.local scripts/apply-0164-evaluation-v2.ts
import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const sql = postgres(url, { max: 1, prepare: false });

const FILE = "db/migrations/0164_evaluation_v2.sql";

async function main() {
  await sql.unsafe(
    `create table if not exists __schema_applied (filename text primary key, applied_at timestamptz not null default now());`,
  );
  await sql.unsafe(readFileSync(FILE, "utf8"));
  await sql.unsafe(
    `insert into __schema_applied (filename) values ('0164_evaluation_v2.sql') on conflict do nothing`,
  );

  const col = (await sql`
    select column_name from information_schema.columns
    where table_name = 'candidate_intake' and column_name = 'evaluation_v2'
  `) as unknown as { column_name: string }[];
  const tbl = (await sql`
    select table_name from information_schema.tables where table_name = 'evaluation_weight_profiles'
  `) as unknown as { table_name: string }[];
  const seed = (await sql`
    select designation from evaluation_weight_profiles where designation = 'default'
  `) as unknown as { designation: string }[];

  console.log(
    `OK — applied ${FILE}.\n` +
      `  candidate_intake.evaluation_v2 column: ${col[0]?.column_name ?? "MISSING"}\n` +
      `  evaluation_weight_profiles table: ${tbl[0]?.table_name ?? "MISSING"}\n` +
      `  default profile seeded: ${seed[0]?.designation ?? "MISSING"}`,
  );
}
main()
  .then(() => sql.end())
  .catch(async (e) => {
    console.error(e);
    await sql.end();
    process.exit(1);
  });
