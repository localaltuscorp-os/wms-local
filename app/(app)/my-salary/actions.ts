"use server";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees } from "@/db/schema";
import { getCurrentEmployee, guardNotCandidate } from "@/lib/auth/current";
import { loadMonthLedger } from "@/lib/salary/my-salary";
import { canViewSalaryOf } from "@/lib/salary/salary-people";
import type { DayLedger } from "@/lib/salary/day-ledger";

/**
 * ONE MONTH'S DAILY SALARY REPORT, fetched when the employee picks that month.
 *
 * ── WHY THIS IS A SERVER ACTION AND NOT A PROP ─────────────────────────────
 * The page ships the report for the month it opens on. A month of day rows is
 * roughly 30KB of serialised payload, so a nine-month history would inline a
 * quarter of a megabyte for eight months nobody has looked at. This fetches the
 * rest on demand — see `MySalaryOptions.ledgerMonths`.
 *
 * ── EVERY CALL IS RE-AUTHORISED ────────────────────────────────────────────
 * A server action is a public endpoint, and `employeeId` arrives from the
 * browser. It is therefore re-checked through `canViewSalaryOf` — the same
 * single choke point the page uses — rather than trusted because the page
 * happened to render it. Salary is the most sensitive data this app holds, and
 * an action that took an employee id on faith would hand a stranger's pay to
 * anyone who could edit a network request.
 *
 * The RETURN is deliberately narrow: the ledger, or null. No error strings, no
 * partial employee record. A refusal and a month with no attributable record
 * look identical to the caller, so a probe learns nothing about who exists.
 */
export async function fetchMonthLedger(
  employeeId: string,
  month: string,
): Promise<DayLedger | null> {
  const me = await getCurrentEmployee();
  if (!me) return null;
  guardNotCandidate(me);

  // yyyy-mm, and nothing else. The value reaches a date parser and a month key,
  // so it is validated in shape here rather than sanitised downstream.
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null;

  if (!(await canViewSalaryOf(me, employeeId))) return null;

  // THEIR worker type, not the viewer's: the pay basis keys off it, and an
  // admin reading a part-timer's month must see the part-timer's engine.
  const workerType =
    employeeId === me.id
      ? me.workerType
      : ((
          await db.query.employees.findFirst({
            where: eq(employees.id, employeeId),
            columns: { workerType: true },
          })
        )?.workerType ?? null);

  try {
    return await loadMonthLedger(employeeId, workerType, month);
  } catch (err) {
    // Fail-soft, like every other read on this page: a report that cannot be
    // built costs the section, never the page or the figures above it.
    console.error("[my-salary] month ledger failed for", employeeId, month, err);
    return null;
  }
}
