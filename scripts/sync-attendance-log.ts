#!/usr/bin/env tsx
/**
 * One-off runner for the "Attendance log" Google Sheet sync engines
 * (lib/attendance-log/attendance-sync.ts + paid-leave-sync.ts).
 *
 * DRY RUN is the DEFAULT — reads the sheet, maps it, and reports exactly what
 * WOULD change (insert/update splits, skipped rows, unmatched names, sample
 * new keys); the ONLY write is each engine's dry_run audit row in sync_runs.
 *
 *   DRY RUN (default):
 *     pnpm tsx --conditions=react-server --env-file=.env.local scripts/sync-attendance-log.ts
 *     pnpm tsx --conditions=react-server --env-file=.env.local scripts/sync-attendance-log.ts --dry-run
 *
 *   WRITE (after the dry-run report is reviewed):
 *     pnpm tsx --conditions=react-server --env-file=.env.local scripts/sync-attendance-log.ts --write
 *
 *   One tab only:  --job=attendance | --job=paid-leave   (default: both)
 *
 * `--conditions=react-server` is required because the engines are
 * `server-only` modules (same technique as the other lib-importing scripts).
 * Prereq: apply migration 0101 first (scripts/apply-0101-attendance-log.ts).
 */
import { runAttendanceSheetSync } from "@/lib/attendance-log/attendance-sync";
import { runPaidLeaveSync } from "@/lib/attendance-log/paid-leave-sync";

const args = new Set(process.argv.slice(2));
const jobArg = process.argv.find((a) => a.startsWith("--job="))?.slice("--job=".length) ?? "both";
const write = args.has("--write");
const dryRun = !write; // dry-run unless --write is explicit (--dry-run is a no-op alias)

if (!["attendance", "paid-leave", "both"].includes(jobArg)) {
  console.error(`Unknown --job=${jobArg} (use attendance | paid-leave | both)`);
  process.exit(1);
}

async function main() {
  console.log(`━━ attendance-log sync · ${dryRun ? "DRY RUN (no data writes)" : "WRITE"} · job=${jobArg} ━━`);

  let failed = false;

  if (jobArg === "attendance" || jobArg === "both") {
    const r = await runAttendanceSheetSync({ trigger: "script", dryRun });
    if (r.ok) {
      console.log(`\n[Attendance Sheet] run=${r.runId}`);
      console.log(`  month rows read: ${r.rowsRead} · day cells: ${r.dayRowsRead} · skipped: ${r.rowsSkipped}`);
      console.log(`  months touched : ${r.monthsTouched.length} (${r.monthsTouched[0] ?? "-"} … ${r.monthsTouched.at(-1) ?? "-"})`);
      if (dryRun) {
        console.log(`  WOULD insert ${r.wouldInsertMonths} month(s), update ${r.wouldUpdateMonths} (day cells follow their month)`);
        if (r.sampleNewKeys.length) console.log(`  sample new: ${r.sampleNewKeys.join(" · ")}`);
      } else {
        console.log(`  wrote ${r.monthRowsWritten} month + ${r.dayRowsWritten} day rows · ${r.rowsFailed} failed`);
      }
      if (r.unmatchedNames.length) console.log(`  UNMATCHED names (${r.unmatchedNames.length}): ${r.unmatchedNames.join(", ")}`);
      if (r.rowsFailed > 0) failed = true;
    } else {
      console.error(`\n[Attendance Sheet] FAILED: ${r.error}`);
      failed = true;
    }
  }

  if (jobArg === "paid-leave" || jobArg === "both") {
    const r = await runPaidLeaveSync({ trigger: "script", dryRun });
    if (r.ok) {
      console.log(`\n[Paid Leave] run=${r.runId}`);
      console.log(`  cycles read: ${r.rowsRead} across ${r.employeesRead} employee block(s) · skipped: ${r.rowsSkipped}`);
      if (dryRun) {
        console.log(`  WOULD insert ${r.wouldInsert}, update ${r.wouldUpdate}`);
        if (r.sampleNewKeys.length) console.log(`  sample new: ${r.sampleNewKeys.join(" · ")}`);
      } else {
        console.log(`  wrote ${r.rowsWritten} cycle rows · ${r.rowsFailed} failed`);
      }
      if (r.unmatchedNames.length) console.log(`  UNMATCHED names (${r.unmatchedNames.length}): ${r.unmatchedNames.join(", ")}`);
      if (r.rowsFailed > 0) failed = true;
    } else {
      console.error(`\n[Paid Leave] FAILED: ${r.error}`);
      failed = true;
    }
  }

  console.log(dryRun ? "\nDry run complete — nothing written. Re-run with --write to apply." : "\nDone.");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
