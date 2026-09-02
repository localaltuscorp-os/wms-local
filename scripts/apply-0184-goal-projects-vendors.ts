// Targeted, idempotent apply of migration 0184 ("Part of Project?" on goals +
// the managed VENDOR master). Runs on its own max:1 connection — never the app
// pool. Safe to re-run: every statement is CREATE/ALTER ... IF NOT EXISTS.
//
// This MUST run before the 0184 code ships: db/schema.ts now declares
// goals.is_project / project_node_id / vendor_id, and drizzle selects every
// declared column, so the goals board would 500 on a database without them.
//
//   pnpm tsx --env-file=.env.local scripts/apply-0184-goal-projects-vendors.ts
import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const sql = postgres(url, { max: 1, prepare: false });

const FILE = "0184_goal_projects_vendors.sql";

async function main() {
  const ddl = readFileSync(`db/migrations/${FILE}`, "utf8");
  await sql.unsafe(ddl);

  // Record in the by-filename ledger so a later `db:migrate` skips it.
  await sql.unsafe(`
    create table if not exists __schema_applied (
      filename text primary key, applied_at timestamptz not null default now()
    );
  `);
  await sql.unsafe(
    `insert into __schema_applied (filename) values ($1) on conflict do nothing`,
    [FILE],
  );

  // Sanity: the vendor master exists and all seven columns landed.
  const [t] = (await sql.unsafe(
    `select count(*)::int as n from information_schema.tables where table_name = 'vendors'`,
  )) as unknown as { n: number }[];
  const [c] = (await sql.unsafe(
    `select count(*)::int as n from information_schema.columns
      where (table_name = 'goals'         and column_name in ('is_project','project_node_id','vendor_id'))
         or (table_name = 'weekly_goals'  and column_name in ('is_project','project_node_id','vendor_id'))
         or (table_name = 'project_nodes' and column_name = 'vendor_id')`,
  )) as unknown as { n: number }[];
  console.log(`OK — vendors table: ${t?.n ?? 0}/1 · new columns: ${c?.n ?? 0}/7`);
  if ((t?.n ?? 0) !== 1 || (c?.n ?? 0) !== 7) {
    throw new Error("0184 did not fully apply — do NOT ship the 0184 code yet.");
  }
}

main()
  .then(() => sql.end())
  .catch(async (e) => {
    console.error(e);
    await sql.end();
    process.exit(1);
  });
