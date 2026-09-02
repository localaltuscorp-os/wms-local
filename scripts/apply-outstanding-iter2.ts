// Apply 0057_outstanding_iter2 — additive cols + responsibles table + drop employees FK.
// DDL-only, idempotent, no row data touched.
// Run via:  pnpm tsx --env-file=.env.local scripts/apply-outstanding-iter2.ts
import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const sql = postgres(url, { max: 1 });

async function main() {
  // 1. Apply the idempotent migration SQL.
  const file = readFileSync(
    "db/migrations/0057_outstanding_iter2.sql",
    "utf8",
  );
  await sql.unsafe(file);
  console.log("Applied 0057_outstanding_iter2.sql");

  // 2. Dynamically drop the OLD employees FK on responsible_id for both tables.
  //    Constraint names vary, so discover them via pg_constraint by inspecting
  //    which FKs on responsible_id reference the employees table.
  for (const tableName of ["outstanding_contracts", "outstanding_collections"]) {
    const fks = await sql<{ conname: string }[]>`
      SELECT con.conname
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
        JOIN pg_class fref ON fref.oid = con.confrelid
        JOIN pg_attribute att
          ON att.attrelid = con.conrelid
         AND att.attnum = ANY (con.conkey)
       WHERE con.contype = 'f'
         AND nsp.nspname = 'public'
         AND rel.relname = ${tableName}
         AND fref.relname = 'employees'
         AND att.attname = 'responsible_id'`;
    if (fks.length === 0) {
      console.log(`${tableName}.responsible_id -> employees FK: none found`);
    } else {
      for (const { conname } of fks) {
        await sql.unsafe(
          `ALTER TABLE ${tableName} DROP CONSTRAINT IF EXISTS "${conname}"`,
        );
        console.log(`${tableName}: dropped employees FK constraint "${conname}"`);
      }
    }
  }

  console.log("\n--- VERIFICATION ---");

  // 3a. outstanding_responsibles table exists.
  {
    const [row] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'outstanding_responsibles'`;
    console.log(`table outstanding_responsibles: ${row?.n === 1 ? "OK" : "MISSING"}`);
  }

  // 3b. New columns on outstanding_contracts.
  const contractCols = [
    "first_name",
    "last_name",
    "retainer_start",
    "retainer_end",
    "bill_date",
    "emi_count",
    "frequency",
    "import_batch_id",
  ];
  for (const col of contractCols) {
    const [row] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'outstanding_contracts'
         AND column_name = ${col}`;
    console.log(`outstanding_contracts.${col}: ${row?.n === 1 ? "OK" : "MISSING"}`);
  }

  // 3c. New column on outstanding_collections.
  {
    const [row] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'outstanding_collections'
         AND column_name = 'import_batch_id'`;
    console.log(`outstanding_collections.import_batch_id: ${row?.n === 1 ? "OK" : "MISSING"}`);
  }

  // 3d. Current FK constraints on responsible_id (should be none after drop).
  for (const tableName of ["outstanding_contracts", "outstanding_collections"]) {
    const fks = await sql<{ conname: string; ref: string }[]>`
      SELECT con.conname, fref.relname AS ref
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
        JOIN pg_class fref ON fref.oid = con.confrelid
        JOIN pg_attribute att
          ON att.attrelid = con.conrelid
         AND att.attnum = ANY (con.conkey)
       WHERE con.contype = 'f'
         AND nsp.nspname = 'public'
         AND rel.relname = ${tableName}
         AND att.attname = 'responsible_id'`;
    if (fks.length === 0) {
      console.log(`${tableName}.responsible_id FKs after drop: none (OK)`);
    } else {
      for (const { conname, ref } of fks) {
        console.log(`${tableName}.responsible_id FK remaining: "${conname}" -> ${ref}`);
      }
    }
  }
}

main()
  .then(() => sql.end())
  .catch(async (e) => {
    console.error(e);
    await sql.end();
    process.exit(1);
  });
