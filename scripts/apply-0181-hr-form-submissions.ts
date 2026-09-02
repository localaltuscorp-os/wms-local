/**
 * ONE-OFF: apply migration 0181 (hr_form_submissions) and backfill it from the
 * existing `exit_records`.
 *
 * WHY THIS EXISTS instead of `pnpm db:migrate --apply`: that applier is
 * all-or-nothing, and this database had 13 migrations pending (0169–0180 plus
 * this one) against a REMOTE Supabase instance. Running twelve unrelated,
 * unreviewed migrations on a live database to ship one feature is not a trade
 * worth making, so this script does exactly one migration and records it in the
 * same `__schema_applied` ledger the real applier reads. Once 0169–0180 are
 * applied through the normal path, this file can be deleted.
 *
 * SAFETY:
 *   • Creates only. The migration is CREATE TABLE / CREATE INDEX IF NOT EXISTS —
 *     no existing table is altered or dropped.
 *   • `exit_records` is READ-ONLY here. The backfill only INSERTs into the new
 *     table.
 *   • Re-runnable. The ledger insert is ON CONFLICT DO NOTHING and the backfill
 *     skips rows already indexed, so running it twice changes nothing.
 *
 * Usage:
 *   pnpm tsx --env-file=.env.local scripts/apply-0181-hr-form-submissions.ts
 *   pnpm tsx --env-file=.env.local scripts/apply-0181-hr-form-submissions.ts --apply
 *
 * Without --apply it reports what it WOULD do and writes nothing.
 */
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { exitResponsesFor, exitFormKey } from "@/lib/hr/forms/exit-responses";
import { getHrForm } from "@/lib/hr/forms/registry";
import type { ExitInterviewData, ExitHandoverData } from "@/lib/hr/exit/schema";

const APPLY = process.argv.includes("--apply");
const FILENAME = "0181_hr_form_submissions.sql";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const sql = postgres(url, { max: 1, prepare: false });

async function main(): Promise<void> {
  console.log(`\n${APPLY ? "APPLYING" : "DRY RUN"} — ${FILENAME}\n`);

  // ── 1 · the table ────────────────────────────────────────────────────
  const exists = await sql<{ n: number }[]>`
    select count(*)::int as n from information_schema.tables
    where table_schema = 'public' and table_name = 'hr_form_submissions'`;
  const tableExists = (exists[0]?.n ?? 0) > 0;
  console.log(`  table hr_form_submissions: ${tableExists ? "already exists" : "MISSING → will create"}`);

  if (!tableExists && APPLY) {
    const ddl = readFileSync(`db/migrations/${FILENAME}`, "utf8");
    await sql.unsafe(ddl);
    console.log("  ✓ created");
  }

  // ── 2 · the ledger, so the real applier skips this file later ────────
  if (APPLY) {
    await sql`
      create table if not exists __schema_applied (
        filename text primary key,
        applied_at timestamptz not null default now()
      )`;
    await sql`
      insert into __schema_applied (filename) values (${FILENAME})
      on conflict do nothing`;
    console.log("  ✓ recorded in __schema_applied");
  }

  if (!APPLY && !tableExists) {
    console.log("\n  (dry run — cannot preview the backfill until the table exists)\n");
    return;
  }

  // ── 3 · backfill from exit_records ───────────────────────────────────
  // Read-only over exit_records. Rows with no employee are skipped: the index is
  // keyed by WHOSE form it is, and an orphaned record has no owner to file it
  // under (it stays reachable through /hr/exit exactly as today).
  const records = await sql<
    { id: string; employee_id: string | null; kind: string; data: unknown; created_by_id: string | null; updated_at: Date }[]
  >`
    select id, employee_id, kind, data, created_by_id, updated_at
    from exit_records
    order by updated_at asc`;

  console.log(`\n  exit_records found: ${records.length}`);

  let inserted = 0;
  let skippedNoEmployee = 0;
  let skippedExisting = 0;
  let skippedUnknownKind = 0;

  for (const r of records) {
    if (!r.employee_id) {
      skippedNoEmployee++;
      continue;
    }
    if (r.kind !== "interview" && r.kind !== "handover") {
      skippedUnknownKind++;
      continue;
    }

    const formKey = exitFormKey(r.kind);
    const def = getHrForm(formKey);
    if (!def) {
      skippedUnknownKind++;
      continue;
    }

    const already = await sql<{ n: number }[]>`
      select count(*)::int as n from hr_form_submissions
      where form_key = ${formKey} and employee_id = ${r.employee_id} and source_id = ${r.id}`;
    if ((already[0]?.n ?? 0) > 0) {
      skippedExisting++;
      continue;
    }

    const responses = exitResponsesFor(
      r.kind,
      (r.data ?? {}) as ExitInterviewData | ExitHandoverData,
    );

    if (APPLY) {
      await sql`
        insert into hr_form_submissions
          (form_key, form_name, section, employee_id, submitted_by_id, status, responses,
           source_table, source_id, submitted_at, created_at, updated_at)
        values
          (${formKey}, ${def.name}, ${def.section}, ${r.employee_id}, ${r.created_by_id},
           'draft', ${JSON.stringify(responses)}::jsonb,
           ${def.sourceTable}, ${r.id}, null, ${r.updated_at}, ${r.updated_at})`;
    }
    inserted++;
  }

  // Backfilled rows land as DRAFT, never "submitted": nobody ever pressed a
  // Submit button on them, and stamping a submission date that never happened
  // would put fiction into an HR record.
  console.log(`  ${APPLY ? "inserted" : "would insert"}: ${inserted} (as drafts)`);
  console.log(`  skipped — already indexed: ${skippedExisting}`);
  console.log(`  skipped — no employee on record: ${skippedNoEmployee}`);
  console.log(`  skipped — unrecognised kind: ${skippedUnknownKind}`);

  if (!APPLY) console.log(`\nDry run only. Re-run with --apply to execute.\n`);
  else console.log(`\nDone.\n`);
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
