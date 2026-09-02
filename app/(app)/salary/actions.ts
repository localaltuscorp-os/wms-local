"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { salaryRuns } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import { computeSalary } from "@/lib/salary/compute";
import { assembleMonthInputs } from "@/lib/salary/generate";
import { getRun } from "@/lib/queries/salary";
import { GenerateSalarySchema, RunEditSchema } from "@/lib/validators/salary";

export type ActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

const PATH = "/salary";

const UUID_RE = /^[0-9a-f-]{36}$/i;

/**
 * Generate (or regenerate) the salary runs for a month.
 *
 * For each employee that has a salary profile (annualCtc > 0) we recompute the
 * breakdown from the current attendance summary + profile (via
 * `assembleMonthInputs` → `computeSalary`) and upsert a `salary_runs` row keyed
 * on (employee_id, month).
 *
 * Carry-forward contract: we persist `pending_balance_in = input.pendingBalanceIn`
 * and `net_payable = breakdown.net` (which already INCLUDES + pendingBalanceIn).
 * This keeps `lastDisbursedRemainder` recursion correct.
 *
 * Regenerate semantics (idempotent re-run): on conflict we RECOMPUTE the
 * computed columns (payable/late/gross/pt/tds/advances/pending/net) from the
 * current attendance + profile, but we intentionally OMIT `disbursed`,
 * `disbursed_amount` and `approved_by_id` from the `set` clause so a re-run
 * never clobbers an already-disbursed payment. Note: because `advances` and
 * `pending_balance_in` are re-derived from the assembler (sumAdvances /
 * lastDisbursedRemainder — both the source of truth), any manual `editRun`
 * tweak to those two fields IS overwritten by a later regenerate. That is
 * acceptable and intentional.
 *
 * Employees without a profile (annualCtc 0) are SKIPPED (no ₹0 run created).
 */
export async function generateSalary(input: unknown): Promise<ActionResult<{ generated: number }>> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = GenerateSalarySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { month } = parsed.data;

  let generated = 0;
  try {
    const rows = await assembleMonthInputs(month);
    for (const row of rows) {
      if (!row.hasProfile) continue; // no CTC → skip (don't materialize a ₹0 run)
      const b = computeSalary(row.input);

      const computed = {
        month,
        fy: row.fy,
        annualCtc: row.annualCtc.toFixed(2),
        daysInMonth: row.daysInMonth,
        payableDays: b.payableDays.toFixed(2),
        lateMarks: row.input.lateMarksInMonth,
        lateDeductionDays: b.lateDeductionDays.toFixed(2),
        gross: b.gross.toFixed(2),
        pt: b.pt.toFixed(2),
        tds: b.tds.toFixed(2),
        advances: b.advances.toFixed(2),
        pendingBalanceIn: b.pendingBalanceIn.toFixed(2),
        netPayable: b.net.toFixed(2),
      };

      await db
        .insert(salaryRuns)
        .values({
          employeeId: row.employeeId,
          ...computed,
          source: "generated",
          generatedById: me.id,
        })
        .onConflictDoUpdate({
          target: [salaryRuns.employeeId, salaryRuns.month],
          // Re-run updates the COMPUTED columns + updated_at only. Does NOT
          // touch disbursed / disbursed_amount / approved_by_id (preserve a
          // recorded disbursement across regenerates).
          //
          // INVARIANT: this set-clause updates ONLY recomputed columns. It MUST
          // NOT include `disbursed`, `disbursedAmount`, or `approvedById` —
          // regenerating a month must never wipe a disbursement. setDisbursed
          // touches only those columns, so the two writers are column-disjoint
          // and safe under concurrency. If you ever add a disbursement column
          // here, add a `WHERE disbursed = false` guard or wrap in a transaction.
          set: { ...computed, updatedAt: new Date() },
        });
      generated += 1;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  revalidatePath(PATH);
  return { ok: true, generated };
}

/**
 * Adjust a single run's `advances` and/or `pending_balance_in` and recompute
 * its `net_payable` from the already-stored gross / pt / tds (money read via
 * Number(), written as `.toFixed(2)`). Admin-only.
 *
 * net = gross - pt - tds - advances + pendingBalanceIn
 */
export async function editRun(input: unknown): Promise<ActionResult> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = RunEditSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;

  const run = await getRun(data.runId);
  if (!run) return { ok: false, error: "Run not found." };
  if (run.disbursed) {
    return {
      ok: false,
      error: "This run is already disbursed — un-disburse it first to edit advances or pending balance.",
    };
  }

  const advances = data.advances ?? run.advances;
  const pendingBalanceIn = data.pendingBalanceIn ?? run.pendingBalanceIn;
  const net = run.gross - run.pt - run.tds - advances + pendingBalanceIn;

  try {
    await db
      .update(salaryRuns)
      .set({
        advances: advances.toFixed(2),
        pendingBalanceIn: pendingBalanceIn.toFixed(2),
        netPayable: net.toFixed(2),
        updatedAt: new Date(),
      })
      .where(eq(salaryRuns.id, data.runId));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  revalidatePath(PATH);
  return { ok: true };
}

/**
 * Toggle a run's disbursed flag. When disbursing, `disbursed_amount` defaults
 * to the run's net_payable (the full pay) unless an explicit amount is given —
 * a smaller amount becomes the carry-forward source (next month's
 * `lastDisbursedRemainder` reads `net_payable - disbursed_amount`). When
 * un-disbursing, `disbursed_amount` is cleared. `approved_by_id` is stamped on
 * disburse. Admin-only.
 */
export async function setDisbursed(
  runId: string,
  disbursed: boolean,
  disbursedAmount?: number,
): Promise<ActionResult> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  if (!UUID_RE.test(runId)) return { ok: false, error: "Invalid id" };
  if (disbursedAmount !== undefined && (!Number.isFinite(disbursedAmount) || disbursedAmount < 0)) {
    return { ok: false, error: "Invalid disbursed amount" };
  }

  const run = await getRun(runId);
  if (!run) return { ok: false, error: "Run not found." };

  const amount = disbursed
    ? (disbursedAmount ?? run.netPayable).toFixed(2)
    : null;

  try {
    await db
      .update(salaryRuns)
      .set({
        disbursed,
        disbursedAmount: amount,
        approvedById: disbursed ? me.id : null,
        updatedAt: new Date(),
      })
      .where(eq(salaryRuns.id, runId));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  revalidatePath(PATH);
  return { ok: true };
}
