/**
 * ONE-OFF: apply migration 0182 (hr_form_submissions status CHECK constraint).
 *
 * WHY THIS EXISTS instead of `pnpm db:migrate --apply`: same reason as its 0181
 * sibling — that applier is all-or-nothing and this database still has 0169-0180
 * pending against a REMOTE Supabase instance. This script does exactly one
 * migration and records it in the same `__schema_applied` ledger the real
 * applier reads, so the normal path skips it later. Once 0169-0180 are applied
 * through `pnpm db:migrate`, both this file and apply-0181 can be deleted.
 *
 * SAFETY:
 *   • The only write to existing data is an UPDATE folding out-of-enum `status`
 *     values into 'draft' (the column default). Nothing is dropped or deleted.
 *   • Re-runnable. The constraint is added behind a pg_constraint existence
 *     check and the ledger insert is ON CONFLICT DO NOTHING.
 *   • The dry run reports exactly which rows the UPDATE would touch, so you can
 *     see the blast radius before authorising it.
 *
 * Usage:
 *   pnpm tsx --env-file=.env.local scripts/apply-0182-hr-form-status-check.ts
 *   pnpm tsx --env-file=.env.local scripts/apply-0182-hr-form-status-check.ts --apply
 *
 * Without --apply it reports what it WOULD do and writes nothing.
 */
import { readFileSync } from "node:fs";
import postgres from "postgres";

const APPLY = process.argv.includes("--apply");
const FILENAME = "0182_hr_form_submissions_hardening.sql";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const sql = postgres(url, { max: 1, prepare: false });

async function main(): Promise<void> {
  console.log(`\n${APPLY ? "APPLYING" : "DRY RUN"} — ${FILENAME}\n`);

  // ── 1 · preconditions ────────────────────────────────────────────────
  const exists = await sql<{ n: number }[]>`
    select count(*)::int as n from information_schema.tables
    where table_schema = 'public' and table_name = 'hr_form_submissions'`;
  if ((exists[0]?.n ?? 0) === 0) {
    console.log("  table hr_form_submissions is MISSING — run apply-0181 first.\n");
    process.exitCode = 1;
    return;
  }

  const already = await sql<{ n: number }[]>`
    select count(*)::int as n from pg_constraint
    where conname = 'hr_form_submissions_status_chk'`;
  const constraintExists = (already[0]?.n ?? 0) > 0;
  console.log(`  constraint hr_form_submissions_status_chk: ${constraintExists ? "already present" : "MISSING → will add"}`);

  // ── 2 · blast radius of the normalisation ────────────────────────────
  const strays = await sql<{ status: string; n: number }[]>`
    select status, count(*)::int as n from hr_form_submissions
    where status not in ('draft', 'submitted')
    group by status order by n desc`;
  if (strays.length === 0) {
    console.log("  rows with an out-of-enum status: none");
  } else {
    const total = strays.reduce((n, r) => n + r.n, 0);
    console.log(`  rows with an out-of-enum status: ${total} → all become 'draft'`);
    for (const s of strays) console.log(`    ${JSON.stringify(s.status)}: ${s.n}`);
  }

  if (!APPLY) {
    console.log(`\nDry run only. Re-run with --apply to execute.\n`);
    return;
  }

  // ── 3 · apply ────────────────────────────────────────────────────────
  // cwd-relative, matching apply-0181 — run from the repo root.
  const ddl = readFileSync(`db/migrations/${FILENAME}`, "utf8");
  await sql.unsafe(ddl);
  console.log("  ✓ applied");

  // ── 4 · the ledger, so the real applier skips this file later ────────
  await sql`
    create table if not exists __schema_applied (
      filename text primary key,
      applied_at timestamptz not null default now()
    )`;
  await sql`
    insert into __schema_applied (filename) values (${FILENAME})
    on conflict do nothing`;
  console.log("  ✓ recorded in __schema_applied");

  console.log(`\nDone.\n`);
}

// Not top-level await: tsx transpiles these scripts to CJS, where it is a
// syntax error (the same reason apply-all-migrations.ts uses this shape).
main()
  .catch((e: unknown) => {
    console.error("\nFAILED:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => {
    void sql.end();
  });
