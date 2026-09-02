import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { salaryBreakup, salaryRuns } from "@/db/schema";
import { assembleMonthInputs, computeForRow } from "./generate";

/**
 * KEEP THE OPEN MONTH'S RUN CURRENT, so every surface shows one number.
 *
 * ── THE PROBLEM THIS SOLVES ────────────────────────────────────────────────
 * Three places show an employee's pay and they disagreed for the open month:
 *
 *   My Salary  → recomputed LIVE, as of the moment you opened the page
 *   Payslip    → the stored `salary_runs` row
 *   Accounts   → `salary_breakup`, mirrored from that same stored row
 *
 * Not different arithmetic — the SAME arithmetic at different moments. August's
 * runs were generated on the 8th; My Salary recomputed on the 26th and showed
 * ₹4,416.67 where the payslip said ₹4,548.39. Nothing was wrong in either, and
 * only one of them was visible to the employee.
 *
 * So the live computation now WRITES what it computes. My Salary reads stored
 * runs like everyone else, and the act of looking refreshes the row the payslip
 * and Accounts already read. One number, everywhere, by construction.
 *
 * ── WHAT IT REFUSES TO TOUCH ───────────────────────────────────────────────
 * A DISBURSED run is money that has been paid. It is never recomputed — that is
 * the difference between a payslip and an estimate, and re-deriving it later
 * would read today's attendance, today's schedule and today's rate, all of which
 * move after the fact. Only the CURRENT month is refreshed at all; a closed
 * month is an audit record and stays exactly as it was issued.
 *
 * ── WHY IT IS THROTTLED ────────────────────────────────────────────────────
 * `assembleMonthInputs` builds the WHOLE org's payroll inputs. My Salary already
 * paid that cost on every view (the old live tier called it too), so this adds
 * no work in the common case — but writing on every view would also mean a write
 * per page load. {@link STALE_MS} means a busy employee refreshing the page
 * repeatedly recomputes once, not once per keystroke of impatience.
 */

/** How old a run may be before a page view is allowed to recompute it. */
const STALE_MS = 5 * 60 * 1000;

export type RefreshOutcome =
  | "refreshed"
  | "fresh" // recomputed recently enough
  | "disbursed" // paid; never recomputed
  | "not-open-month"
  | "no-profile" // no pay configuration → no run should exist
  | "failed";

/**
 * Recompute and store this employee's run for `month`, if that is allowed.
 *
 * FAIL-SOFT: every outcome is a value, never a throw. A refresh that cannot run
 * must cost the freshness of one number and never the page — the employee still
 * sees the last stored run, which is exactly what the payslip shows.
 */
export async function refreshOpenMonthRun(
  employeeId: string,
  month: string,
  now: Date = new Date(),
): Promise<RefreshOutcome> {
  const openMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  if (month !== openMonth) return "not-open-month";

  try {
    const existing = await db.query.salaryRuns.findFirst({
      where: and(eq(salaryRuns.employeeId, employeeId), eq(salaryRuns.month, month)),
    });

    // Paid is final. Nothing below this line may touch a disbursed run.
    if (existing?.disbursed) return "disbursed";
    if (existing && now.getTime() - existing.updatedAt.getTime() < STALE_MS) return "fresh";

    const rows = await assembleMonthInputs(month);
    const row = rows.find((r) => r.employeeId === employeeId);
    if (!row) return "no-profile";
    // Mirrors generateSalary: no pay configuration ⇒ no ₹0 run materialised.
    if (!row.hasProfile) return "no-profile";

    const b = computeForRow(row);

    // The recomputed columns, and ONLY those. Deliberately identical in shape to
    // generateSalary's `computed` so the two writers can never drift into
    // producing different rows for the same inputs.
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
      payType: row.payBasis,
      workedHours: b.workedHours != null ? b.workedHours.toFixed(2) : null,
      hourlyRate: b.hourlyRate != null ? b.hourlyRate.toFixed(2) : null,
      // The month's required hours, frozen with the pay they measured (0211).
      targetHours: b.targetHours != null ? b.targetHours.toFixed(2) : null,
      overtimeHours: (b.overtimeHours ?? 0).toFixed(2),
      overtimeAmount: (b.overtimeAmount ?? 0).toFixed(2),
    };

    await db
      .insert(salaryRuns)
      .values({ employeeId, ...computed, source: "generated" })
      .onConflictDoUpdate({
        target: [salaryRuns.employeeId, salaryRuns.month],
        // INVARIANT, inherited from generateSalary: recomputed columns ONLY.
        // Never `disbursed`, `disbursedAmount` or `approvedById` — the two
        // writers stay column-disjoint and therefore safe under concurrency.
        set: { ...computed, updatedAt: new Date() },
      });

    await mirrorToBreakup(employeeId, month, row, b);
    return "refreshed";
  } catch {
    return "failed";
  }
}

/**
 * Mirror the recomputed pay onto the employee's `salary_breakup` row, which is
 * what the Accounts salary module reads.
 *
 * ONE ROW, not the org-wide `syncBreakupFromApp`: that rebuilds the whole
 * month's dashboard and every profile, which is far too much to hang off a page
 * view. The columns written here are exactly the pay columns that sync writes.
 *
 * The paid / waive-off / adjustment overlays are NOT touched — those are human
 * decisions recorded against the row, and a recompute has no business editing
 * them. An employee with no breakup row (never imported) is simply skipped;
 * inserting one here would invent a payroll record from a page view.
 */
async function mirrorToBreakup(
  employeeId: string,
  month: string,
  row: Awaited<ReturnType<typeof assembleMonthInputs>>[number],
  b: ReturnType<typeof computeForRow>,
): Promise<void> {
  const f = (n: number) => n.toFixed(2);
  await db
    .update(salaryBreakup)
    .set({
      annualCtc: f(row.annualCtc),
      monthlyCtc: f(b.monthlyCtc),
      payableAfterLeave: f(b.gross),
      pt: f(b.pt),
      payableAfterPt: f(b.gross - b.pt),
      advance: f(b.advances),
      previousPending: f(b.pendingBalanceIn),
      finalPayment: f(b.net),
      fy: row.fy,
      payType: row.payBasis,
      workedHours: b.workedHours != null ? f(b.workedHours) : null,
    })
    .where(
      and(
        eq(salaryBreakup.employeeId, employeeId),
        // `salary_breakup.month` is a DATE anchored to the 1st, while
        // `salary_runs.month` is the 'YYYY-MM' text above.
        eq(salaryBreakup.month, `${month}-01`),
      ),
    );
}
