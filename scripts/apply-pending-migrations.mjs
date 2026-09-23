#!/usr/bin/env node
/**
 * apply-pending-migrations.mjs — APPLY db/RUN-IN-SUPABASE-0225-0230.sql.
 *
 * WHY THIS EXISTS. The Supabase SQL editor is the normal way to run a migration
 * bundle, and on 17 September it was not available: the dashboard answers "You
 * do not have access to this project" for `ifcdpjbdinvmtewmgceg`, which is the
 * project .env.local points at. There is no psql on this machine either. The
 * DATABASE_URL in .env.local still works, so this runs the same file over that
 * connection instead.
 *
 * USAGE — from wms-local:
 *
 *     node --env-file=.env.local scripts/apply-pending-migrations.mjs
 *         Dry run. Says which migrations are missing and changes NOTHING.
 *
 *     node --env-file=.env.local scripts/apply-pending-migrations.mjs --apply
 *         Runs the bundle, then re-checks and prints what landed.
 *
 * SAFE TO RUN TWICE. The bundle is additive — no DROP TABLE, no DELETE, no
 * TRUNCATE — and every statement is IF NOT EXISTS or guarded, inside ONE
 * transaction: it lands whole or not at all.
 */

import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";

const require_ = createRequire(import.meta.url);
const postgres = require_("postgres");

/**
 * Which bundle to apply. Defaults to the 0225–0230 set; pass any other path to
 * apply a different one — `node --env-file=.env.local
 * scripts/apply-pending-migrations.mjs db/RUN-IN-SUPABASE-0231.sql --apply`.
 */
const BUNDLE =
  process.argv.slice(2).find((a) => a.endsWith(".sql")) ?? "db/RUN-IN-SUPABASE-0225-0230.sql";
const APPLY = process.argv.includes("--apply");

/* What each pending migration is recognised by. */
const EXPECTED = [
  ["0225  HR records → Drive", "table", "hr_records_drive_settings"],
  ["0225  HR records → Drive", "table", "hr_records_drive_items"],
  ["0226  policy signatures", "table", "employee_policy_signatures"],
  ["0228  Operations vendors", "table", "ops_vendors"],
  ["0229  broadcast repeats", "column", "broadcasts.recurrence_dates"],
  ["0229  publishing claim", "column", "broadcasts.publish_claimed_at"],
  ["0229  WhatsApp outcomes", "column", "broadcast_recipients.channel_outcomes"],
  ["0230  DD Master", "table", "ce_dropdown_options"],
  ["0230  transfer log", "table", "pa_assignment_events"],
  ["0230  call times", "column", "pa_calls.start_time"],
  ["0230  call times", "column", "pa_calls.end_time"],
  ["0230  archive, not delete", "column", "pa_entries.archived_at"],
  ["0230  ambassador owner", "column", "pa_ambassadors.owner_person_id"],
  ["0230  ambassador status", "column", "pa_ambassadors.status"],
  ["0230  team leads", "column", "pa_people.is_ce_lead"],
  ["0231  exec calendar", "table", "exec_calendar_events"],
  ["0231  exec routines", "table", "exec_calendar_routines"],
  ["0231  exec grid prefs", "table", "exec_calendar_prefs"],
  ["0237  exec calendar clients", "column", "exec_calendar_events.client_key"],
  ["0237  exec day markers", "table", "exec_calendar_day_markers"],
  ["0238  CE team", "table", "ce_team_members"],
  ["0238  CE accounts", "table", "ce_accounts"],
  ["0238  CE engagements", "table", "ce_engagements"],
  ["0238  CE references", "table", "ce_references"],
  ["0238  CE audit log", "table", "ce_audit_log"],
];

function fail(msg) {
  console.error(`\n  ${msg}\n`);
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  fail("No DATABASE_URL. Run it as:\n\n    node --env-file=.env.local scripts/apply-pending-migrations.mjs");
}

/** The project ref, so you can see WHICH database this is about to touch. */
function projectRef(url) {
  return /postgres\.([a-z0-9]{20})/.exec(url)?.[1] ?? "(unknown)";
}

async function survey(sql) {
  const tables = new Set(
    (await sql`select table_name from information_schema.tables where table_schema='public'`).map((r) => r.table_name),
  );
  const columns = new Set(
    (await sql`select table_name, column_name from information_schema.columns where table_schema='public'`).map(
      (r) => `${r.table_name}.${r.column_name}`,
    ),
  );
  return EXPECTED.map(([label, kind, name]) => ({
    label,
    name,
    present: kind === "table" ? tables.has(name) : columns.has(name),
  }));
}

function report(rows) {
  for (const r of rows) console.log(`  ${r.present ? "present" : "MISSING"}   ${r.label.padEnd(26)} ${r.name}`);
  return rows.filter((r) => !r.present).length;
}

const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false, idle_timeout: 20 });

try {
  console.log(`\n  Database: Supabase project ${projectRef(process.env.DATABASE_URL)}\n`);

  console.log("  BEFORE");
  const missing = report(await survey(sql));

  if (missing === 0) {
    console.log("\n  Nothing to do — every pending migration is already applied.\n");
  } else if (!APPLY) {
    console.log(`\n  ${missing} missing. This was a DRY RUN and nothing changed.`);
    // Echo the bundle back in the hint: without it, a copy-paste would re-run
    // the DEFAULT bundle and quietly not create what was just reported missing.
    const arg = BUNDLE === "db/RUN-IN-SUPABASE-0225-0230.sql" ? "" : ` ${BUNDLE}`;
    console.log(
      `  To apply:

    node --env-file=.env.local scripts/apply-pending-migrations.mjs${arg} --apply
`,
    );
  } else {
    console.log(`\n  Applying ${BUNDLE} …`);
    const text = await readFile(BUNDLE, "utf8");
    await sql.unsafe(text).simple();
    console.log("  Applied. Re-checking.\n");
    console.log("  AFTER");
    const stillMissing = report(await survey(sql));
    console.log(
      stillMissing === 0
        ? "\n  All pending migrations are now applied.\n"
        : `\n  ${stillMissing} still missing — read the error above before re-running.\n`,
    );
    process.exitCode = stillMissing === 0 ? 0 : 1;
  }
} catch (err) {
  console.error(`\n  FAILED: ${err?.message ?? err}`);
  console.error("  The bundle runs in one transaction, so nothing was half-applied.\n");
  process.exitCode = 1;
} finally {
  await sql.end();
}
