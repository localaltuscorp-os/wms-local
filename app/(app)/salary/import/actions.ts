"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import * as XLSX from "xlsx";
import { db } from "@/lib/db";
import { employees, salaryProfiles, salaryRuns } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import { computeSalary } from "@/lib/salary/compute";
import {
  mapSummaryRows,
  payableDaysFromSummary,
  type AltusLogMonthRow,
} from "@/lib/salary/altus-log-import";
import { daysInMonth, fyForMonth } from "@/lib/salary/period";

export type ActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

const PATH = "/salary";

// Backtest only April-2026 onward. Older months in the sheet are reported but
// NOT imported (string compare on canonical "YYYY-MM" is chronological).
const BACKTEST_FROM = "2026-04";

const UUID_RE = /^[0-9a-f-]{36}$/i;

// ───────────────────────────────────────────────────────────────────────────
// IMPORTANT limitation (documented + surfaced in the UI):
// The Altus-Log Summary sheet has NO late-marks, NO advances and NO carry-
// forward columns — it is a monthly attendance summary only. So every IMPORTED
// historical run is computed with lateMarksInMonth = 0, advances = 0 and
// pendingBalanceIn = 0. These historical runs reflect sheet attendance only;
// they are not a substitute for a freshly generated run that pulls late marks /
// advances / carry-forward from the live system.
// ───────────────────────────────────────────────────────────────────────────

interface PreviewRunSample {
  employeeName: string;
  month: string;
  payableDays: number;
  daysInMonth: number;
  net: number;
}

export interface SalaryImportPreview {
  totalRows: number;
  inRange: number;
  outOfRange: number;
  unmatchedNames: string[];
  withProfile: number; // matched, in-range, has CTC profile → a run is created
  noProfile: number; // matched, in-range, no CTC profile → attendance-only, skipped
  sample: PreviewRunSample[];
}

// A matched, in-range row paired with the resolved employee + (optional) profile.
interface MatchedRow {
  row: AltusLogMonthRow;
  employeeId: string;
  annualCtc: number;
  tdsMonthly: number;
  ptExempt: boolean;
}

interface ParseResult {
  mapped: AltusLogMonthRow[];
}

/** Read the uploaded xlsx File/Blob → mapped Summary rows. */
async function parseUpload(
  form: FormData,
): Promise<{ ok: true; data: ParseResult } | { ok: false; error: string }> {
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Pick an .xlsx file to import." };
  }
  if (file.size > 25 * 1024 * 1024) {
    return { ok: false, error: "File exceeds 25 MB." };
  }

  let mapped: AltusLogMonthRow[];
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
    const firstSheet = wb.SheetNames[0];
    const ws = wb.Sheets["Summary"] ?? (firstSheet ? wb.Sheets[firstSheet] : undefined);
    if (!ws) return { ok: false, error: "The workbook has no readable sheet." };
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      blankrows: false,
    });
    mapped = mapSummaryRows(rows);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Could not read the file: ${msg}` };
  }

  return { ok: true, data: { mapped } };
}

/** Normalize a person name for matching: trim, collapse all whitespace
 *  (incl. the \r\n that the Altus-Log "Employee\n Name" cells carry), lower. */
function normName(name: string): string {
  return name.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Resolve every parsed row's employeeName against the employees table
 * (case-insensitive, whitespace-normalized exact match) and split rows by
 * range + match + profile. DB reads only — NO writes.
 */
async function resolveRows(mapped: AltusLogMonthRow[]): Promise<{
  inRangeCount: number;
  outOfRange: number;
  unmatchedNames: string[];
  matched: MatchedRow[];
  noProfileCount: number;
}> {
  const inRange = mapped.filter((r) => r.month >= BACKTEST_FROM);
  const outOfRange = mapped.length - inRange.length;

  // Build a name → {id, profile} lookup for active employees once.
  const empRows = await db
    .select({
      id: employees.id,
      name: employees.name,
      annualCtc: salaryProfiles.annualCtc,
      tdsMonthly: salaryProfiles.tdsMonthly,
      ptExempt: salaryProfiles.ptExempt,
    })
    .from(employees)
    .leftJoin(salaryProfiles, sql`${salaryProfiles.employeeId} = ${employees.id}`)
    .where(sql`${employees.isActive} = true`);

  const byName = new Map<
    string,
    { id: string; annualCtc: number; tdsMonthly: number; ptExempt: boolean }
  >();
  for (const e of empRows) {
    byName.set(normName(e.name), {
      id: e.id,
      annualCtc: e.annualCtc == null ? 0 : Number(e.annualCtc),
      tdsMonthly: e.tdsMonthly == null ? 0 : Number(e.tdsMonthly),
      ptExempt: e.ptExempt ?? false,
    });
  }

  const unmatched = new Set<string>();
  const matched: MatchedRow[] = [];
  let noProfileCount = 0;

  for (const row of inRange) {
    const emp = byName.get(normName(row.employeeName));
    if (!emp) {
      unmatched.add(row.employeeName.replace(/\s+/g, " ").trim());
      continue;
    }
    if (emp.annualCtc > 0) {
      matched.push({
        row,
        employeeId: emp.id,
        annualCtc: emp.annualCtc,
        tdsMonthly: emp.tdsMonthly,
        ptExempt: emp.ptExempt,
      });
    } else {
      // Matched an employee but they have no CTC profile → attendance-only;
      // we do NOT create a salary run for them.
      noProfileCount += 1;
    }
  }

  return {
    inRangeCount: inRange.length,
    outOfRange,
    unmatchedNames: [...unmatched].sort(),
    matched,
    noProfileCount,
  };
}

/** Compute a run's breakdown from a matched row — the SINGLE source of the
 *  preview-vs-confirm parity (imports always use lateMarks/advances/pending 0). */
function computeForRow(m: MatchedRow) {
  return computeSalary({
    annualCtc: m.annualCtc,
    payableDays: payableDaysFromSummary(m.row),
    daysInMonth: m.row.daysInMonth || daysInMonth(m.row.month),
    ptExempt: m.ptExempt,
    tdsMonthly: m.tdsMonthly,
    lateMarksInMonth: 0, // not in the summary sheet
    advances: 0, // not in the summary sheet
    pendingBalanceIn: 0, // not in the summary sheet
  });
}

/**
 * Preview an Altus-Log Summary import — parse, match employee names, and report
 * what WOULD be created. No writes. Admin-only.
 */
export async function previewSalaryImport(
  form: FormData,
): Promise<ActionResult<{ preview: SalaryImportPreview }>> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = await parseUpload(form);
  if (!parsed.ok) return parsed;
  const { mapped } = parsed.data;

  if (mapped.length === 0) {
    return {
      ok: false,
      error:
        "Parsed 0 rows from the Summary sheet. Check that the workbook has a 'Summary' tab in the Altus-Log layout.",
    };
  }

  let resolved;
  try {
    resolved = await resolveRows(mapped);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  const sample: PreviewRunSample[] = resolved.matched.slice(0, 10).map((m) => {
    const b = computeForRow(m);
    return {
      employeeName: m.row.employeeName.replace(/\s+/g, " ").trim(),
      month: m.row.month,
      payableDays: b.payableDays,
      daysInMonth: m.row.daysInMonth || daysInMonth(m.row.month),
      net: b.net,
    };
  });

  return {
    ok: true,
    preview: {
      totalRows: mapped.length,
      inRange: resolved.inRangeCount,
      outOfRange: resolved.outOfRange,
      unmatchedNames: resolved.unmatchedNames,
      withProfile: resolved.matched.length,
      noProfile: resolved.noProfileCount,
      sample,
    },
  };
}

/**
 * Confirm an Altus-Log Summary import — re-parse the same (re-uploaded) file,
 * re-match, and in ONE transaction tagged with a fresh `import_batch_id` upsert
 * a historical `salary_runs` row (source:"imported") for every matched,
 * in-range (>= Apr-2026) row that has a CTC profile. Admin-only.
 *
 * Disbursement safety: the on-conflict set-clause touches ONLY the computed
 * columns + source + import_batch_id + generated_by_id. It does NOT touch
 * `disbursed`, `disbursed_amount` or `approved_by_id`, so an already-disbursed
 * run is never clobbered — the same column-disjoint invariant generateSalary
 * relies on. Additionally, the conflict UPDATE is gated to existing
 * `source='imported'` rows only: a real `source='generated'` run (which may
 * carry non-zero advances / late marks / carry-forward) is LEFT UNTOUCHED, so
 * the backtest importer can never downgrade a generated/disbursed run to a
 * recomputed import with 0 advances / 0 late / 0 carry-forward.
 */
export async function confirmSalaryImport(
  form: FormData,
): Promise<
  ActionResult<{
    batchId: string;
    created: number;
    skipped: { outOfRange: number; unmatched: number; noProfile: number };
  }>
> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = await parseUpload(form);
  if (!parsed.ok) return parsed;
  const { mapped } = parsed.data;

  if (mapped.length === 0) {
    return { ok: false, error: "Nothing to import — parsed 0 rows." };
  }

  let resolved;
  try {
    resolved = await resolveRows(mapped);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  if (resolved.matched.length === 0) {
    return {
      ok: false,
      error:
        "No importable rows: nothing matched an employee with a CTC profile in the April-2026+ range.",
    };
  }

  const batchId = crypto.randomUUID();
  let created = 0;

  try {
    await db.transaction(async (tx) => {
      for (const m of resolved.matched) {
        const b = computeForRow(m);
        const month = m.row.month;
        const computed = {
          fy: fyForMonth(month),
          annualCtc: m.annualCtc.toFixed(2),
          daysInMonth: m.row.daysInMonth || daysInMonth(month),
          payableDays: b.payableDays.toFixed(2),
          lateMarks: 0,
          lateDeductionDays: b.lateDeductionDays.toFixed(2),
          gross: b.gross.toFixed(2),
          pt: b.pt.toFixed(2),
          tds: b.tds.toFixed(2),
          advances: b.advances.toFixed(2),
          pendingBalanceIn: b.pendingBalanceIn.toFixed(2),
          netPayable: b.net.toFixed(2),
          source: "imported",
          importBatchId: batchId,
          generatedById: me.id,
        };

        const upserted = await tx
          .insert(salaryRuns)
          .values({ employeeId: m.employeeId, month, ...computed })
          .onConflictDoUpdate({
            target: [salaryRuns.employeeId, salaryRuns.month],
            // INVARIANT (matches generateSalary): set ONLY computed columns +
            // source/import_batch_id/generated_by. Never touch disbursed /
            // disbursed_amount / approved_by_id — a disbursed run is preserved.
            set: { ...computed, updatedAt: new Date() },
            // GUARD: only re-update rows that are ALREADY imports. A real
            // source='generated' run is filtered out of the UPDATE (and the
            // INSERT no-ops on the conflict), so a generated/disbursed run is
            // never clobbered by a backtest re-import.
            setWhere: eq(salaryRuns.source, "imported"),
          })
          .returning({ id: salaryRuns.id });
        // Count only rows actually inserted/updated; a generated row skipped by
        // the guard returns nothing and is correctly NOT counted.
        if (upserted.length > 0) created += 1;
      }
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  revalidatePath(PATH);
  return {
    ok: true,
    batchId,
    created,
    skipped: {
      outOfRange: resolved.outOfRange,
      unmatched: resolved.unmatchedNames.length,
      noProfile: resolved.noProfileCount,
    },
  };
}

/** Undo a confirmed import by batch id — delete its imported salary runs. */
export async function undoSalaryImport(
  batchId: string,
): Promise<ActionResult<{ deleted: number }>> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  if (!UUID_RE.test(batchId) || !z.string().uuid().safeParse(batchId).success) {
    return { ok: false, error: "Invalid batch id" };
  }

  let deleted = 0;
  try {
    const rows = await db
      .delete(salaryRuns)
      .where(sql`${salaryRuns.importBatchId} = ${batchId}`)
      .returning({ id: salaryRuns.id });
    deleted = rows.length;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  revalidatePath(PATH);
  return { ok: true, deleted };
}
