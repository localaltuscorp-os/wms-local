// Apply ONE db/migrations file, by filename, and stamp it in the same
// `__schema_applied` ledger scripts/apply-all-migrations.ts uses. Exists because
// that script has no `--only` flag: it applies every pending file in order, and
// this database currently has ~26 unrelated pending migrations that must not be
// run as a side effect of adding one table.
//
// Usage:
//   pnpm tsx --env-file=.env.local scripts/apply-one-migration.ts 0249_incentive_target_plans.sql
//   ... --dry
import { readFileSync } from "node:fs";
import postgres from "postgres";

const arg = process.argv[2];
const DRY = process.argv.includes("--dry");

if (!arg || !arg.endsWith(".sql")) {
  throw new Error("Pass a migration filename, e.g. 0249_incentive_target_plans.sql");
}
// Narrowed once here, so the value stays `string` inside `main()` too (the
// original `string | undefined` fails the `sql.unsafe` parameter type).
const filename: string = arg;

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const sql = postgres(url, { max: 1, prepare: false });

const contents = readFileSync(`db/migrations/${filename}`, "utf8");

async function main(): Promise<void> {
  await sql.unsafe(`
    create table if not exists __schema_applied (
      filename text primary key,
      applied_at timestamptz not null default now()
    );
  `);

  const already = (await sql.unsafe(
    `select 1 from __schema_applied where filename = $1`,
    [filename],
  )) as unknown as unknown[];
  if (already.length > 0) {
    console.log(`already applied: ${filename}`);
    return;
  }

  if (DRY) {
    console.log(`--- would apply ${filename} ---\n${contents}`);
    return;
  }

  // One transaction: the DDL is additive (CREATE TABLE / INDEX), so a failure
  // anywhere means nothing was written.
  await sql.begin(async (tx) => {
    await tx.unsafe(contents);
    await tx.unsafe(`insert into __schema_applied (filename) values ($1)`, [filename]);
  });

  console.log(`applied: ${filename}`);

  const tables = (await sql.unsafe(
    `select table_name from information_schema.tables
      where table_name in ('incentive_target_plans', 'incentive_target_plan_products')
      order by table_name`,
  )) as unknown as Array<{ table_name: string }>;
  console.log(`present now: ${tables.map((t) => t.table_name).join(", ") || "(none)"}`);
}

main()
  .then(() => sql.end())
  .catch(async (err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err));
    await sql.end();
    process.exitCode = 1;
  });
