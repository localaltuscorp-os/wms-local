import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { paidLeaveCycle, syncRuns } from "@/db/schema";
import { readSheetValuesReadonly } from "@/lib/google/read-sheet";
import {
  ATT_LOG_KILL_SWITCH,
  ATT_LOG_PAID_LEAVE_RANGE,
  ATT_LOG_SHEET_ID,
  attLogSyncConfigError,
} from "@/lib/attendance-log/config";
import { mapPaidLeaveRows, type PaidLeaveCycleRow } from "@/lib/attendance-log/paid-leave-sheet";
import { buildNameResolver } from "@/lib/attendance-log/match";

/**
 * LIVE "PAID LEAVE CALCULATION" tab sync — mirrors the HR sheet's
 * employee-blocked leave cycles into paid_leave_cycle. Mirrors the shape of
 * lib/salary/breakup-sync.ts (see lib/attendance-log/attendance-sync.ts for
 * the sibling engine + the shared safety commentary).
 *
 * NON-DESTRUCTIVE: parallel read-side layer only — the in-app leave module's
 * write paths are untouched; per-employee totals are computed on read
 * (lib/queries/attendance-log.ts), no summary table to drift.
 *
 * Idempotent upserts keyed on the unique (employee_name, period) index; rows
 * never disappear (sheet deletions are not propagated — fail-safe for HR
 * history). Kill switch + config no-op, per-row failure isolation, DRY-RUN
 * (writes only the dry_run audit row), unmatched names reported never guessed.
 *
 * SECURITY: READ-ONLY Sheets scope; logs + sync_runs carry counts/names only.
 */

export interface PaidLeaveSyncSummary {
  runId: string;
  dryRun: boolean;
  /** Cycle rows parsed (deduped). */
  rowsRead: number;
  /** Employee blocks found in the tab. */
  employeesRead: number;
  rowsWritten: number;
  rowsSkipped: number;
  rowsFailed: number;
  unmatchedNames: string[];
  /** Dry-run detail vs the current table. */
  wouldInsert: number;
  wouldUpdate: number;
  /** First few would-insert keys, e.g. "Dattaram Kap · Mar 2019 – Aug 2019". */
  sampleNewKeys: string[];
}

export type PaidLeaveSyncResult =
  | ({ ok: true } & PaidLeaveSyncSummary)
  | { ok: false; error: string; runId?: string };

const UPSERT_CHUNK = 200;

export async function runPaidLeaveSync(opts: {
  trigger: "cron" | "admin" | "script";
  actorId?: string | null;
  dryRun?: boolean;
}): Promise<PaidLeaveSyncResult> {
  if (process.env[ATT_LOG_KILL_SWITCH] === "true") {
    return { ok: false, error: `Attendance-log sync is disabled (${ATT_LOG_KILL_SWITCH}=true).` };
  }
  const configError = attLogSyncConfigError();
  if (configError) return { ok: false, error: configError };
  const dryRun = opts.dryRun === true;

  // Audit run opens FIRST — a crashed sync leaves a visible 'running' row.
  const [run] = await db
    .insert(syncRuns)
    .values({ job: "paid_leave", trigger: opts.trigger, actorId: opts.actorId ?? null, dryRun })
    .returning({ id: syncRuns.id });
  const runId = run!.id;

  try {
    const matrix = await readSheetValuesReadonly(ATT_LOG_SHEET_ID, ATT_LOG_PAID_LEAVE_RANGE);
    const { blocks, cycles, skipped, duplicates } = mapPaidLeaveRows(matrix);

    if (cycles.length === 0) {
      throw new Error(
        `Sheet mapped to 0 paid-leave cycles (${matrix.length} raw rows read) — check sharing, tab name and range.`,
      );
    }

    const resolver = await buildNameResolver();
    const values = cycles.map((c) => toCycleValues(c, resolver.resolve(c.employeeName)));

    // Dry-run classification (key-only select — the table is small).
    let wouldInsert = 0;
    let wouldUpdate = 0;
    const sampleNewKeys: string[] = [];
    if (dryRun) {
      const existing = await db
        .select({ employeeName: paidLeaveCycle.employeeName, period: paidLeaveCycle.period })
        .from(paidLeaveCycle);
      const existingKeys = new Set(
        existing.map((e) => `${e.employeeName.toLowerCase()}|${e.period.toLowerCase()}`),
      );
      for (const c of cycles) {
        const key = `${c.employeeName.toLowerCase()}|${c.period.toLowerCase()}`;
        if (existingKeys.has(key)) {
          wouldUpdate++;
        } else {
          wouldInsert++;
          if (sampleNewKeys.length < 5) sampleNewKeys.push(`${c.employeeName} · ${c.period}`);
        }
      }
    }

    // Write path (skipped on dry-run): chunked upserts, per-row isolation.
    let rowsWritten = 0;
    let rowsFailed = 0;
    if (!dryRun) {
      for (let i = 0; i < values.length; i += UPSERT_CHUNK) {
        const chunk = values.slice(i, i + UPSERT_CHUNK);
        try {
          await upsertCycleChunk(chunk);
          rowsWritten += chunk.length;
        } catch {
          for (const row of chunk) {
            try {
              await upsertCycleChunk([row]);
              rowsWritten++;
            } catch (rowErr) {
              rowsFailed++;
              console.error(
                `[paid-leave-sync] row upsert failed: ${(rowErr instanceof Error ? rowErr.message : String(rowErr)).slice(0, 200)}`,
              );
            }
          }
        }
      }
    }

    const summary: PaidLeaveSyncSummary = {
      runId,
      dryRun,
      rowsRead: cycles.length,
      employeesRead: blocks.length,
      rowsWritten,
      rowsSkipped: skipped + duplicates,
      rowsFailed,
      unmatchedNames: [...resolver.unmatched].sort(),
      wouldInsert,
      wouldUpdate,
      sampleNewKeys,
    };

    await db
      .update(syncRuns)
      .set({
        status: rowsFailed > 0 ? "error" : "ok",
        finishedAt: new Date(),
        rowsRead: summary.rowsRead,
        rowsWritten: summary.rowsWritten,
        rowsSkipped: summary.rowsSkipped,
        unmatchedNames: summary.unmatchedNames,
        error: rowsFailed > 0 ? `${rowsFailed} row(s) failed to upsert (isolated; rest written)` : null,
      })
      .where(sql`${syncRuns.id} = ${runId}`);

    console.log(
      `[paid-leave-sync] ${dryRun ? "DRY-RUN " : ""}ok run=${runId} cycles=${summary.rowsRead} employees=${summary.employeesRead} wrote=${rowsWritten} skipped=${summary.rowsSkipped} failed=${rowsFailed} unmatched=${summary.unmatchedNames.length}`,
    );
    return { ok: true, ...summary };
  } catch (err) {
    const msg = (err instanceof Error ? err.message : String(err)).slice(0, 500);
    console.error(`[paid-leave-sync] failed run=${runId}: ${msg}`);
    try {
      await db
        .update(syncRuns)
        .set({ status: "error", finishedAt: new Date(), error: msg })
        .where(sql`${syncRuns.id} = ${runId}`);
    } catch (auditErr) {
      console.error("[paid-leave-sync] could not record failure", auditErr);
    }
    return { ok: false, error: msg, runId };
  }
}

/** Sheet cycle row → Drizzle insert values (numerics are strings in Drizzle). */
function toCycleValues(c: PaidLeaveCycleRow, empId: string | null) {
  return {
    employeeName: c.employeeName,
    employeeId: empId,
    doj: c.doj,
    period: c.period,
    status: c.status,
    leaves: c.leaves == null ? null : c.leaves.toFixed(2),
    remarks: c.remarks,
  };
}

async function upsertCycleChunk(chunk: ReturnType<typeof toCycleValues>[]): Promise<void> {
  await db
    .insert(paidLeaveCycle)
    .values(chunk)
    .onConflictDoUpdate({
      target: [paidLeaveCycle.employeeName, paidLeaveCycle.period],
      set: {
        employeeId: sql`excluded.employee_id`,
        doj: sql`excluded.doj`,
        status: sql`excluded.status`,
        leaves: sql`excluded.leaves`,
        remarks: sql`excluded.remarks`,
        importedAt: sql`now()`,
      },
    });
}
