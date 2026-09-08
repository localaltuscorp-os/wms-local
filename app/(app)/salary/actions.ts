"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { salaryRuns, salaryBreakup } from "@/db/schema";
import { requireAdmin, requireUser } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { isFinanceViewer } from "@/lib/auth/finance-access";
import {
  amountPaidOf,
  clampAmount,
  paymentStatusOf,
  settles,
  totalPayable,
  unpaidBalance,
  type PaymentStatus,
} from "@/lib/salary/payment";
import { rateLimitOrError } from "@/lib/rate-limit";
import { assembleMonthInputs, computeForRow } from "@/lib/salary/generate";
import { syncBreakupFromApp } from "@/lib/salary/breakup-from-app";
import { getRun, listRunsForMonth } from "@/lib/queries/salary";
import { GenerateSalarySchema, RunEditSchema } from "@/lib/validators/salary";
import {
  mailPayslipOnPaid,
  payslipMailTargets,
  type PayslipMailSummary,
} from "@/lib/salary/notify-paid";
import { afterResponse } from "@/lib/after";

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
      if (!row.hasProfile) continue; // no pay config for this basis → skip (don't materialize a ₹0 run)
      const b = computeForRow(row); // routes by pay basis (monthly_ctc | hourly | fixed_fee)

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
        // Worker types (0177) — pay basis + hourly figures for the payslip.
        payType: row.payBasis,
        workedHours: b.workedHours != null ? b.workedHours.toFixed(2) : null,
        hourlyRate: b.hourlyRate != null ? b.hourlyRate.toFixed(2) : null,
        // The month's required hours, frozen with the pay they measured (0211).
        targetHours: b.targetHours != null ? b.targetHours.toFixed(2) : null,
        // Frozen at issue time (0191). Defaults to "0" so a worker type that
        // earns no overtime records an explicit zero rather than a null the
        // payslip would have to interpret.
        overtimeHours: (b.overtimeHours ?? 0).toFixed(2),
        overtimeAmount: (b.overtimeAmount ?? 0).toFixed(2),
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
    // Mirror the app-computed payroll into the on-page `salary_breakup` rows so
    // the salary MODULE reflects this generation (names + attendance + pay),
    // preserving the paid/wave-off/adjustment overlays. Without this the page
    // (which reads salary_breakup) keeps showing the old imported Excel values.
    await syncBreakupFromApp(month);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  revalidatePath(PATH);
  revalidatePath("/salary");
  return { ok: true, generated };
}

/**
 * BULK "Generate salary for all" — a convenience, non-destructive pass over
 * every active salaried employee (annualCtc > 0) for `month`.
 *
 * Unlike `generateSalary` (which UPSERTS / regenerates every employee), this
 * action SKIPS anyone who already has a run for the month, so it never
 * clobbers an existing — possibly already-disbursed or hand-edited — run. It
 * is best-effort per employee: a single employee's compute/insert failure is
 * caught and counted as `failed`, the loop continues, and the action still
 * succeeds with a created/skipped/failed summary. The first row that ERRORED
 * (if any) is surfaced as `firstError` for diagnostics.
 */
export async function generateSalaryAll(
  input: unknown,
): Promise<
  ActionResult<{ created: number; skipped: number; failed: number; firstError?: string }>
> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = GenerateSalarySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { month } = parsed.data;

  let rows;
  let existing;
  try {
    [rows, existing] = await Promise.all([
      assembleMonthInputs(month),
      listRunsForMonth(month),
    ]);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  const alreadyRun = new Set(existing.map((r) => r.employeeId));

  let created = 0;
  let skipped = 0;
  let failed = 0;
  let firstError: string | undefined;

  for (const row of rows) {
    if (!row.hasProfile) continue; // no CTC → never materialize a ₹0 run
    if (alreadyRun.has(row.employeeId)) {
      skipped += 1;
      continue;
    }

    try {
      const b = computeForRow(row); // routes by pay basis (monthly_ctc | hourly | fixed_fee)
      await db.insert(salaryRuns).values({
        employeeId: row.employeeId,
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
        payType: row.payBasis,
        workedHours: b.workedHours != null ? b.workedHours.toFixed(2) : null,
        hourlyRate: b.hourlyRate != null ? b.hourlyRate.toFixed(2) : null,
        // The month's required hours, frozen with the pay they measured (0211).
        targetHours: b.targetHours != null ? b.targetHours.toFixed(2) : null,
        // Frozen at issue time (0191). Defaults to "0" so a worker type that
        // earns no overtime records an explicit zero rather than a null the
        // payslip would have to interpret.
        overtimeHours: (b.overtimeHours ?? 0).toFixed(2),
        overtimeAmount: (b.overtimeAmount ?? 0).toFixed(2),
        source: "generated",
        generatedById: me.id,
      });
      created += 1;
    } catch (err: unknown) {
      // Best-effort: count the failure (e.g. a race created the row between our
      // snapshot and insert → unique conflict) and keep going.
      failed += 1;
      if (!firstError) firstError = err instanceof Error ? err.message : String(err);
    }
  }

  // Mirror into `salary_breakup` exactly as generateSalary does — the /salary
  // page (and the mobile API) read the breakup, so without this a bulk-generated
  // month would show My Salary one number and Accounts another.
  if (created > 0) {
    try {
      await syncBreakupFromApp(month);
    } catch (err: unknown) {
      if (!firstError) firstError = err instanceof Error ? err.message : String(err);
    }
  }

  revalidatePath(PATH);
  return { ok: true, created, skipped, failed, firstError };
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
      error: "This run is already disbursed - un-disburse it first to edit advances or pending balance.",
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

/**
 * What every payment write returns.
 *
 * `amountPaid` / `balance` / `status` are the RECOMPUTED truth straight from the
 * server, so the table can settle on the authoritative figures rather than its
 * own optimistic guess — the two can disagree whenever the entered amount gets
 * clamped, or when another admin has moved the row in the meantime.
 */
export interface PaymentWriteResult {
  amountPaid: number;
  payable: number;
  balance: number;
  status: PaymentStatus;
  /** True when the entered amount exceeded the payable and was capped to it. */
  clamped?: boolean;
  /** True when the row was already in exactly this state — nothing written,
   *  nothing emailed. */
  noChange?: boolean;
  /** Present only on the edge that settles the row (and therefore sends). */
  mail?: PayslipMailSummary;
}

/** The columns the payment math needs. `netAfterWaiveOff` reads all of them. */
const PAYMENT_COLS = {
  paid: salaryBreakup.paid,
  amountPaid: salaryBreakup.amountPaid,
  finalPayment: salaryBreakup.finalPayment,
  monthlyCtc: salaryBreakup.monthlyCtc,
  daysInMonth: salaryBreakup.daysInMonth,
  waiveOffDays: salaryBreakup.waiveOffDays,
  payoutAdjustment: salaryBreakup.payoutAdjustment,
} as const;

type PaymentRow = {
  [K in keyof typeof PAYMENT_COLS]: (typeof salaryBreakup.$inferSelect)[K];
};

/**
 * THE payment write — every route into `salary_breakup.amount_paid` / `.paid`
 * goes through here, so the settle rule, the slip-email edge and the clamp are
 * defined once instead of once per entry point.
 *
 * AUTHORISATION (widened deliberately, 2026-08): finance viewers — admins,
 * super-admins and the Accounts department — may record payments. This is the
 * same population `requireFinanceAccess` already lets onto the Salary page, and
 * it replaces the older super-admin-only write gate. Note it uses `requireUser`
 * + `isFinanceViewer` rather than `requireAdmin`: an Accounts-department member
 * is not `isAdmin`, so `requireAdmin` would have thrown before the check ran.
 * The other super-admin writes on this page (notes, wave-off, adjustment) keep
 * their narrower gate — only payment moved.
 *
 * THE AMOUNT IS RECOMPUTED, NEVER TRUSTED. The payable comes from the row's own
 * columns on the server; the client's idea of it is never an input. An amount
 * over the payable is capped, which is what makes a negative balance
 * unrepresentable rather than merely unlikely.
 *
 * THE SLIP EMAIL FIRES ON ONE EDGE ONLY: not-settled → settled. A partial
 * payment sends nothing. Topping a partial row up to the full amount sends once.
 * Re-entering the same settled amount is a no-op that sends nothing, so a
 * double-submit or a retried request cannot mail the same person twice.
 */
async function writePayment(
  id: string,
  /** A rupee figure, or "full" — settle the row at whatever the server computes
   *  the payable to be, so the caller never has to know it. */
  nextAmountRaw: number | "full",
): Promise<ActionResult<PaymentWriteResult>> {
  const me = await requireUser();
  if (!(await isFinanceViewer(me))) {
    return { ok: false, error: "You don't have access to record salary payments." };
  }
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!UUID_RE.test(id)) return { ok: false, error: "Invalid row." };
  if (nextAmountRaw !== "full" && !Number.isFinite(nextAmountRaw)) {
    return { ok: false, error: "Enter a valid amount." };
  }

  let row: PaymentRow | undefined;
  try {
    [row] = await db.select(PAYMENT_COLS).from(salaryBreakup).where(eq(salaryBreakup.id, id)).limit(1);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  if (!row) return { ok: false, error: "That salary row no longer exists." };

  const payable = totalPayable(row);
  // "full" resolves against the server's own payable, and is never reported as
  // clamped — the admin asked to settle the row, not to type an over-amount.
  const { amount, clamped } =
    nextAmountRaw === "full" ? { amount: payable, clamped: false } : clampAmount(row, nextAmountRaw);
  const wasSettled = row.paid;
  const nowSettled = settles(row, amount);
  const summary = (extra: Partial<PaymentWriteResult> = {}): PaymentWriteResult => ({
    amountPaid: amount,
    payable,
    balance: unpaidBalance({ ...row, amountPaid: amount }),
    status: paymentStatusOf({ ...row, amountPaid: amount }),
    ...(clamped ? { clamped: true } : null),
    ...extra,
  });

  // Nothing to change → nothing to write and, crucially, nothing to send.
  if (wasSettled === nowSettled && amountPaidOf(row) === amount) {
    return { ok: true, ...summary({ noChange: true }) };
  }

  try {
    await db
      .update(salaryBreakup)
      .set({
        amountPaid: amount.toFixed(2),
        paid: nowSettled,
        // The audit stamps track SETTLEMENT, which is what they have always
        // meant. A partial payment leaves them alone rather than claiming the
        // row was paid off by whoever entered the instalment.
        paidAt: nowSettled ? new Date() : null,
        paidById: nowSettled ? me.id : null,
      })
      .where(eq(salaryBreakup.id, id));
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  // Mail the employee their slip the moment the balance clears — to their work
  // AND personal addresses (mailPayslipOnPaid → employeeEmailTargets).
  //
  // Deferred past the response because it renders a PDF and calls Resend, and
  // the row is already durable — the architecture's persist-then-return rule.
  // `mailPayslipOnPaid` never throws, so a mail failure can never turn a
  // successful payment into an error the admin retries.
  let mail: PayslipMailSummary | undefined;
  if (nowSettled && !wasSettled) {
    // Resolved BEFORE deferring: once the response is out the action can no
    // longer tell the admin that this person has no personal address on file.
    mail = await payslipMailTargets(id).catch(() => undefined);
    afterResponse(() => mailPayslipOnPaid(id));
  }

  revalidatePath(PATH);
  return { ok: true, ...summary(mail ? { mail } : {}) };
}

/**
 * Record the cumulative amount paid against one salary row — the partial-payment
 * entry point. `amount` is the TOTAL disbursed so far, not an instalment to add,
 * so re-submitting the same figure is idempotent and correcting a typo is just
 * entering the right number.
 *
 * Reaching the payable settles the row and sends the slip exactly as the full
 * "Pay" button does; anything less leaves it partially paid and sends nothing.
 */
export async function setSalaryAmountPaid(
  id: string,
  amount: number,
): Promise<ActionResult<PaymentWriteResult>> {
  return writePayment(id, amount);
}

/**
 * Set the salary "Paid" mark for one salary_breakup row — pay in full, or clear
 * the payment entirely.
 *
 * Kept as its own action because "settle this row" is the common case and should
 * not require anyone to look up and retype the payable. It is now a thin shell
 * over `writePayment`: paying marks the FULL payable as disbursed, unmarking
 * returns the row to ₹0 paid. Unmarking has never sent mail and still doesn't.
 */
export async function setSalaryPaid(
  id: string,
  paid: boolean,
): Promise<ActionResult<PaymentWriteResult>> {
  return writePayment(id, paid ? "full" : 0);
}

/**
 * Set the "Wave-Off" (condoned days) grant for one salary_breakup row.
 * SUPER-ADMINS ONLY (Manan/Hetesh) — mirrors the setSalaryPaid guard.
 *
 * This is a GRANT, not an edit of the raw amount: it stores how many DAYS to
 * condone; the salary view adds those days back at the per-day rate
 * (monthly_ctc / days_in_month) to reduce the attendance deduction ("your money
 * isn't deducted"). The stored base amounts (payable_after_pt / final_payment)
 * are NEVER mutated here — the add-back is purely additive to the displayed net.
 * Stored on salary_breakup.waive_off_days/note (survives sheet re-syncs).
 * `days = 0` clears the grant (and its audit stamps).
 */
export async function setWaiveOff(input: {
  rowId: string;
  days: number;
  note?: string | null;
}): Promise<ActionResult> {
  const me = await requireAdmin();
  if (!isSuperAdmin(me.email)) {
    return { ok: false, error: "Only super-admins can wave off salary days." };
  }
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const { rowId, days, note } = input;
  if (!UUID_RE.test(rowId)) return { ok: false, error: "Invalid row." };
  if (!Number.isFinite(days) || days < 0 || days > 366) {
    return { ok: false, error: "Wave-off days must be between 0 and 366." };
  }
  // numeric(6,2): keep two decimals, clamp to the column's precision.
  const rounded = Math.round(days * 100) / 100;
  const trimmedNote = note?.trim().slice(0, 500) || null;

  try {
    await db
      .update(salaryBreakup)
      .set({
        waiveOffDays: rounded.toFixed(2),
        waiveOffNote: trimmedNote,
        waiveOffAt: rounded > 0 ? new Date() : null,
        waiveOffById: rounded > 0 ? me.id : null,
      })
      .where(eq(salaryBreakup.id, rowId));
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  revalidatePath(PATH);
  return { ok: true };
}

/**
 * Set the SIGNED pre-payout adjustment (+extra / −deduct) on a salary_breakup row
 * before the final take-home (Sir #37). SUPER-ADMINS ONLY. Base final_payment is
 * never mutated; the effective net (table/exports/payslip) adds this on top.
 */
export async function setPayoutAdjustment(input: {
  rowId: string;
  amount: number;
  note?: string | null;
}): Promise<ActionResult> {
  const me = await requireAdmin();
  if (!isSuperAdmin(me.email)) {
    return { ok: false, error: "Only super-admins can adjust the payout." };
  }
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const { rowId, amount, note } = input;
  if (!UUID_RE.test(rowId)) return { ok: false, error: "Invalid row." };
  if (!Number.isFinite(amount) || Math.abs(amount) > 10_000_000) {
    return { ok: false, error: "Adjustment must be within ±1,00,00,000." };
  }
  const rounded = Math.round(amount * 100) / 100;
  const trimmedNote = note?.trim().slice(0, 500) || null;

  try {
    await db
      .update(salaryBreakup)
      .set({
        payoutAdjustment: rounded.toFixed(2),
        payoutAdjustmentNote: trimmedNote,
        payoutAdjustmentAt: rounded !== 0 ? new Date() : null,
        payoutAdjustmentById: rounded !== 0 ? me.id : null,
      })
      .where(eq(salaryBreakup.id, rowId));
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  revalidatePath(PATH);
  return { ok: true };
}

/**
 * Set the editable "Remarks" note for one salary_breakup row. SUPER-ADMINS ONLY
 * (Manan/Hetesh). Stored on salary_breakup.admin_note (survives sheet re-syncs).
 * An empty/blank note clears it.
 */
export async function setSalaryNote(id: string, note: string): Promise<ActionResult> {
  const me = await requireAdmin();
  if (!isSuperAdmin(me.email)) {
    return { ok: false, error: "Only super-admins can edit salary notes." };
  }
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!UUID_RE.test(id)) return { ok: false, error: "Invalid row." };
  const trimmed = note.trim().slice(0, 500);
  const value = trimmed.length ? trimmed : null;
  try {
    await db
      .update(salaryBreakup)
      .set({
        adminNote: value,
        adminNoteAt: value ? new Date() : null,
        adminNoteById: value ? me.id : null,
      })
      .where(eq(salaryBreakup.id, id));
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  revalidatePath(PATH);
  return { ok: true };
}
