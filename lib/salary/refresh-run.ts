import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { salaryBreakup, salaryRuns } from "@/db/schema";
import { assembleMonthInputs, computeForRow, type MonthInputRow } from "./generate";
import type { SalaryBreakdown } from "./compute";
import { currentMonthKeyOf, monthsSpanned } from "./period";

/**
 * KEEP A SALARY RUN CURRENT WITH ITS SOURCE DATA, so every surface shows one
 * number.
 *
 * ── THE PROBLEM THIS SOLVES ────────────────────────────────────────────────
 * Three places show an employee's pay and they disagreed:
 *
 *   My Salary  → the graded month, as of the moment you opened the page
 *   Payslip    → the stored `salary_runs` row
 *   Accounts   → `salary_breakup`, mirrored from that same stored row
 *
 * Not different arithmetic — the SAME arithmetic at different moments. So the
 * computation WRITES what it derives: every surface reads stored rows, and the
 * events that move pay push a recompute through here.
 *
 * ── CLOSED MONTHS ARE NO LONGER FROZEN (spec §10) ──────────────────────────
 * This module used to refuse any month but the current one, on the reasoning
 * that a payslip should keep saying what it said on the day it was issued. In
 * practice that produced the opposite of an audit record: attendance kept
 * moving underneath the frozen figure — a backfilled punch, a leave approved
 * late, a holiday declared afterwards — and the stored run drifted away from
 * the record it claimed to summarise. Verified against production: 23 of 25
 * stored August 2026 runs no longer matched the month as graded, several by
 * thousands of rupees, and the employee's own page had to blank its per-day
 * columns to avoid contradicting the payslip printed above them.
 *
 * So ANY month may be recalculated. If August's holiday list changes in
 * October, August's salary changes.
 *
 * ── WHAT A DISBURSEMENT STILL PROTECTS ─────────────────────────────────────
 * `disbursed`, `disbursed_amount` and `approved_by_id` are NEVER written here.
 * They record what was actually paid and by whom, which no recomputation can
 * revise. What a recompute changes is what was OWED — so a corrected month with
 * money already out shows up as a difference between the two, which is
 * precisely the fact somebody needs to see. `lastDisbursedRemainder` reads that
 * gap and carries it into the next month by itself.
 *
 * ── IDEMPOTENCE (spec §13) ─────────────────────────────────────────────────
 * Running this twice on unchanged source data writes identical figures. The
 * whole chain is pure given (attendance, schedule, profile, calendar): the only
 * moving input is `now`, which bounds a month to the days that have elapsed —
 * and for a CLOSED month every day has already elapsed, so `now` stops mattering
 * entirely. Repeated recalculation of a closed month is a fixed point.
 */

/** How old a run may be before a PAGE VIEW is allowed to recompute it. */
const STALE_MS = 5 * 60 * 1000;

export type RefreshOutcome =
  | "refreshed"
  | "fresh" // recomputed recently enough (page views only)
  | "no-profile" // no pay configuration → no run should exist
  | "failed";

export interface RefreshOptions {
  /**
   * Skip the {@link STALE_MS} throttle.
   *
   * For a real EVENT rather than a page view: a leave approved or withdrawn, a
   * holiday declared, a punch corrected. The throttle exists to stop a write per
   * page LOAD; an approval is one deliberate act with a rupee consequence, and
   * making the employee wait five minutes to see it — or letting an admin
   * approve and then read a stale figure back — is exactly the staleness this
   * module exists to remove.
   *
   * A recompute of a month that is not the current one is ALWAYS forced: the
   * throttle protects a hot read path that only ever touches the open month.
   */
  force?: boolean;
}

/**
 * Recompute and store one employee's run for `month`.
 *
 * FAIL-SOFT: every outcome is a value, never a throw. A refresh that cannot run
 * must cost the freshness of one number and never the page — the employee still
 * sees the last stored run, which is exactly what the payslip shows.
 */
export async function refreshSalaryRun(
  employeeId: string,
  month: string,
  now: Date = new Date(),
  opts: RefreshOptions = {},
): Promise<RefreshOutcome> {
  // Only the OPEN month is a hot read path, so only it is throttled. A closed
  // month is recomputed because something actually changed, and waiting five
  // minutes to reflect that would be the bug rather than the protection.
  const force = opts.force || month !== currentMonthKeyOf(now);

  try {
    const existing = await db.query.salaryRuns.findFirst({
      where: and(eq(salaryRuns.employeeId, employeeId), eq(salaryRuns.month, month)),
    });

    if (!force && existing && now.getTime() - existing.updatedAt.getTime() < STALE_MS) {
      return "fresh";
    }

    const rows = await assembleMonthInputs(month, now);
    const row = rows.find((r) => r.employeeId === employeeId);
    if (!row) return "no-profile";
    // Mirrors generateSalary: no pay configuration ⇒ no ₹0 run materialised.
    if (!row.hasProfile) return "no-profile";

    const b = computeForRow(row);
    const computed = computedColumns(month, row, b);

    await db
      .insert(salaryRuns)
      .values({ employeeId, ...computed, source: "generated" })
      .onConflictDoUpdate({
        target: [salaryRuns.employeeId, salaryRuns.month],
        // INVARIANT, inherited from generateSalary: recomputed columns ONLY.
        // Never `disbursed`, `disbursedAmount` or `approvedById` — those record
        // what was PAID, which no recomputation may revise, and keeping the two
        // writers column-disjoint is also what makes them safe under
        // concurrency.
        set: { ...computed, updatedAt: new Date() },
      });

    await mirrorToBreakup(employeeId, month, row, b);
    return "refreshed";
  } catch {
    return "failed";
  }
}

/**
 * The recomputed columns of one run — the SINGLE definition of what a
 * recalculation writes.
 *
 * Shared by every writer (`refreshSalaryRun`, `refreshSalaryMonth`, and through
 * the latter the admin's Generate Salary) so two of them cannot drift into
 * producing different rows from the same inputs. That drift is not theoretical:
 * this shape was previously copy-pasted in three places.
 */
function computedColumns(month: string, row: MonthInputRow, b: SalaryBreakdown) {
  return {
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
    // The month's required hours, stored with the pay they measured (0211).
    targetHours: b.targetHours != null ? b.targetHours.toFixed(2) : null,
    overtimeHours: (b.overtimeHours ?? 0).toFixed(2),
    overtimeAmount: (b.overtimeAmount ?? 0).toFixed(2),
  };
}

export interface MonthRefreshResult {
  /** Runs written (inserted or updated). */
  written: number;
  /** Employees skipped for having no pay configuration on their basis. */
  skipped: number;
  /** Employees whose write threw; the loop continues past them. */
  failed: number;
  firstError?: string;
}

/**
 * Recompute and store EVERY employee's run for one month.
 *
 * This is the canonical whole-month path: the admin's "Generate Salary" button,
 * and any event that moves the month for everybody at once — a holiday declared
 * or withdrawn, most of all, since the calendar is what decides which days are
 * paid without being worked (spec §8/§11).
 *
 * ONE `assembleMonthInputs` pass for the roster rather than one per employee:
 * the assembler grades the whole org anyway, so calling it per person would
 * multiply the most expensive read in payroll by the headcount.
 *
 * Best-effort per employee — a single failure is counted and the loop goes on,
 * because a payroll run that abandons twenty-four people over one bad row is
 * worse than one that reports the bad row.
 */
export async function refreshSalaryMonth(
  month: string,
  now: Date = new Date(),
  opts: { generatedById?: string } = {},
): Promise<MonthRefreshResult> {
  const out: MonthRefreshResult = { written: 0, skipped: 0, failed: 0 };
  const rows = await assembleMonthInputs(month, now);

  for (const row of rows) {
    // No pay configuration for this basis ⇒ no ₹0 run materialised.
    if (!row.hasProfile) {
      out.skipped += 1;
      continue;
    }
    try {
      const b = computeForRow(row);
      const computed = computedColumns(month, row, b);
      await db
        .insert(salaryRuns)
        .values({
          employeeId: row.employeeId,
          ...computed,
          source: "generated",
          ...(opts.generatedById ? { generatedById: opts.generatedById } : null),
        })
        .onConflictDoUpdate({
          target: [salaryRuns.employeeId, salaryRuns.month],
          // Recomputed columns ONLY — never `disbursed`, `disbursedAmount` or
          // `approvedById`. See the header: what was PAID is not revisable.
          set: { ...computed, updatedAt: new Date() },
        });
      await mirrorToBreakup(row.employeeId, month, row, b);
      out.written += 1;
    } catch (err) {
      out.failed += 1;
      if (!out.firstError) out.firstError = err instanceof Error ? err.message : String(err);
    }
  }
  return out;
}

/**
 * Reprice a whole month for everyone, fire-and-forget.
 *
 * For an event that changes the CALENDAR rather than one person's record — a
 * holiday added or withdrawn. Fully swallowed: the holiday is already saved and
 * must not fail because payroll was momentarily unreachable.
 */
export async function refreshMonthAfterCalendarChange(
  month: string,
  now: Date = new Date(),
): Promise<void> {
  try {
    await refreshSalaryMonth(month, now);
  } catch {
    /* the calendar change stands whatever payroll did */
  }
}

/**
 * Recompute an employee's run for the month a CHANGE landed in, immediately
 * after something that actually moves their pay — an approved or withdrawn
 * leave, a corrected punch, a schedule edit.
 *
 * `month` defaults to the current one for callers that only ever touch it; pass
 * the affected month explicitly when the change is dated (a leave approved in
 * October for a day in August must reprice AUGUST — spec §11).
 *
 * Deliberately fire-and-forget and fully swallowed: the decision has already
 * been written and must not fail because payroll was momentarily unreachable.
 * The stored run then simply refreshes on the next recompute — late, but never
 * wrong.
 */
export async function refreshPayAfterAttendanceChange(
  employeeId: string,
  monthOrNow?: string | Date,
  now: Date = new Date(),
): Promise<void> {
  const month =
    typeof monthOrNow === "string" ? monthOrNow : currentMonthKeyOf(monthOrNow ?? now);
  try {
    await refreshSalaryRun(employeeId, month, now, { force: true });
  } catch {
    /* the decision stands whatever payroll did */
  }
}

/**
 * Reprice one employee across every month a dated change spanned. Sequential
 * on purpose — each month is a full org-wide assemble, and firing several at
 * once would multiply that against the connection pool for no gain on a path
 * nobody is waiting on.
 */
export async function refreshPayForRange(
  employeeId: string,
  startYmd: string,
  endYmd: string,
  now: Date = new Date(),
): Promise<void> {
  for (const month of monthsSpanned(startYmd, endYmd)) {
    await refreshPayAfterAttendanceChange(employeeId, month, now);
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
