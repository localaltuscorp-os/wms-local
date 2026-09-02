// Phase 2.3 — bring a Postgres database up to the current schema by
// applying every `db/migrations/*.sql` in filename order, idempotently.
//
// Why this exists: the drizzle journal at `db/migrations/meta/_journal.json`
// is stale (last good entry is 0019; everything since has been applied
// via standalone scripts like apply-migration.ts). `pnpm db:migrate`
// silently skips half the schema on a fresh DB. This script replaces
// that path.
//
// All migrations from 0023+ are written defensively (create-if-not-exists,
// on-conflict, drop-if-exists for policies). The earlier ones (0001-0022)
// are mostly idempotent too; the few that aren't are guarded by their
// own create-if-not-exists DDL. If you're applying to an already-populated
// DB, every individual statement either no-ops or succeeds.
//
// Special-case: 0024 contains `alter type task_status add value` which
// must run on its own (no transaction). We split that statement out
// when we encounter it.
//
// Usage:
//   pnpm tsx --env-file=.env.local scripts/apply-all-migrations.ts        # dry-run
//   pnpm tsx --env-file=.env.local scripts/apply-all-migrations.ts --apply
import { readFileSync, readdirSync } from "node:fs";
import postgres from "postgres";
import { destructiveStatements } from "../lib/db/destructive-sql";

const APPLY = process.argv.includes("--apply");

/**
 * DESTRUCTIVE MIGRATIONS NEED A HUMAN TO NAME THEM.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * This script applies every un-ledgered `db/migrations/*.sql` in filename order,
 * unattended. That is exactly what you want for additive DDL and exactly what
 * you do not want for a `DROP TABLE`: `pnpm db:migrate` is run casually, often
 * to pick up somebody else's column, and it will just as happily execute a
 * migration that deletes years of history.
 *
 * This is not hypothetical. On 2026-08-27 a `0203_drop_attendance_module.sql`
 * reached the tree carrying `DROP`s for the whole attendance stack — its own
 * header said "DESTRUCTIVE: all historic punch, leave and attendance-sheet data
 * is lost — back up before applying". Nothing here would have paused for that.
 * The file was reverted before any migrate run happened to pick it up, which was
 * luck, not design.
 *
 * ── WHAT COUNTS ────────────────────────────────────────────────────────────
 * Only DDL that destroys ROWS: dropping tables, columns, schemas or databases,
 * truncating, deleting. Deliberately NOT `DROP INDEX / POLICY / TRIGGER /
 * CONSTRAINT` — 27 migrations here use those routinely and none of them lose
 * data. A guard that cried wolf on ordinary migrations would be switched off
 * within a week, which is worse than no guard.
 *
 * At the time of writing this matches exactly 1 of ~210 migrations, so the
 * signal is real rather than background noise.
 *
 * ── HOW TO PROCEED WHEN IT FIRES ───────────────────────────────────────────
 * Read the migration, take a backup, then name the file explicitly:
 *
 *   pnpm db:migrate -- --allow-destructive=0203_drop_attendance_module.sql
 *
 * Naming the FILE is the point. A bare `--force` would be typed reflexively and
 * would wave through whatever else happened to be pending; naming it means you
 * looked at that specific migration. `--allow-destructive=all` exists for
 * rebuilding a database from empty, where every migration is pending and the
 * historical destructive ones have nothing to destroy.
 */
/** Detection lives in lib/db/destructive-sql.ts so it can be unit-tested without
 *  this script's top-level database connection running on import. */
const ALLOW_DESTRUCTIVE = new Set(
  process.argv
    .filter((a) => a.startsWith("--allow-destructive="))
    .flatMap((a) =>
      a
        .slice("--allow-destructive=".length)
        .split(",")
        .map((s) => s.trim()),
    )
    .filter(Boolean),
);
const ALLOW_ALL_DESTRUCTIVE = ALLOW_DESTRUCTIVE.has("all");

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const sql = postgres(url, { max: 1, prepare: false });

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

/**
 * Split a migration's contents into pre-statements that need to run
 * stand-alone (Postgres `ALTER TYPE ... ADD VALUE` is the famous case —
 * the new value can't be referenced in the same transaction) and the
 * rest. We use a simple regex scan over commented-uncommented lines;
 * the codebase only uses ADD VALUE in 0024 so this stays tiny.
 */
function splitStandalone(text: string): { standalone: string[]; rest: string } {
  const standalone: string[] = [];
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  for (const line of lines) {
    const code = line.replace(/--.*$/, "").trim();
    if (/^alter\s+type\b.*\badd\s+value\b/i.test(code)) {
      const trimmed = code.endsWith(";") ? code : `${code};`;
      standalone.push(trimmed);
    } else {
      out.push(line);
    }
  }
  return { standalone, rest: out.join("\n") };
}

async function ensureLedger(): Promise<void> {
  // A tiny by-filename ledger of which migrations have already been run
  // on this database. Lets the applier skip already-applied files instead
  // of relying on every individual statement being idempotent (the early
  // drizzle-kit migrations use bare `CREATE TYPE` which Postgres can't
  // re-run). Mirrors drizzle's own `__drizzle_migrations` but keyed by
  // filename instead of content hash.
  await sql.unsafe(`
    create table if not exists __schema_applied (
      filename text primary key,
      applied_at timestamptz not null default now()
    );
  `);
}

async function alreadyApplied(filename: string): Promise<boolean> {
  const rows = (await sql.unsafe(
    `select 1 from __schema_applied where filename = $1`,
    [filename],
  )) as unknown as { "?column?": number }[];
  return rows.length > 0;
}

async function recordApplied(filename: string): Promise<void> {
  await sql.unsafe(
    `insert into __schema_applied (filename) values ($1) on conflict do nothing`,
    [filename],
  );
}

/**
 * Backfill the ledger so an already-populated DB doesn't try to re-apply
 * everything on first script run. We check for a couple of "definitely
 * present after migration X" objects and stamp all earlier filenames as
 * applied. Each probe is cheap and the whole backfill runs once.
 */
async function backfillLedger(migrations: Migration[]): Promise<void> {
  // Probe: if the `task_status` enum exists, 0000 ran. If `tasks` has
  // `recurrence_rule`, 0026 ran. We just walk through known-landmark
  // probes and stamp accordingly.
  const probes: Array<{ stampUpTo: string; check: string; expect: number | null }> = [
    {
      stampUpTo: "0028_documents.sql",
      check: `select count(*)::int as n from information_schema.tables where table_name = 'documents'`,
      expect: 1,
    },
    {
      stampUpTo: "0027_project_nodes.sql",
      check: `select count(*)::int as n from information_schema.tables where table_name = 'project_nodes'`,
      expect: 1,
    },
    {
      stampUpTo: "0026_recurrence_rule.sql",
      check: `select count(*)::int as n from information_schema.columns where table_name = 'tasks' and column_name = 'recurrence_rule'`,
      expect: 1,
    },
    {
      stampUpTo: "0025_subjects.sql",
      check: `select count(*)::int as n from information_schema.tables where table_name = 'subjects'`,
      expect: 1,
    },
    {
      stampUpTo: "0022_clients.sql",
      check: `select count(*)::int as n from information_schema.tables where table_name = 'clients'`,
      expect: 1,
    },
    {
      stampUpTo: "0000_harsh_thena.sql",
      check: `select count(*)::int as n from pg_type where typname = 'employee_role'`,
      expect: 1,
    },
  ];

  for (const probe of probes) {
    const rows = (await sql.unsafe(probe.check)) as unknown as { n: number }[];
    if ((rows[0]?.n ?? 0) > 0) {
      for (const m of migrations) {
        if (m.filename <= probe.stampUpTo) {
          await recordApplied(m.filename);
        }
      }
      return; // Stamped everything up to the highest landmark we saw.
    }
  }
}

/**
 * Abort BEFORE anything is applied if a pending migration destroys rows and
 * nobody named it.
 *
 * The check runs up front, over the whole pending set, rather than inline in the
 * apply loop. Refusing half-way would leave the database in a state that is
 * neither the old schema nor the new one, and the operator would have to work
 * out which migrations had already landed before they could safely retry. All or
 * nothing is the only outcome worth offering here.
 *
 * Only PENDING migrations are scanned. Everything in the ledger has already run;
 * re-flagging it would mean a database that is perfectly healthy could never be
 * migrated again without a flag.
 */
async function refuseUnapprovedDestructive(migrations: Migration[]): Promise<void> {
  if (ALLOW_ALL_DESTRUCTIVE) return;

  const blocked: { filename: string; statements: string[] }[] = [];
  for (const m of migrations) {
    if (await alreadyApplied(m.filename)) continue;
    if (ALLOW_DESTRUCTIVE.has(m.filename)) continue;
    const statements = destructiveStatements(m.contents);
    if (statements.length > 0) blocked.push({ filename: m.filename, statements });
  }
  if (blocked.length === 0) return;

  console.error(`\n${"─".repeat(72)}`);
  console.error(`REFUSING TO MIGRATE — ${blocked.length} pending migration(s) destroy data.\n`);
  for (const b of blocked) {
    console.error(`  ${b.filename}`);
    for (const s of b.statements.slice(0, 6)) console.error(`      ${s}`);
    if (b.statements.length > 6) console.error(`      … and ${b.statements.length - 6} more`);
    console.error("");
  }
  console.error(`Nothing has been applied. Read each migration, take a backup, then`);
  console.error(`re-run naming the file(s) you have actually reviewed:\n`);
  console.error(`  pnpm db:migrate -- --allow-destructive=${blocked.map((b) => b.filename).join(",")}\n`);
  console.error(`Rebuilding an empty database? --allow-destructive=all`);
  console.error(`${"─".repeat(72)}\n`);
  process.exit(1);
}

async function main() {
  const migrations = loadMigrations();
  console.log(
    `\n=== Phase 2.3 migration applier — ${migrations.length} migrations · ${APPLY ? "APPLY" : "DRY RUN"} ===\n`,
  );

  if (APPLY) {
    await ensureLedger();
    await backfillLedger(migrations);
    await refuseUnapprovedDestructive(migrations);
  }

  let applied = 0;
  let skipped = 0;
  for (const m of migrations) {
    const { standalone, rest } = splitStandalone(m.contents);
    const restHasWork = rest.replace(/--.*$/gm, "").trim().length > 0;
    const isApplied = APPLY && (await alreadyApplied(m.filename));
    const flag = isApplied ? "⊘ already applied" : "▶ pending";
    console.log(
      `${flag}  ${m.filename}${standalone.length ? ` · ${standalone.length} standalone` : ""}${restHasWork ? "" : " · (only comments)"}`,
    );
    if (!APPLY) continue;
    if (isApplied) {
      skipped++;
      continue;
    }
    try {
      for (const stmt of standalone) {
        await sql.unsafe(stmt);
      }
      if (restHasWork) {
        await sql.unsafe(rest);
      }
      await recordApplied(m.filename);
      applied++;
      console.log(`  ✓ applied`);
    } catch (err) {
      console.error(`  ✗ ${m.filename} failed:`, err);
      throw err;
    }
  }

  if (APPLY) {
    console.log(`\n=== applied: ${applied} · skipped: ${skipped} ===`);
  }

  // Quick sanity: count rows in a few headline tables so we know the
  // resulting schema actually holds data.
  if (APPLY) {
    console.log(`\n=== post-apply row counts ===`);
    for (const table of [
      "employees",
      "tasks",
      "task_events",
      "notifications",
      "subjects",
      "clients",
      "project_nodes",
      "documents",
      "notification_dispatch_log",
      "document_events",
    ]) {
      try {
        const rows = (await sql.unsafe(`select count(*)::int as n from ${table}`)) as unknown as { n: number }[];
        console.log(`  ${table}: ${rows[0]?.n ?? 0}`);
      } catch {
        console.log(`  ${table}: (table missing — migration didn't land)`);
      }
    }
  } else {
    console.log(`\nDry run only. Re-run with --apply to execute.`);
  }
}

main()
  .then(() => sql.end())
  .catch(async (e) => {
    console.error(e);
    await sql.end();
    process.exit(1);
  });
