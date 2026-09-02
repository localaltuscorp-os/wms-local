#!/usr/bin/env tsx
/**
 * HISTORIC ATTENDANCE BACKFILL — repair attendance_logs from the attendance
 * SHEET for the period where in-app punches were lost to an app error.
 *
 *   DRY RUN (default — prints exactly what WOULD be inserted, writes nothing
 *   to attendance_logs; records a dry_run audit row in sync_runs):
 *     pnpm tsx --env-file=.env.local scripts/backfill-attendance.ts
 *
 *   WRITE (after the dry-run report is reviewed):
 *     pnpm tsx --env-file=.env.local scripts/backfill-attendance.ts --write --admin-email=<acting admin>
 *
 * Safety model (see lib/attendance/backfill.ts for the pure plan engine):
 *  - INSERT … ON CONFLICT (employee_id, log_date, kind) DO NOTHING — a genuine
 *    in-app self punch (or an earlier admin fix) is NEVER overwritten; only
 *    truly-missing slots are filled. Re-running is idempotent.
 *  - Rows are tagged source='admin', reason='correction', verify_method='none',
 *    recorded_by_id=<acting admin> — distinguishable from real punches forever.
 *  - Every repaired (employee, day) gets an immutable employee_events audit row
 *    (event_type 'attendance_sheet_backfill'), plus one sync_runs row per run.
 *  - Unmatched sheet names are REPORTED, never guessed.
 *  - Salary is NOT affected: /salary reads salary_breakup (the sheet) by
 *    design — this repairs the ATTENDANCE record only.
 */
import { readFileSync } from "node:fs";
import { and, gte, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { attendanceLogs, employees, employeeEvents, syncRuns } from "@/db/schema";
import { readSheetValuesReadonly } from "@/lib/google/read-sheet";
import { SALARY_NAME_ALIASES } from "@/lib/salary/profile-sheet";
import {
  normName,
  planBackfill,
  punchKey,
  type BackfillEmployee,
  type BackfillSheetRow,
} from "@/lib/attendance/backfill";

// ═══════════════════════════════════════════════════════════════════════════
// ── SINGLE CONFIG POINT ─ fill in when the attendance sheet arrives ─────────
// The sheet's id, tab/range and COLUMN LAYOUT are not known yet — do not
// guess them. When the user shares the sheet:
//  1. Share it with FIREBASE_CLIENT_EMAIL (Viewer) and set in .env.local:
//       ATTENDANCE_SHEET_ID    = <spreadsheet id>
//       ATTENDANCE_SHEET_RANGE = <'Tab'!A1:Z2000 — confirm tab + columns>
//  2. Implement parseAttendanceRows() below for the real layout (name / date /
//     in-time / out-time columns; if the sheet only has day-status codes and
//     no clock times, synthesize in/out from the employee schedule — org
//     defaults 10:50 / 19:20 or per-employee att_late_after/att_early_before —
//     so computeDayCode re-derives the same grade).
//  3. Flip LAYOUT_CONFIRMED to true.
// Until then the script refuses to run (clean exit, zero writes).
// ═══════════════════════════════════════════════════════════════════════════
const LAYOUT_CONFIRMED = false;
const ATTENDANCE_SHEET_ID = process.env.ATTENDANCE_SHEET_ID ?? "";
const ATTENDANCE_SHEET_RANGE = process.env.ATTENDANCE_SHEET_RANGE ?? "";

/**
 * Map the raw sheet matrix to backfill rows. STUB until the real layout is
 * known — one row per (employee, day) with wall-clock 'HH:mm' times in the
 * employee's timezone (null when that punch is unknown).
 */
function parseAttendanceRows(matrix: string[][]): BackfillSheetRow[] {
  void matrix; // TODO(layout): implement for the real sheet columns.
  return [];
}

// Sheet-name → app-name aliases: seeded from the reviewed salary alias table
// (same humans); add attendance-sheet-specific spellings here as the dry run
// surfaces them.
const EXTRA_ALIASES: Record<string, string> = {
  // "Sheet Spelling": "App Name",
};

const WRITE = process.argv.includes("--write");
const adminEmailArg = process.argv.find((a) => a.startsWith("--admin-email="));
const ADMIN_EMAIL = adminEmailArg ? adminEmailArg.slice("--admin-email=".length) : "";

async function main() {
  if (!LAYOUT_CONFIRMED) {
    console.log(
      "backfill-attendance: layout not configured yet.\n" +
        "Set ATTENDANCE_SHEET_ID + ATTENDANCE_SHEET_RANGE, implement parseAttendanceRows()\n" +
        "for the sheet's real columns, then flip LAYOUT_CONFIRMED = true. Nothing was written.",
    );
    return;
  }
  if (!ATTENDANCE_SHEET_ID || !ATTENDANCE_SHEET_RANGE) {
    throw new Error("ATTENDANCE_SHEET_ID / ATTENDANCE_SHEET_RANGE env vars are missing.");
  }
  if (WRITE && !ADMIN_EMAIL) {
    throw new Error("--write requires --admin-email=<the acting admin's email> for provenance.");
  }

  // 0) Ensure the sync_runs audit table exists (idempotent; journal is stale
  //    by convention, so migrations are applied by scripts like this one).
  await db.execute(sql.raw(readFileSync("db/migrations/0100_sync_runs.sql", "utf8")));
  await db.execute(
    sql.raw(
      `create table if not exists __schema_applied (filename text primary key, applied_at timestamptz not null default now());` +
        `insert into __schema_applied (filename) values ('0100_sync_runs.sql') on conflict do nothing;`,
    ),
  );

  // 1) Sheet → typed rows (read-only scope).
  const matrix = await readSheetValuesReadonly(ATTENDANCE_SHEET_ID, ATTENDANCE_SHEET_RANGE);
  const rows = parseAttendanceRows(matrix);
  if (rows.length === 0) {
    throw new Error(`Parsed 0 attendance rows from ${matrix.length} raw sheet rows — check the layout mapping.`);
  }

  // 2) Roster + acting admin.
  const emps = await db
    .select({ id: employees.id, name: employees.name, timezone: employees.timezone, email: employees.email })
    .from(employees);
  const byNorm = new Map<string, BackfillEmployee>(
    emps.map((e) => [normName(e.name), { id: e.id, name: e.name, timezone: e.timezone }]),
  );
  const aliases = new Map(
    Object.entries({ ...SALARY_NAME_ALIASES, ...EXTRA_ALIASES }).map(([s, a]) => [
      normName(s),
      normName(a),
    ]),
  );
  const admin = WRITE ? emps.find((e) => e.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) : undefined;
  if (WRITE && !admin) throw new Error(`No employee found with email ${ADMIN_EMAIL}`);

  // 3) Existing punches in the affected span — these ALWAYS win.
  const dates = rows.map((r) => r.date).sort();
  const [minDate, maxDate] = [dates[0]!, dates[dates.length - 1]!];
  const existingRows = await db
    .select({
      employeeId: attendanceLogs.employeeId,
      logDate: attendanceLogs.logDate,
      kind: attendanceLogs.kind,
    })
    .from(attendanceLogs)
    .where(and(gte(attendanceLogs.logDate, minDate), lte(attendanceLogs.logDate, maxDate)));
  const existing = new Set(existingRows.map((r) => punchKey(r.employeeId, r.logDate, r.kind)));

  // 4) Pure plan — the dry-run report and the write pass share it exactly.
  const plan = planBackfill(rows, byNorm, aliases, existing);

  // 5) Report.
  const byEmp = new Map<string, number>();
  for (const p of plan.inserts) byEmp.set(p.employeeName, (byEmp.get(p.employeeName) ?? 0) + 1);
  console.log(`${WRITE ? "WRITE" : "DRY RUN"} · span ${minDate} → ${maxDate}`);
  console.log(
    `  sheet rows: ${rows.length} · would insert: ${plan.inserts.length} punches · ` +
      `skipped (real punch exists): ${plan.skippedExisting} · invalid rows: ${plan.invalidRows}`,
  );
  for (const [name, n] of [...byEmp.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${name}: ${n} punch(es)`);
  }
  if (plan.unmatchedNames.length) {
    console.log(`  UNMATCHED names (add to EXTRA_ALIASES, never guessed): ${plan.unmatchedNames.join(", ")}`);
  }

  // 6) Audit run row (dry runs are audited too).
  const [run] = await db
    .insert(syncRuns)
    .values({
      job: "attendance_backfill",
      trigger: "script",
      actorId: admin?.id ?? null,
      dryRun: !WRITE,
      rowsRead: rows.length,
      rowsSkipped: plan.skippedExisting + plan.invalidRows,
      unmatchedNames: plan.unmatchedNames,
    })
    .returning({ id: syncRuns.id });

  if (!WRITE) {
    await db
      .update(syncRuns)
      .set({ status: "ok", finishedAt: new Date() })
      .where(sql`${syncRuns.id} = ${run!.id}`);
    console.log("Dry run only — nothing written to attendance_logs. Re-run with --write --admin-email=… to apply.");
    return;
  }

  // 7) WRITE: missing slots only. DO NOTHING (not DO UPDATE) — real punches win.
  let inserted = 0;
  const CHUNK = 200;
  for (let i = 0; i < plan.inserts.length; i += CHUNK) {
    const chunk = plan.inserts.slice(i, i + CHUNK);
    const res = await db
      .insert(attendanceLogs)
      .values(
        chunk.map((p) => ({
          employeeId: p.employeeId,
          logDate: p.logDate,
          kind: p.kind,
          loggedAt: p.loggedAt,
          source: "admin" as const,
          reason: "correction", // fixed reason the admin correction path already uses
          recordedById: admin!.id,
          verifyMethod: "none" as const,
        })),
      )
      .onConflictDoNothing({
        target: [attendanceLogs.employeeId, attendanceLogs.logDate, attendanceLogs.kind],
      })
      .returning({ id: attendanceLogs.id });
    inserted += res.length;
  }

  // 8) Immutable audit: one employee_events row per repaired (employee, day).
  const perDay = new Map<string, { employeeId: string; logDate: string; punches: string[] }>();
  for (const p of plan.inserts) {
    const k = `${p.employeeId}|${p.logDate}`;
    const cur = perDay.get(k) ?? { employeeId: p.employeeId, logDate: p.logDate, punches: [] };
    cur.punches.push(`${p.kind}@${p.wallClock}`);
    perDay.set(k, cur);
  }
  const audits = [...perDay.values()];
  for (let i = 0; i < audits.length; i += CHUNK) {
    await db.insert(employeeEvents).values(
      audits.slice(i, i + CHUNK).map((a) => ({
        employeeId: a.employeeId,
        actorId: admin!.id,
        eventType: "attendance_sheet_backfill",
        toValue: { logDate: a.logDate, punches: a.punches, syncRunId: run!.id },
        note: "Historic backfill from the attendance sheet (app-error repair)",
      })),
    );
  }

  await db
    .update(syncRuns)
    .set({ status: "ok", finishedAt: new Date(), rowsWritten: inserted })
    .where(sql`${syncRuns.id} = ${run!.id}`);

  console.log(`✓ inserted ${inserted} punch(es) across ${audits.length} day(s); ` +
    `${plan.inserts.length - inserted} slot(s) were filled concurrently and left untouched.`);
  console.log("Graded attendance recomputes live (nothing cached); salary stays sheet-driven by design.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("[backfill-attendance] failed:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
