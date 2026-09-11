// VERIFY THE DAILY SALARY REPORT AGAINST REAL DATA (spec §17).
//
//   pnpm tsx --conditions=react-server --env-file=.env.local \
//     scripts/verify-daily-salary-report.ts [YYYY-MM]
//
// (`--conditions=react-server` makes `server-only` resolve to its no-op shim,
//  the same way scripts/smoke-outstanding.ts runs the query layer.)
//
// STRICTLY READ-ONLY. It deliberately does NOT go through
// `loadMySalaryMonths`, because that calls `refreshOpenMonthRun`, which WRITES
// the open month's run. A verification script has no business changing the
// figures it is checking.
//
// ── IT MEASURES TWO DIFFERENT THINGS, AND THE DISTINCTION IS THE POINT ─────
//
//   RESIDUAL vs the LIVE engine
//     The ledger's per-day rupees against a breakdown computed RIGHT NOW from
//     the same graded month, through the real payroll function. This is the
//     attribution under test, and it must be under a rupee. Anything else is a
//     bug in lib/salary/day-ledger.ts.
//
//   DRIFT vs the STORED run
//     The same figures against the `salary_runs` row that was actually issued.
//     For a CLOSED month this is expected to be non-zero and is not a defect:
//     the run is frozen at the moment it was generated, while attendance keeps
//     moving underneath it — a backfilled punch, a leave approved later, a
//     holiday added to the calendar. `lib/salary/my-salary.ts` documents this
//     as deliberate ("a payslip has to keep saying what it said on the day it
//     was paid"). Reported so the size of that gap is known rather than
//     guessed at.
//
// Exits non-zero only on the first kind.

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, orgSettings, salaryProfiles, salaryRuns } from "@/db/schema";
import { employeeEffectiveConfig } from "@/lib/queries/attendance-status";
import { getEmployeeMonthStatus } from "@/lib/queries/attendance-status";
import { isHoursPayrollMonth, payrollMonthFor } from "@/lib/attendance/payroll-month";
import {
  asWorkerType,
  earnsOvertime,
  hourlyMonthlyAnchor,
  payBasisFor,
} from "@/lib/attendance/worker-type";
import {
  computeHourlySalary,
  computeScheduleHourlySalary,
  type SalaryBreakdown,
} from "@/lib/salary/compute";
import {
  buildDayLedger,
  hm,
  inr,
  ledgerReconciles,
  type LedgerPay,
} from "@/lib/salary/day-ledger";
import { localDateString } from "@/lib/format";

const MONTH = process.argv[2] ?? localDateString("Asia/Kolkata").slice(0, 7);
const TODAY = localDateString("Asia/Kolkata");
const DAYS_IN_MONTH = (() => {
  const [y, m] = MONTH.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
})();

interface Failure {
  who: string;
  what: string;
}

const money = (v: string | number | null | undefined): number =>
  v == null ? 0 : Number(v) || 0;

async function main(): Promise<void> {
  const [y, m] = MONTH.split("-").map(Number) as [number, number];
  console.log(`\nDAILY SALARY REPORT — verifying ${MONTH}\n`);
  console.log(
    `hours-based payroll month: ${isHoursPayrollMonth(MONTH) ? "yes" : "NO (frozen — expect attendance-only)"}`,
  );

  // Read org settings DIRECTLY. `getOrgSettings` is wrapped in `unstable_cache`,
  // which needs Next's request context and simply falls back outside it — and a
  // fallback config would resolve different daily targets than production uses,
  // quietly invalidating every figure below.
  const [org] = await db.select().from(orgSettings).where(eq(orgSettings.id, 1)).limit(1);
  console.log(
    `org settings: ${org ? `loaded (full day ${org.attFullDayHours ?? "—"}h)` : "MISSING — figures may not match production"}\n`,
  );

  const runs = await db
    .select({
      employeeId: salaryRuns.employeeId,
      name: employees.name,
      workerType: employees.workerType,
      runAnnualCtc: salaryRuns.annualCtc,
      gross: salaryRuns.gross,
      hourlyRate: salaryRuns.hourlyRate,
      targetHours: salaryRuns.targetHours,
      overtimeAmount: salaryRuns.overtimeAmount,
      disbursed: salaryRuns.disbursed,
      updatedAt: salaryRuns.updatedAt,
      annualCtc: salaryProfiles.annualCtc,
      monthlyPayAtTarget: salaryProfiles.monthlyPayAtTarget,
      weeklyTargetHours: salaryProfiles.weeklyTargetHours,
      monthlyFee: salaryProfiles.monthlyFee,
    })
    .from(salaryRuns)
    .innerJoin(employees, eq(salaryRuns.employeeId, employees.id))
    .leftJoin(salaryProfiles, eq(salaryProfiles.employeeId, employees.id))
    .where(eq(salaryRuns.month, MONTH))
    .orderBy(employees.name);

  if (runs.length === 0) {
    console.log(`No salary runs stored for ${MONTH}. Nothing to verify.`);
    return;
  }

  const failures: Failure[] = [];
  const drifts: { who: string; drift: number; runTarget: number | null; engineTarget: number }[] = [];
  let checked = 0;
  let attendanceOnly = 0;
  let withheld = 0;

  for (const r of runs) {
    const empRow = await db.query.employees.findFirst({
      where: eq(employees.id, r.employeeId),
    });
    if (!empRow) continue;
    const cfg = employeeEffectiveConfig(empRow, org ?? null);
    const status = await getEmployeeMonthStatus(r.employeeId, y, m, TODAY);
    if (status.days.length === 0) continue;

    const { recon, hours } = payrollMonthFor(status.days, {
      month: MONTH,
      cfg,
      refTodayISO: TODAY,
    });

    const wt = asWorkerType(r.workerType);
    const basis = payBasisFor(wt);
    const who = `${r.name} (${wt})`;

    // ── THE LIVE BREAKDOWN — the real engine, on today's graded month ────
    // Exactly the call `computeForRow` makes for this basis, with the same
    // inputs. PT / TDS / advances are passed as zero: they move the NET, never
    // the gross the ledger attributes.
    let live: SalaryBreakdown | null = null;
    if (basis === "monthly_ctc" && hours.targetHours > 0) {
      live = computeScheduleHourlySalary({
        monthlySalary: money(r.annualCtc) / 12,
        monthlyTargetHours: hours.targetHours,
        payableHoursRaw: hours.payableMinutesRaw / 60,
        dailyTargetHours: cfg.dailyTargetMinutes / 60,
        chargeableHalfDays: recon.chargeableHalfDays,
        unpaidLeaveDays: hours.unpaidLeaveDays,
        overtimeHours: earnsOvertime(wt) ? hours.netSurplusMinutes / 60 : 0,
        ptExempt: true,
        tdsMonthly: 0,
        advances: 0,
        pendingBalanceIn: 0,
      });
    } else if (basis === "hourly") {
      live = computeHourlySalary({
        monthlyPayAtTarget: hourlyMonthlyAnchor({
          annualCtc: money(r.annualCtc),
          monthlyPayAtTarget: money(r.monthlyPayAtTarget),
        }),
        weeklyTargetHours: money(r.weeklyTargetHours) || cfg.weeklyTargetMinutes / 60,
        daysInMonth: DAYS_IN_MONTH,
        workedMinutes: status.summary.totalWorkedMinutes,
        overtimeEligible: earnsOvertime(wt),
        eligibleTargetHours: hours.targetHours > 0 ? hours.targetHours : null,
        ptExempt: true,
        tdsMonthly: 0,
        advances: 0,
        pendingBalanceIn: 0,
      });
    }

    const liveRate = live?.hourlyRate ?? 0;
    let pay: LedgerPay;
    if (basis === "fixed_fee" || !isHoursPayrollMonth(MONTH) || !live || !(liveRate > 0)) {
      pay = { mode: "attendance_only", note: "not attributable" };
    } else if (basis === "hourly") {
      pay = {
        mode: "hours_worked",
        hourlyRate: liveRate,
        gross: live.gross,
        monthlyAnchor: hourlyMonthlyAnchor({
          annualCtc: money(r.annualCtc),
          monthlyPayAtTarget: money(r.monthlyPayAtTarget),
        }),
        surplusPaid: earnsOvertime(wt),
      };
    } else {
      pay = {
        mode: "hours_schedule",
        hourlyRate: liveRate,
        gross: live.gross,
        overtimeAmount: live.overtimeAmount ?? 0,
        monthlySalary: money(r.annualCtc) / 12,
      };
    }

    const ledger = buildDayLedger({
      month: MONTH,
      monthLabel: MONTH,
      days: status.days,
      cfg: {
        dailyTargetMinutes: cfg.dailyTargetMinutes,
        weeklyTargetMinutes: cfg.weeklyTargetMinutes,
      },
      recon,
      hours,
      pay,
      refTodayISO: TODAY,
    });

    // ── structural invariants, whatever the money says ───────────────────
    const inWeeks = ledger.weeks.flatMap((w) => w.days.map((d) => d.date));
    if (inWeeks.length !== ledger.days.length) {
      failures.push({
        who,
        what: `weeks hold ${inWeeks.length} days, month has ${ledger.days.length}`,
      });
    }
    if (new Set(inWeeks).size !== inWeeks.length) {
      failures.push({ who, what: "a day appears in more than one week" });
    }
    const sumWorked = ledger.weeks.reduce((s, w) => s + w.totals.workedMinutes, 0);
    const sumRequired = ledger.weeks.reduce((s, w) => s + w.totals.requiredMinutes, 0);
    if (sumWorked !== ledger.totals.workedMinutes) {
      failures.push({ who, what: `week worked ${sumWorked}m ≠ month ${ledger.totals.workedMinutes}m` });
    }
    if (sumRequired !== ledger.totals.requiredMinutes) {
      failures.push({ who, what: `week required ${sumRequired}m ≠ month ${ledger.totals.requiredMinutes}m` });
    }
    if (ledger.totals.workedMinutes !== recon.totalActualMinutes) {
      failures.push({
        who,
        what: `worked ${ledger.totals.workedMinutes}m ≠ engine actual ${recon.totalActualMinutes}m`,
      });
    }

    if (ledger.mode === "attendance_only") {
      attendanceOnly += 1;
      console.log(
        `  --  ${r.name.padEnd(22)} ${String(wt).padEnd(12)} attendance-only ` +
          `· ${hm(ledger.totals.workedMinutes)} / ${hm(ledger.totals.requiredMinutes)}`,
      );
      continue;
    }

    checked += 1;
    const rec = ledger.reconciliation!;
    const ok = Math.abs(rec.residual) < 1;
    if (!ok) {
      failures.push({
        who,
        what: `residual ₹${rec.residual.toFixed(2)} against the LIVE engine — the attribution is wrong`,
      });
    }

    // ── WHAT THE PAGE WOULD ACTUALLY SHOW ────────────────────────────────
    // Production attributes against the STORED run, then withholds the money if
    // the rows cannot be made to add up to it (see `ledgerReconciles` and the
    // guard in lib/salary/my-salary.ts). Rebuild that way, so this script
    // reports what an employee would see rather than only what the engine can
    // justify in principle.
    const runRate = money(r.hourlyRate);
    const asPage =
      runRate > 0
        ? buildDayLedger({
            month: MONTH,
            monthLabel: MONTH,
            days: status.days,
            cfg: {
              dailyTargetMinutes: cfg.dailyTargetMinutes,
              weeklyTargetMinutes: cfg.weeklyTargetMinutes,
            },
            recon,
            hours,
            pay:
              basis === "hourly"
                ? {
                    mode: "hours_worked",
                    hourlyRate: runRate,
                    gross: money(r.gross),
                    monthlyAnchor: 0,
                    surplusPaid: earnsOvertime(wt),
                  }
                : {
                    mode: "hours_schedule",
                    hourlyRate: runRate,
                    gross: money(r.gross),
                    overtimeAmount: money(r.overtimeAmount),
                    monthlySalary: money(r.runAnnualCtc) / 12,
                  },
            refTodayISO: TODAY,
          })
        : null;
    const pageShowsMoney = asPage != null && ledgerReconciles(asPage);
    if (!pageShowsMoney) withheld += 1;

    // Drift is informational: the frozen run against today's attendance.
    const drift = money(r.gross) - live!.gross;
    drifts.push({
      who,
      drift,
      runTarget: r.targetHours == null ? null : money(r.targetHours),
      engineTarget: hours.targetHours,
    });

    console.log(
      `  ${ok ? "OK" : "XX"}  ${r.name.padEnd(22)} ${String(wt).padEnd(12)}` +
        ` live ${inr(live!.gross).padStart(11)}` +
        ` = ${inr(rec.attributedEarned).padStart(11)}` +
        (rec.attributedAdjustment ? ` adj ${inr(rec.attributedAdjustment)}` : "") +
        (rec.surplusNotPayable ? ` −surplus ${inr(rec.surplusNotPayable)}` : "") +
        (rec.roundedDownToWholeHours ? ` −rnd ${inr(rec.roundedDownToWholeHours)}` : "") +
        (rec.cappedAtMonthlySalary ? ` −cap ${inr(rec.cappedAtMonthlySalary)}` : "") +
        (rec.additionalHoursPay ? ` +extra ${inr(rec.additionalHoursPay)}` : "") +
        (rec.chargesBeyondEarnings ? ` +floor ${inr(rec.chargesBeyondEarnings)}` : "") +
        `  [res ${rec.residual.toFixed(2)}]` +
        `  page:${pageShowsMoney ? "money" : "hours-only"}` +
        `  run ${inr(money(r.gross))}${Math.abs(drift) >= 1 ? ` drift ${drift > 0 ? "+" : "−"}${inr(Math.abs(drift))}` : ""}` +
        (r.disbursed ? " (paid)" : ""),
    );
  }

  console.log(
    `\n${checked} employee-month(s) attributed, ${attendanceOnly} attendance-only, ` +
      `${failures.length} attribution problem(s).`,
  );
  console.log(
    `The page would show per-day money for ${checked - withheld} of ${checked}, and attendance ` +
      `only for ${withheld} whose stored run cannot be reconciled against the current record.`,
  );

  const drifted = drifts.filter((d) => Math.abs(d.drift) >= 1);
  if (drifted.length > 0) {
    console.log(
      `\nFROZEN-RUN DRIFT — ${drifted.length} of ${drifts.length} runs no longer match today's` +
        ` attendance.\nExpected for a closed month (the run is the payslip as issued); listed so` +
        ` the size is known.`,
    );
    for (const d of drifted.sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift))) {
      const t =
        d.runTarget != null && Math.abs(d.runTarget - d.engineTarget) > 0.02
          ? `  (run target ${d.runTarget.toFixed(1)}h vs engine ${d.engineTarget.toFixed(1)}h)`
          : "";
      console.log(`  · ${d.who.padEnd(30)} ${(d.drift > 0 ? "+" : "−") + inr(Math.abs(d.drift))}${t}`);
    }
  }

  if (failures.length > 0) {
    console.log("\nATTRIBUTION PROBLEMS");
    for (const f of failures) console.log(`  · ${f.who}: ${f.what}`);
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => process.exit(process.exitCode ?? 0));
