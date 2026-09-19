/**
 * Apply migration 0226 against the LIVE schema inside a transaction, assert the
 * result, and ROLL BACK.
 *
 * Postgres DDL is transactional, so this is a real dry run: every statement in
 * the file executes against the actual database, and nothing survives. It
 * catches the failures a migration file cannot be reasoned about on its own —
 * a column that already exists, a constraint name that collides, a referenced
 * table that is not what the file assumed.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/validate-migration-0226.ts
 */
import { readFileSync } from "node:fs";
import postgres from "postgres";

const FILE = "db/migrations/0226_billing_master.sql";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Run with --env-file=.env.local");
  process.exit(1);
}
const sql = postgres(url, { max: 1, onnotice: () => {} });

/** The billing columns 0226 adds to `paying_entities`. */
const NEW_COLUMNS = [
  "proprietor_name",
  "proprietor_designation",
  "address",
  "cell_no",
  "email",
  "website",
  "pan_no",
  "gst_no",
  "sac_codes",
  "bank_name",
  "account_name",
  "account_number",
  "ifsc",
  "branch",
  "updated_by_id",
] as const;

async function main() {
  const ddl = readFileSync(FILE, "utf8");
  let failed = false;
  const fail = (m: string) => {
    failed = true;
    console.error(`  FAIL  ${m}`);
  };
  const pass = (m: string) => console.log(`  ✓ ${m}`);

  console.log(`Dry-running ${FILE} against the live schema.\n`);

  await sql
    .begin(async (tx) => {
      // ── BEFORE: the table must be what the migration assumes ──────────────
      const before = await tx<{ column_name: string }[]>`
        SELECT column_name FROM information_schema.columns
         WHERE table_name = 'paying_entities'`;
      const had = new Set(before.map((r) => r.column_name));
      if (!had.has("name") || !had.has("code_prefix")) {
        fail("paying_entities is not the table this migration expects");
        throw new Error("__ROLLBACK__");
      }
      pass(`paying_entities exists with ${had.size} columns`);

      const rowCount = Number(
        (await tx<{ n: string }[]>`SELECT count(*) AS n FROM paying_entities`)[0]!.n,
      );
      console.log(`  ${rowCount} existing entities\n`);

      // ── APPLY ─────────────────────────────────────────────────────────────
      await tx.unsafe(ddl);
      pass("the migration applied with no error");

      // ── COLUMNS ───────────────────────────────────────────────────────────
      const after = await tx<
        { column_name: string; is_nullable: string; column_default: string | null }[]
      >`
        SELECT column_name, is_nullable, column_default
          FROM information_schema.columns
         WHERE table_name = 'paying_entities'`;
      const byName = new Map(after.map((r) => [r.column_name, r]));

      for (const col of NEW_COLUMNS) {
        const c = byName.get(col);
        if (!c) {
          fail(`paying_entities.${col} was not created`);
          continue;
        }
        /**
         * Every billing column must be NULLABLE except `sac_codes`.
         *
         * A NOT NULL column on a table with existing rows would need a default
         * or a backfill, and there is no honest default for somebody's GST
         * number. `sac_codes` is the exception because an empty array is a
         * truthful "none recorded" and lets every reader skip a null check.
         */
        if (col === "sac_codes") {
          if (c.is_nullable !== "NO") fail("sac_codes should be NOT NULL");
          if (!c.column_default?.includes("{}")) fail("sac_codes should default to an empty array");
        } else if (c.is_nullable !== "YES") {
          fail(`paying_entities.${col} must be nullable, got NOT NULL`);
        }
      }
      pass(`all ${NEW_COLUMNS.length} billing columns present, nullability correct`);

      // THE FIELD THE BRIEF REMOVES. Nothing resembling an entity code.
      const codeish = after
        .map((r) => r.column_name)
        .filter((n) => /^entity_code$|_entity_code$|^code$/.test(n));
      if (codeish.length > 0) fail(`an entity-code column exists: ${codeish.join(", ")}`);
      else pass("no Entity Code column — `code_prefix` (employee numbering) is untouched");

      // ── EXISTING ROWS UNHARMED ────────────────────────────────────────────
      const stillThere = Number(
        (await tx<{ n: string }[]>`SELECT count(*) AS n FROM paying_entities`)[0]!.n,
      );
      if (stillThere !== rowCount) fail(`row count changed: ${rowCount} → ${stillThere}`);
      else pass(`all ${rowCount} existing entities intact`);

      const dirty = Number(
        (
          await tx<{ n: string }[]>`
        SELECT count(*) AS n FROM paying_entities
         WHERE gst_no IS NOT NULL OR pan_no IS NOT NULL OR updated_by_id IS NOT NULL
           OR sac_codes <> '{}'`
        )[0]!.n,
      );
      if (dirty !== 0) fail(`${dirty} existing rows were given billing data by the migration`);
      else pass("no existing row was given invented billing data");

      // ── THE TWO NEW TABLES ────────────────────────────────────────────────
      for (const t of ["billing_entity_files", "billing_entity_versions"]) {
        const cols = await tx<{ column_name: string }[]>`
          SELECT column_name FROM information_schema.columns WHERE table_name = ${t}`;
        if (cols.length === 0) fail(`${t} was not created`);
        else pass(`${t} created with ${cols.length} columns`);
      }

      // The `kind` CHECK constraint must actually refuse a bad value.
      const [entity] = await tx<{ id: string }[]>`
        INSERT INTO paying_entities (name) VALUES ('__validate_0226__') RETURNING id`;
      let refused = false;
      try {
        await tx.savepoint(async (sp) => {
          await sp`
            INSERT INTO billing_entity_files (entity_id, kind, storage_path, file_name)
            VALUES (${entity!.id}, 'not_a_kind', 'x', 'x')`;
        });
      } catch {
        refused = true;
      }
      if (!refused) fail("the kind CHECK constraint did not refuse an invalid value");
      else pass("kind CHECK refuses anything but logo/signature/document");

      // One logo per entity, enforced by the partial unique index.
      await tx`
        INSERT INTO billing_entity_files (entity_id, kind, storage_path, file_name)
        VALUES (${entity!.id}, 'logo', 'a', 'a.png')`;
      let secondRefused = false;
      try {
        await tx.savepoint(async (sp) => {
          await sp`
            INSERT INTO billing_entity_files (entity_id, kind, storage_path, file_name)
            VALUES (${entity!.id}, 'logo', 'b', 'b.png')`;
        });
      } catch {
        secondRefused = true;
      }
      if (!secondRefused) fail("a second logo was accepted for the same entity");
      else pass("partial unique index allows only ONE logo per entity");

      // …but many documents.
      await tx`
        INSERT INTO billing_entity_files (entity_id, kind, storage_path, file_name)
        VALUES (${entity!.id}, 'document', 'c', 'c.pdf'),
               (${entity!.id}, 'document', 'd', 'd.pdf')`;
      pass("multiple documents per entity are allowed");

      // Deleting the entity cascades the file rows and SPARES the versions.
      await tx`
        INSERT INTO billing_entity_versions (entity_id, entity_name, snapshot, reason)
        VALUES (${entity!.id}, '__validate_0226__', '{"v":1}'::jsonb, 'created')`;
      await tx`DELETE FROM paying_entities WHERE id = ${entity!.id}`;
      const orphanFiles = Number(
        (
          await tx<{ n: string }[]>`
        SELECT count(*) AS n FROM billing_entity_files WHERE entity_id = ${entity!.id}`
        )[0]!.n,
      );
      const keptVersions = Number(
        (
          await tx<{ n: string }[]>`
        SELECT count(*) AS n FROM billing_entity_versions WHERE entity_id = ${entity!.id}`
        )[0]!.n,
      );
      if (orphanFiles !== 0) fail(`${orphanFiles} file rows survived the entity delete`);
      else pass("file rows cascade away with the entity");
      if (keptVersions !== 1) fail("the version row did NOT survive the entity delete");
      else pass("version history SURVIVES the entity delete — the point of having no FK");

      throw new Error("__ROLLBACK__");
    })
    .catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "__ROLLBACK__") {
        console.log("\nRolled back. The database is unchanged.");
        return;
      }
      failed = true;
      console.error("\nAborted (and rolled back):", msg);
    });

  await sql.end();
  if (failed) {
    console.error("\nVALIDATION FAILED — do not apply 0226.");
    process.exit(1);
  }
  console.log("VALIDATION PASSED — 0226 is safe to apply.");
}

void main();
