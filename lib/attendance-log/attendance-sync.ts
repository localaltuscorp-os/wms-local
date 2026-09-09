import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { attendanceSheetDay, attendanceSheetMonth, syncRuns } from "@/db/schema";
import { readSheetValuesReadonly } from "@/lib/google/read-sheet";
import {
  ATT_LOG_ATTENDANCE_RANGE,
  ATT_LOG_KILL_SWITCH,
  ATT_LOG_SHEET_ID,
  attLogSyncConfigError,
} from "@/lib/attendance-log/config";
import {
  mapAttendanceSheetRows,
  type AttendanceDayRow,
  type AttendanceMonthRow,
} from "@/lib/attendance-log/attendance-sheet";
import { buildNameResolver } from "@/lib/attendance-log/match";

/**
 * LIVE "Attendance Sheet" tab sync — mirrors the HR attendance sheet into
 * attendance_sheet_month (summaries) + attendance_sheet_day (raw day codes).
 * Mirrors the shape of lib/salary/breakup-sync.ts.
 *
 * NON-DESTRUCTIVE by design: this is a parallel read-side truth layer. It
 * NEVER touches attendance_logs, punch grading or leave balances, and never
 * synthesizes punch times — the sheet's day CODES are stored verbatim with
 * provenance (source='attendance_log_sheet').
 *
 * Idempotence: upserts keyed on the unique (employee_name, month) /
 * (employee_name, month, day) indexes — re-running with an unchanged sheet is
 * a no-op, changed cells update in place, rows never disappear (a sheet
 * deletion is NOT propagated; deliberate fail-safe for HR history).
 *
 * Fail-safety:
 *  - kill switch / config missing → clean structured no-op, zero writes.
 *  - sheet unreadable or maps to 0 rows → run recorded as error, tables untouched.
 *  - malformed rows are skipped by the pure mapper (counted), never written.
 *  - PER-ROW FAILURE ISOLATION: upserts run in chunks; a failing chunk falls
 *    back to row-at-a-time so one poison row costs 1 row, not the run.
 *    (Deliberate deviation from the salary engine's all-or-nothing txn: this
 *    mirror is append/update-only history, partial progress is safe + resumable.)
 *  - unmatched employee names are REPORTED (sync_runs.unmatched_names), never
 *    guessed — the upsert key is employee_name, so nothing is lost.
 *  - DRY RUN: reads + maps + reports what WOULD change; writes ONLY the
 *    sync_runs audit row (dry_run = true), never the data tables.
 *
 * SECURITY: token minted with the READ-ONLY Sheets scope; this module never
 * logs row contents — counts and names only (sync_runs stores the same).
 */

export interface AttendanceSheetSyncSummary {
  runId: string;
  dryRun: boolean;
  /** Kept month rows read from the sheet (one per employee-month). */
  rowsRead: number;
  /** Day-code cells mapped from those rows. */
  dayRowsRead: number;
  monthRowsWritten: number;
  dayRowsWritten: number;
  rowsSkipped: number;
  rowsFailed: number;
  unmatchedNames: string[];
  monthsTouched: string[];
  /** Dry-run detail: month-key split vs the current table. */
  wouldInsertMonths: number;
  wouldUpdateMonths: number;
  /** First few would-insert keys, e.g. "Asha P 2026-06" (names only, no data). */
  sampleNewKeys: string[];
}

export type AttendanceSheetSyncResult =
  | ({ ok: true } & AttendanceSheetSyncSummary)
  | { ok: false; error: string; runId?: string };

const UPSERT_CHUNK = 200;

export async function runAttendanceSheetSync(opts: {
  trigger: "cron" | "admin" | "script";
  actorId?: string | null;
  dryRun?: boolean;
}): Promise<AttendanceSheetSyncResult> {
  if (process.env[ATT_LOG_KILL_SWITCH] === "true") {
    return { ok: false, error: `Attendance-log sync is disabled (${ATT_LOG_KILL_SWITCH}=true).` };
  }
  const configError = attLogSyncConfigError();
  if (configError) return { ok: false, error: configError };
  const dryRun = opts.dryRun === true;

  // 1) Open the audit run FIRST so even a crashed sync leaves a 'running'
  //    row an admin can see (and a stuck run is visible, not silent).
  const [run] = await db
    .insert(syncRuns)
    .values({
      job: "attendance_sheet",
      trigger: opts.trigger,
      actorId: opts.actorId ?? null,
      dryRun,
    })
    .returning({ id: syncRuns.id });
  const runId = run!.id;

  try {
    // 2) Read the live tab (read-only scope) + map with the pure mapper.
    const matrix = await readSheetValuesReadonly(ATT_LOG_SHEET_ID, ATT_LOG_ATTENDANCE_RANGE);
    const { months, days, skipped, duplicates } = mapAttendanceSheetRows(matrix);

    if (months.length === 0) {
      // A broken/blank read must never "succeed" into an untouched-but-green
      // run — fail loudly, tables untouched.
      throw new Error(
        `Sheet mapped to 0 attendance rows (${matrix.length} raw rows read) — check sharing, tab name and range.`,
      );
    }

    // 3) Resolve employee_id best-effort (norm + reviewed aliases).
    const resolver = await buildNameResolver();
    const monthValues = months.map((m) => toMonthValues(m, resolver.resolve(m.employeeName)));
    // Day rows reuse their month row's already-resolved employee_id (O(1) map —
    // there can be ~30x more day cells than month rows).
    const empIdByKey = new Map(monthValues.map((m) => [`${m.employeeName}|${m.month}`, m.employeeId]));
    const dayValues = days.map((d) => toDayValues(d, empIdByKey.get(`${d.employeeName}|${d.month}`) ?? null));

    // 4) Dry-run classification: month-level insert/update split against the
    //    current table (key-only select — cheap). Day rows follow their month:
    //    a NEW month's day cells are inserts; an existing month's are updates.
    let wouldInsertMonths = 0;
    let wouldUpdateMonths = 0;
    const sampleNewKeys: string[] = [];
    if (dryRun) {
      const existing = await db
        .select({ employeeName: attendanceSheetMonth.employeeName, month: attendanceSheetMonth.month })
        .from(attendanceSheetMonth);
      const existingKeys = new Set(existing.map((e) => `${e.employeeName.toLowerCase()}|${e.month}`));
      for (const m of months) {
        const key = `${m.employeeName.toLowerCase()}|${m.month}`;
        if (existingKeys.has(key)) {
          wouldUpdateMonths++;
        } else {
          wouldInsertMonths++;
          if (sampleNewKeys.length < 5) sampleNewKeys.push(`${m.employeeName} ${m.month.slice(0, 7)}`);
        }
      }
    }

    // 5) Write path (skipped entirely on dry-run): chunked idempotent upserts
    //    with per-row fallback isolation.
    let monthRowsWritten = 0;
    let dayRowsWritten = 0;
    let rowsFailed = 0;
    if (!dryRun) {
      const monthResult = await upsertIsolated(monthValues, upsertMonthChunk);
      monthRowsWritten = monthResult.written;
      rowsFailed += monthResult.failed;

      const dayResult = await upsertIsolated(dayValues, upsertDayChunk);
      dayRowsWritten = dayResult.written;
      rowsFailed += dayResult.failed;
    }

    const monthsTouched = [...new Set(months.map((m) => m.month.slice(0, 7)))].sort();
    const summary: AttendanceSheetSyncSummary = {
      runId,
      dryRun,
      rowsRead: months.length,
      dayRowsRead: days.length,
      monthRowsWritten,
      dayRowsWritten,
      rowsSkipped: skipped + duplicates,
      rowsFailed,
      unmatchedNames: [...resolver.unmatched].sort(),
      monthsTouched,
      wouldInsertMonths,
      wouldUpdateMonths,
      sampleNewKeys,
    };

    await db
      .update(syncRuns)
      .set({
        status: rowsFailed > 0 ? "error" : "ok",
        finishedAt: new Date(),
        rowsRead: summary.rowsRead,
        rowsWritten: summary.monthRowsWritten + summary.dayRowsWritten,
        rowsSkipped: summary.rowsSkipped,
        unmatchedNames: summary.unmatchedNames,
        error: rowsFailed > 0 ? `${rowsFailed} row(s) failed to upsert (isolated; rest written)` : null,
      })
      .where(sql`${syncRuns.id} = ${runId}`);

    // Counts only — never row contents.
    console.log(
      `[attlog-sync] ${dryRun ? "DRY-RUN " : ""}ok run=${runId} months=${summary.rowsRead} days=${summary.dayRowsRead} wrote=${summary.monthRowsWritten}+${summary.dayRowsWritten} skipped=${summary.rowsSkipped} failed=${rowsFailed} unmatched=${summary.unmatchedNames.length}`,
    );
    return { ok: true, ...summary };
  } catch (err) {
    const msg = (err instanceof Error ? err.message : String(err)).slice(0, 500);
    console.error(`[attlog-sync] failed run=${runId}: ${msg}`);
    try {
      await db
        .update(syncRuns)
        .set({ status: "error", finishedAt: new Date(), error: msg })
        .where(sql`${syncRuns.id} = ${runId}`);
    } catch (auditErr) {
      console.error("[attlog-sync] could not record failure", auditErr);
    }
    return { ok: false, error: msg, runId };
  }
}

// ── write helpers ────────────────────────────────────────────────────────────

type MonthValues = ReturnType<typeof toMonthValues>;
type DayValues = ReturnType<typeof toDayValues>;

/** Sheet month row → Drizzle insert values (numerics are strings in Drizzle). */
function toMonthValues(m: AttendanceMonthRow, empId: string | null) {
  const n = (v: number) => v.toFixed(2);
  return {
    fy: m.fy,
    month: m.month,
    employeeName: m.employeeName,
    employeeId: empId,
    designation: m.designation,
    companyName: m.companyName,
    present: n(m.present),
    holiday: n(m.holiday),
    weeklyOff: n(m.weeklyOff),
    pohFull: n(m.pohFull),
    pohHalf: n(m.pohHalf),
    halfDay: n(m.halfDay),
    absent: n(m.absent),
    daysInMonth: n(m.daysInMonth),
    totalDaysWorked: n(m.totalDaysWorked),
    remark: m.remark,
  };
}

/** Sheet day cell → Drizzle insert values (employee_id resolved via its month row). */
function toDayValues(d: AttendanceDayRow, empId: string | null) {
  return {
    employeeName: d.employeeName,
    employeeId: empId,
    month: d.month,
    day: d.day,
    statusCode: d.statusCode,
    date: d.date,
  };
}

async function upsertMonthChunk(chunk: MonthValues[]): Promise<void> {
  await db
    .insert(attendanceSheetMonth)
    .values(chunk)
    .onConflictDoUpdate({
      target: [attendanceSheetMonth.employeeName, attendanceSheetMonth.month],
      set: {
        fy: sql`excluded.fy`,
        employeeId: sql`excluded.employee_id`,
        designation: sql`excluded.designation`,
        companyName: sql`excluded.company_name`,
        present: sql`excluded.present`,
        holiday: sql`excluded.holiday`,
        weeklyOff: sql`excluded.weekly_off`,
        pohFull: sql`excluded.poh_full`,
        pohHalf: sql`excluded.poh_half`,
        halfDay: sql`excluded.half_day`,
        absent: sql`excluded.absent`,
        daysInMonth: sql`excluded.days_in_month`,
        totalDaysWorked: sql`excluded.total_days_worked`,
        remark: sql`excluded.remark`,
        importedAt: sql`now()`,
      },
    });
}

async function upsertDayChunk(chunk: DayValues[]): Promise<void> {
  await db
    .insert(attendanceSheetDay)
    .values(chunk)
    .onConflictDoUpdate({
      target: [attendanceSheetDay.employeeName, attendanceSheetDay.month, attendanceSheetDay.day],
      set: {
        employeeId: sql`excluded.employee_id`,
        statusCode: sql`excluded.status_code`,
        date: sql`excluded.date`,
        importedAt: sql`now()`,
      },
    });
}

/**
 * Chunked upsert with per-row failure isolation: a failing chunk retries
 * row-at-a-time so one poison row costs exactly that row.
 */
async function upsertIsolated<T>(
  values: T[],
  write: (chunk: T[]) => Promise<void>,
): Promise<{ written: number; failed: number }> {
  let written = 0;
  let failed = 0;
  for (let i = 0; i < values.length; i += UPSERT_CHUNK) {
    const chunk = values.slice(i, i + UPSERT_CHUNK);
    try {
      await write(chunk);
      written += chunk.length;
    } catch {
      for (const row of chunk) {
        try {
          await write([row]);
          written++;
        } catch (rowErr) {
          failed++;
          // Key only — never row contents.
          console.error(
            `[attlog-sync] row upsert failed: ${(rowErr instanceof Error ? rowErr.message : String(rowErr)).slice(0, 200)}`,
          );
        }
      }
    }
  }
  return { written, failed };
}
