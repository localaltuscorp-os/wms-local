/**
 * DUMMY MODE — build a throwaway Postgres on disk, with no server.
 *
 * WHY THIS EXISTS. Frontend work needs the app to RUN, and every screen in it
 * resolves the signed-in employee and then queries the database before it
 * renders anything. With the real database unreachable there are 344 query
 * functions across 108 modules standing between you and a rendered page — far
 * too many to stub one by one. So instead of faking the queries, this fakes the
 * DATABASE: PGlite is real PostgreSQL 18 compiled to WASM, running inside the
 * Node process, storing its data in a plain directory. No server, no Docker, no
 * Supabase account, no connection string that can expire.
 *
 * The app talks to it through the ordinary drizzle client (see lib/db/index.ts),
 * so every query, every write and every screen behaves as it really does —
 * against dummy rows.
 *
 * WHAT IT DOES, in order:
 *   1. Creates the data directory (default `.pglite/`, gitignored).
 *   2. Installs the two extensions the migrations need (pg_trgm, unaccent) and
 *      stubs the Supabase-only objects they reference (the `authenticated` /
 *      `anon` / `service_role` roles, `storage.objects`, `app.is_admin()`).
 *      These are placeholders: RLS is irrelevant here because the app connects
 *      as the superuser, which bypasses it.
 *   3. Applies every `db/migrations/*.sql` in filename order, using the same
 *      ledger and the same ALTER-TYPE-ADD-VALUE split as the real runner
 *      (scripts/apply-all-migrations.ts) so the schema matches production.
 *   4. Seeds dummy rows (scripts/dummy-db-seed.ts).
 *
 * Usage:
 *   pnpm dummy:setup          # build it (idempotent — safe to re-run)
 *   pnpm dummy:setup --reset  # delete the data directory and rebuild
 *
 * NOTHING HERE SHIPS. The data directory is gitignored, and lib/db/index.ts
 * only reaches for PGlite when DUMMY_MODE=true, which is refused outside
 * development. Delete `.pglite/` and unset DUMMY_MODE to go back to the real
 * database.
 */

import { readFileSync, readdirSync, rmSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { unaccent } from "@electric-sql/pglite/contrib/unaccent";
import { DUMMY_DB_DIR } from "../lib/db/dummy-dir";
import { seedDummyData, DUMMY_TOKENS } from "./dummy-db-seed";

const RESET = process.argv.includes("--reset");

interface Migration {
  filename: string;
  contents: string;
}

function loadMigrations(): Migration[] {
  return readdirSync("db/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => ({
      filename: f,
      contents: readFileSync(`db/migrations/${f}`, "utf8"),
    }));
}

/** `-- alter type task_status add value ...;` — a COMMENTED-OUT add-value. */
const COMMENTED_ADD_VALUE = /^\s*--\s*(alter\s+type\s+\S+\s+add\s+value\b.*)$/i;

/**
 * Split out statements that must run alone. `ALTER TYPE ... ADD VALUE` is the
 * famous case — the new value cannot be referenced in the same transaction.
 * Lifted from scripts/apply-all-migrations.ts so both runners produce the same
 * schema, with one addition.
 *
 * THE ADDITION: 0024 has its add-value COMMENTED OUT, because in the real
 * pipeline a separate script (scripts/apply-dont-know.ts) runs it on its own
 * connection first and the migration file documents that rather than doing it.
 * A runner that only reads the file therefore builds an enum with no
 * 'dont_know' in it, and the index and insert further down the same file fail
 * on `invalid input value for enum task_status`. Since running an add-value
 * alone is exactly what this function is FOR, the commented form is picked up
 * too — that is one migration today (verified by grep across all 205), and the
 * pattern is narrow enough that prose mentioning the syntax does not match:
 * it must be `--` then immediately the statement.
 */
function splitStandalone(text: string): { standalone: string[]; rest: string } {
  const standalone: string[] = [];
  const out: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const revived = line.match(COMMENTED_ADD_VALUE)?.[1];
    if (revived) {
      const stmt = revived.trim().replace(/;.*$/, "");
      standalone.push(`${stmt};`);
      out.push(line); // leave the comment in place; it is inert
      continue;
    }
    const code = line.replace(/--.*$/, "").trim();
    if (/^alter\s+type\b.*\badd\s+value\b/i.test(code)) {
      standalone.push(code.endsWith(";") ? code : `${code};`);
    } else {
      out.push(line);
    }
  }
  return { standalone, rest: out.join("\n") };
}

/**
 * The Supabase-shaped objects the migrations reference but PGlite has no
 * opinion about. Every one is a placeholder that exists purely so the DDL that
 * mentions it parses:
 *
 *   · the three roles appear in `grant`/`to authenticated` clauses
 *   · `storage.objects` is dropped-and-recreated policies by 0033, which needs
 *     the table to exist to name it
 *   · `app.is_admin()` is referenced by 14 RLS policies; admin enforcement in
 *     this app happens in route handlers, never in RLS, so `false` is correct
 *     and inert
 */
const SUPABASE_STUBS = `
  create schema if not exists storage;
  create schema if not exists app;

  create table if not exists storage.objects (
    id         text primary key,
    bucket_id  text,
    name       text,
    owner      uuid,
    created_at timestamptz default now(),
    metadata   jsonb
  );

  create or replace function app.is_admin() returns boolean
    language sql stable as $$ select false $$;
`;

async function main() {
  if (RESET) {
    console.log(`Removing ${DUMMY_DB_DIR} …`);
    rmSync(DUMMY_DB_DIR, { recursive: true, force: true });
  }

  console.log(`Opening PGlite at ${DUMMY_DB_DIR} …`);
  const pg = await PGlite.create({
    dataDir: DUMMY_DB_DIR,
    extensions: { pg_trgm, unaccent },
  });

  const { version } = (await pg.query<{ version: string }>("select version()")).rows[0]!;
  console.log(`  ${version.split(" on ")[0]}`);

  console.log("Installing extensions and Supabase stubs …");
  await pg.exec("create extension if not exists pg_trgm;");
  await pg.exec("create extension if not exists unaccent;");
  // Roles are cluster-wide and have no IF NOT EXISTS, so each is attempted
  // individually and an "already exists" is the expected outcome on a re-run.
  for (const role of ["authenticated", "anon", "service_role"]) {
    await pg.exec(`create role ${role};`).catch(() => {});
  }
  await pg.exec(SUPABASE_STUBS);

  // The by-filename ledger, same shape as the real runner's.
  await pg.exec(`
    create table if not exists __schema_applied (
      filename   text primary key,
      applied_at timestamptz not null default now()
    );
  `);
  const appliedRows = await pg.query<{ filename: string }>(
    "select filename from __schema_applied",
  );
  const applied = new Set(appliedRows.rows.map((r) => r.filename));

  const migrations = loadMigrations();
  console.log(`Applying ${migrations.length} migrations (${applied.size} already applied) …`);

  let ran = 0;
  let skipped = 0;
  for (const m of migrations) {
    if (applied.has(m.filename)) {
      skipped++;
      continue;
    }
    const { standalone, rest } = splitStandalone(m.contents);
    try {
      for (const stmt of standalone) await pg.exec(stmt);
      if (rest.trim()) await pg.exec(rest);
      await pg.query("insert into __schema_applied (filename) values ($1) on conflict do nothing", [
        m.filename,
      ]);
      ran++;
    } catch (err) {
      console.error(`\n  ✗ ${m.filename} failed:\n`, err);
      await pg.close();
      process.exit(1);
    }
  }
  console.log(`  applied: ${ran} · skipped: ${skipped}`);

  console.log("Seeding dummy data …");
  const summary = await seedDummyData(pg);
  for (const [table, n] of Object.entries(summary)) {
    console.log(`  ${table.padEnd(18)} ${n}`);
  }

  await pg.close();

  // THE SEEDED CANDIDATE LINKS, printed because they cannot be recovered any
  // other way: the app stores only a token's SHA-256, so there is no query that
  // gets a working URL back. These four come from fixed dev-only strings in
  // dummy-db-seed.ts, so they survive every rebuild and can be pasted straight
  // into a browser to open the flow as an outside candidate would see it.
  const port = process.env.PORT ?? "3002";
  const base = `http://localhost:${port}`;
  console.log(`\nCandidate links (open in a browser — no login needed):`);
  console.log(`  form, not started   ${base}/c/${DUMMY_TOKENS.fresh}`);
  console.log(`  form, part-filled   ${base}/c/${DUMMY_TOKENS.partial}`);
  console.log(`  form, submitted     ${base}/c/${DUMMY_TOKENS.submitted}`);
  console.log(`  policies, 2 signed  ${base}/c/${DUMMY_TOKENS.policies}`);

  console.log(`\nDone. Start the app with DUMMY_MODE=true (see pnpm dev:dummy).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
