/**
 * CLOSE A LEAVE PERIOD — encash whatever nobody took.
 *
 * Entitlement lapses at the end of each six-month period, but what lapses is the
 * DAY OFF, not its value: the unused balance is paid out. This script turns that
 * rule into one pending `salary_adjustments` row per employee for HR to approve.
 * Nothing reaches payroll until a human agrees to it — see migration 0207, which
 * added the amount and status columns that make an approvable adjustment
 * expressible at all.
 *
 * ── RUN IT ON OR AFTER THE CLOSING DAY ─────────────────────────────────────
 * Periods close on 30 September and 31 March. Pass the closing date so the run
 * is reproducible and can be repeated later without depending on when it happened
 * to be executed:
 *
 *   pnpm tsx --env-file=.env.local scripts/close-leave-cycle.ts 2027-03-31
 *   pnpm tsx --env-file=.env.local scripts/close-leave-cycle.ts 2027-03-31 --apply
 *
 * Dry run by default; it prints every figure it would write.
 *
 * ── IDEMPOTENT ─────────────────────────────────────────────────────────────
 * Upserts on `salary_adjustments_encashment_uq` (one encashment per employee per
 * month), so running it twice at month end cannot pay anybody twice. A row that
 * has ALREADY been decided is left completely alone — re-running must never
 * revive an adjustment HR rejected, nor silently restate one they approved.
 *
 * ── PAID-LEAVE ELIGIBILITY ─────────────────────────────────────────────────
 * Only full-timers accrue paid leave (`isPaidLeaveEligible`), so only they have
 * anything to encash. Everyone else is skipped and said so, rather than quietly
 * omitted — "nobody was encashed" and "nobody was considered" look identical in
 * an empty output.
 */
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "../lib/db";
import { employees, leaveRequests, salaryProfiles } from "../db/schema";
import { balanceWindow, leaveDaysInWindow, leaveCycleFor } from "../lib/attendance/leave-cycle";
import { computeEncashment, encashmentReason } from "../lib/attendance/leave-encashment";
import { isPaidLeaveEligible } from "../lib/attendance/leave-eligibility";
import { asWorkerType } from "../lib/attendance/worker-type";

const APPLY = process.argv.includes("--apply");
const DATE_ARG = process.argv.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));

async function main() {
  if (!DATE_ARG) {
    console.error(
      "Pass the period's CLOSING DATE, e.g.\n" +
        "  pnpm tsx --env-file=.env.local scripts/close-leave-cycle.ts 2027-03-31 [--apply]",
    );
    process.exit(1);
  }
  const onDate = DATE_ARG;
  const month = onDate.slice(0, 7);

  const roster = await db
    .select({
      id: employees.id,
      name: employees.name,
      workerType: employees.workerType,
      probationEnd: employees.probationEnd,
      annualCtc: salaryProfiles.annualCtc,
    })
    .from(employees)
    .leftJoin(salaryProfiles, eq(salaryProfiles.employeeId, employees.id))
    .where(eq(employees.isActive, true));

  const probe = leaveCycleFor(null, onDate);
  console.log(`\nClosing ${probe.cycleStart} → ${probe.cycleEnd}  (adjustment month ${month})`);
  console.log(`${roster.length} active employees.`);
  if (!APPLY) console.log("DRY RUN — nothing will be written. Re-run with --apply.\n");
  else console.log("");

  let written = 0;
  let skipped = 0;
  let totalRupees = 0;

  for (const emp of roster) {
    if (!isPaidLeaveEligible(asWorkerType(emp.workerType))) {
      skipped += 1;
      continue;
    }

    const probationEnd = emp.probationEnd ?? null;
    const cycle = leaveCycleFor(probationEnd, onDate);
    const win = cycle.beforeProbation
      ? null
      : balanceWindow(probationEnd, cycle.cycleStart, cycle.cycleEnd);

    let used = 0;
    if (win) {
      const rows = await db
        .select({
          startDate: leaveRequests.startDate,
          endDate: leaveRequests.endDate,
          startHalfDay: leaveRequests.startHalfDay,
          endHalfDay: leaveRequests.endHalfDay,
        })
        .from(leaveRequests)
        .where(
          and(
            eq(leaveRequests.employeeId, emp.id),
            eq(leaveRequests.kind, "paid"),
            eq(leaveRequests.status, "approved"),
            lte(leaveRequests.startDate, win.to),
            gte(leaveRequests.endDate, win.from),
          ),
        );
      // HALF-AWARE (0208). Counting a half-day boundary as a whole day would
      // overstate what was taken, understate what is unused, and UNDERPAY the
      // encashment — the one direction an error here must never go.
      used = rows.reduce(
        (n, r) =>
          n +
          leaveDaysInWindow(
            {
              startDate: String(r.startDate),
              endDate: String(r.endDate),
              startHalfDay: r.startHalfDay,
              endHalfDay: r.endHalfDay,
            },
            win.from,
            win.to,
          ),
        0,
      );
    }

    const e = computeEncashment({
      probationEnd,
      annualCtc: Number(emp.annualCtc ?? 0),
      paidLeaveUsed: used,
      onDate,
    });

    if (e.unusedDays <= 0 || e.amount <= 0) {
      console.log(
        `  —      ${emp.name.padEnd(22)} nothing to encash ` +
          `(${e.used} of ${e.allowance} taken${e.amount === 0 && e.unusedDays > 0 ? ", no CTC on file" : ""})`,
      );
      continue;
    }

    console.log(
      `  ${APPLY ? "WRITE" : "would"}  ${emp.name.padEnd(22)} ` +
        `${String(e.unusedDays).padStart(4)} day(s) x ₹${Math.round(e.perDayRate)} = ₹${e.amount.toLocaleString("en-IN")}`,
    );
    totalRupees += e.amount;
    if (!APPLY) continue;

    // RAW SQL on purpose: `salary_adjustments` is created by migration 0122 and
    // is deliberately NOT declared in db/schema.ts (it is read through raw SQL
    // everywhere else too — see lib/queries/salary-ctc-store.ts). Declaring it
    // here just for this script would put drizzle-kit in a position to propose
    // dropping and recreating a live table, which is a far worse trade than one
    // hand-written statement.
    //
    // The conflict target is the PARTIAL index from 0207, so its predicate has
    // to be restated for Postgres to infer it as the arbiter.
    await db.execute(sql`
      insert into salary_adjustments
        (employee_id, month, kind, days, amount, reason, status)
      values
        (${emp.id}, ${month}, 'leave_encashment', ${e.unusedDays}, ${e.amount},
         ${encashmentReason(e)}, 'pending')
      on conflict (employee_id, month) where kind = 'leave_encashment'
      do update set
        days   = excluded.days,
        amount = excluded.amount,
        reason = excluded.reason
      -- A row HR has already decided is FINAL. Re-running the close must never
      -- revive a rejected adjustment, nor restate an approved one behind their back.
      where salary_adjustments.status = 'pending'
    `);
    written += 1;
  }

  console.log(
    `\n${APPLY ? `Wrote ${written} pending adjustment(s)` : "Dry run complete"}` +
      ` — ₹${totalRupees.toLocaleString("en-IN")} total.` +
      ` ${skipped} employee(s) skipped (no paid-leave entitlement).\n`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("\nClose FAILED:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
