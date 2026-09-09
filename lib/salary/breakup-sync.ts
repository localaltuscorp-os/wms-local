import "server-only";
import { sql } from "drizzle-orm";
import { db, salaryBreakup, syncRuns, employees } from "@/lib/db";
import { readSheetValuesReadonly } from "@/lib/google/read-sheet";
import { SALARY_NAME_ALIASES } from "@/lib/salary/profile-sheet";
import {
  SALARY_SHEET_ID,
  SALARY_SHEET_RANGE,
  mapSalaryBreakupRows,
  salarySyncConfigError,
  type SalaryBreakupSheetRow,
} from "@/lib/salary/breakup-sheet";

/**
 * LIVE salary-breakup sync — mirrors the HR salary Google Sheet into
 * `salary_breakup` so /salary always reflects the sheet (the sheet stays the
 * source of truth by design; migration 0099 header).
 *
 * Replaces the one-off scripts/import-salary-breakup.ts with the SAME
 * idempotent upsert, keyed on the unique (employee_name, month) index —
 * re-running with an unchanged sheet is a no-op, changed cells update in
 * place, and rows never disappear (a sheet deletion is NOT propagated; that
 * is deliberate fail-safe behaviour for payroll data).
 *
 * Fail-safety:
 *  - config missing / kill-switch on → clean structured no-op, zero writes.
 *  - sheet unreadable or maps to 0 rows → run recorded as error, table untouched.
 *  - malformed rows are skipped by the pure mapper (counted), never written.
 *  - all upserts run in ONE transaction → a mid-run failure rolls back fully;
 *    the table is always "previous good state" or "new sheet state", never half.
 *  - unmatched employee names are REPORTED (sync_runs.unmatched_names), never
 *    guessed — name drift in the sheet must be fixed by a human, because the
 *    upsert key is employee_name and a silent guess would fork pay rows.
 *
 * SECURITY: token minted with the READ-ONLY Sheets scope; this module never
 * logs row contents (salary figures are PII) — counts and names only.
 */

/** Kill switch, house convention: <FEATURE>_OFF === "true" disables. */
const KILL_SWITCH = "SALARY_SYNC_OFF";

export interface SalarySyncSummary {
  runId: string;
  rowsRead: number;
  rowsUpserted: number;
  rowsSkipped: number;
  unmatchedNames: string[];
  monthsTouched: string[];
}

export type SalarySyncResult =
  | ({ ok: true } & SalarySyncSummary)
  | { ok: false; error: string; runId?: string };

const normName = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

// Reviewed sheet-name → app-name aliases, pre-normalized (same table the
// salary-profile importer trusts).
const ALIAS = new Map(
  Object.entries(SALARY_NAME_ALIASES).map(([sheet, app]) => [normName(sheet), normName(app)]),
);

const UPSERT_CHUNK = 200;

export async function runSalaryBreakupSync(opts: {
  trigger: "cron" | "admin";
  actorId?: string | null;
}): Promise<SalarySyncResult> {
  if (process.env[KILL_SWITCH] === "true") {
    return { ok: false, error: `Salary sync is disabled (${KILL_SWITCH}=true).` };
  }
  const configError = salarySyncConfigError();
  if (configError) return { ok: false, error: configError };

  // 1) Open the audit run FIRST so even a crashed sync leaves a 'running'
  //    row an admin can see (and a stuck run is visible, not silent).
  const [run] = await db
    .insert(syncRuns)
    .values({ job: "salary_breakup", trigger: opts.trigger, actorId: opts.actorId ?? null })
    .returning({ id: syncRuns.id });
  const runId = run!.id;

  try {
    // 2) Read the live sheet (read-only scope) + map with the pure mapper.
    const matrix = await readSheetValuesReadonly(SALARY_SHEET_ID, SALARY_SHEET_RANGE);
    const { rows, skipped } = mapSalaryBreakupRows(matrix);

    if (rows.length === 0) {
      // A broken/blank read must never "succeed" into an untouched-but-green
      // run — fail loudly, table untouched.
      throw new Error(
        `Sheet mapped to 0 salary rows (${matrix.length} raw rows read) — check sharing, tab name and range.`,
      );
    }

    // 3) Resolve employee_id best-effort (norm + alias). Unmatched names are
    //    reported, and the row still lands with employee_id = null — exactly
    //    like the original importer.
    const emps = await db.select({ id: employees.id, name: employees.name }).from(employees);
    const idByName = new Map(emps.map((e) => [normName(e.name), e.id]));
    const unmatched = new Set<string>();

    const resolved = rows.map((r) => {
      const key = normName(r.employeeName);
      const empId = idByName.get(key) ?? idByName.get(ALIAS.get(key) ?? "") ?? null;
      if (!empId) unmatched.add(r.employeeName);
      return { row: r, empId };
    });

    // De-duplicate by the upsert key (employee_name, month): the sheet can carry
    // more than one row for the same person+month, and a single batch upsert
    // cannot touch the same conflict key twice ("ON CONFLICT DO UPDATE command
    // cannot affect row a second time"). Keep the LAST occurrence — a later
    // sheet row is the corrected/final one.
    const byKey = new Map<string, { row: SalaryBreakupSheetRow; empId: string | null }>();
    for (const item of resolved) {
      byKey.set(`${normName(item.row.employeeName)}|${item.row.month}`, item);
    }
    const deduplicated = [...byKey.values()];

    // 4) ONE transaction: chunked idempotent upserts on (employee_name, month).
    await db.transaction(async (tx) => {
      for (let i = 0; i < deduplicated.length; i += UPSERT_CHUNK) {
        const chunk = deduplicated.slice(i, i + UPSERT_CHUNK);
        await tx
          .insert(salaryBreakup)
          .values(chunk.map(({ row, empId }) => toInsertValues(row, empId)))
          .onConflictDoUpdate({
            target: [salaryBreakup.employeeName, salaryBreakup.month],
            set: {
              srNo: sql`excluded.sr_no`,
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
              setOff: sql`excluded.set_off`,
              cf: sql`excluded.cf`,
              finalWorkingDays: sql`excluded.final_working_days`,
              annualCtc: sql`excluded.annual_ctc`,
              monthlyCtc: sql`excluded.monthly_ctc`,
              payableAfterLeave: sql`excluded.payable_after_leave`,
              pt: sql`excluded.pt`,
              payableAfterPt: sql`excluded.payable_after_pt`,
              advance: sql`excluded.advance`,
              previousPending: sql`excluded.previous_pending`,
              finalPayment: sql`excluded.final_payment`,
              salaryGiven: sql`excluded.salary_given`,
              remarks: sql`excluded.remarks`,
              mananRemarks: sql`excluded.manan_remarks`,
              importedAt: sql`now()`,
            },
          });
      }
    });

    const monthsTouched = [...new Set(rows.map((r) => r.month.slice(0, 7)))].sort();
    const summary: SalarySyncSummary = {
      runId,
      rowsRead: rows.length,
      rowsUpserted: deduplicated.length,
      rowsSkipped: skipped,
      unmatchedNames: [...unmatched].sort(),
      monthsTouched,
    };

    await db
      .update(syncRuns)
      .set({
        status: "ok",
        finishedAt: new Date(),
        rowsRead: summary.rowsRead,
        rowsWritten: summary.rowsUpserted,
        rowsSkipped: summary.rowsSkipped,
        unmatchedNames: summary.unmatchedNames,
      })
      .where(sql`${syncRuns.id} = ${runId}`);

    // Counts only — never row contents (salary figures are PII).
    console.log(
      `[salary-sync] ok run=${runId} read=${summary.rowsRead} upserted=${summary.rowsUpserted} skipped=${summary.rowsSkipped} unmatched=${summary.unmatchedNames.length} months=${monthsTouched.length}`,
    );
    return { ok: true, ...summary };
  } catch (err) {
    const msg = (err instanceof Error ? err.message : String(err)).slice(0, 500);
    console.error(`[salary-sync] failed run=${runId}: ${msg}`);
    try {
      await db
        .update(syncRuns)
        .set({ status: "error", finishedAt: new Date(), error: msg })
        .where(sql`${syncRuns.id} = ${runId}`);
    } catch (auditErr) {
      console.error("[salary-sync] could not record failure", auditErr);
    }
    return { ok: false, error: msg, runId };
  }
}

/** Sheet row → Drizzle insert values (numerics are strings in Drizzle). */
function toInsertValues(r: SalaryBreakupSheetRow, empId: string | null) {
  const n = (v: number) => v.toFixed(2);
  const nOrNull = (v: number | null) => (v == null ? null : v.toFixed(2));
  return {
    srNo: r.srNo == null ? null : Math.trunc(r.srNo),
    fy: r.fy,
    month: r.month,
    employeeName: r.employeeName,
    employeeId: empId,
    designation: r.designation,
    companyName: r.companyName,
    present: n(r.present),
    holiday: n(r.holiday),
    weeklyOff: n(r.weeklyOff),
    pohFull: n(r.pohFull),
    pohHalf: n(r.pohHalf),
    halfDay: n(r.halfDay),
    absent: n(r.absent),
    daysInMonth: n(r.daysInMonth),
    totalDaysWorked: n(r.totalDaysWorked),
    setOff: nOrNull(r.setOff),
    cf: nOrNull(r.cf),
    finalWorkingDays: n(r.finalWorkingDays),
    annualCtc: n(r.annualCtc),
    monthlyCtc: n(r.monthlyCtc),
    payableAfterLeave: n(r.payableAfterLeave),
    pt: n(r.pt),
    payableAfterPt: n(r.payableAfterPt),
    advance: n(r.advance),
    previousPending: n(r.previousPending),
    finalPayment: n(r.finalPayment),
    salaryGiven: nOrNull(r.salaryGiven),
    remarks: r.remarks,
    mananRemarks: r.mananRemarks,
  };
}
