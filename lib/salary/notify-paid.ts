import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, salaryBreakup } from "@/db/schema";
import { getCombinedEarnings } from "./combined-earnings";
import { renderCombinedEarningsPdf } from "./combined-earnings-pdf";
import { sendMonthlySlipsEmail } from "@/lib/email/report-emails";
import { employeeEmailTargets } from "@/lib/email/recipients";

/**
 * Mail an employee their slip the moment their salary is marked PAID.
 *
 * WHY THIS EXISTS: the 12th-of-month cron (`/api/cron/monthly-slips`) sends the
 * same slip on a schedule, but "paid" happens when someone presses the button —
 * which is the moment the employee actually wants the document. Waiting for the
 * cron means a gap between the money landing and any record of it, and that cron
 * is DEFAULT OFF (`MONTHLY_SLIPS_EMAIL_ON`), so on today's config nothing is
 * sent at all.
 *
 * It deliberately REUSES that cron's exact pipeline — `getCombinedEarnings` →
 * `renderCombinedEarningsPdf` → `sendMonthlySlipsEmail` — so the slip a person
 * gets on payment is byte-for-byte the one they would get on the 12th. A second
 * renderer here would drift from it within a month.
 *
 * BOTH MAILBOXES: `employeeEmailTargets` resolves the login, official and
 * personal addresses and dedupes them, so work and personal both receive it.
 * That helper reads ONE employee's own record, which is what keeps it impossible
 * for one person's payment details to reach another's inbox.
 *
 * FIRES ONLY ON THE PAID EDGE. The caller passes `paid === true` only; unmarking
 * sends nothing, and re-marking an already-paid row is the caller's concern (see
 * setSalaryPaid, which only defers this when the flag actually flips on).
 *
 * NEVER THROWS. The row is already marked paid by the time this runs — a mail
 * failure must not surface as a failed action and make an admin press the button
 * twice. Failures are logged; the slip remains downloadable from the payslip
 * column either way.
 */
/**
 * Where THIS row's slip is about to go — resolved before the send, cheaply.
 *
 * `mailPayslipOnPaid` runs after the response and can only log, so on its own an
 * admin pressing Pay never learns that the person has no personal address on
 * file and only half the delivery happened. This is the same lookup, done as one
 * indexed read while the action is still able to answer, so the button can say
 * exactly which mailboxes are getting the slip and which are missing.
 *
 * It resolves addresses and nothing else — it never sends. The send stays in
 * `mailPayslipOnPaid`, which repeats the lookup rather than trusting a value
 * passed across the deferral boundary.
 */
export interface PayslipMailSummary {
  /** Deduped addresses that will actually receive the slip. */
  to: string[];
  /** Which of the three columns carried an address. `business` is the work
   *  mailbox (`official_email`), falling back to the login address when the
   *  employee has no separate official one — that login address IS their work
   *  mail in this org, so treating it as absent would warn about nothing. */
  business: boolean;
  personal: boolean;
  /** Null when the row has no linked employee at all (sheet-imported rows can
   *  predate their employee record), which is a different problem from an
   *  employee whose profile is simply missing an address. */
  name: string | null;
  linked: boolean;
}

export async function payslipMailTargets(breakupId: string): Promise<PayslipMailSummary> {
  const [row] = await db
    .select({
      employeeId: salaryBreakup.employeeId,
      name: employees.name,
      email: employees.email,
      officialEmail: employees.officialEmail,
      personalEmail: employees.personalEmail,
    })
    .from(salaryBreakup)
    .leftJoin(employees, eq(salaryBreakup.employeeId, employees.id))
    .where(eq(salaryBreakup.id, breakupId))
    .limit(1);

  if (!row?.employeeId) {
    return { to: [], business: false, personal: false, name: row?.name ?? null, linked: false };
  }
  return {
    to: employeeEmailTargets(row),
    business: Boolean(row.officialEmail?.trim() || row.email?.trim()),
    personal: Boolean(row.personalEmail?.trim()),
    name: row.name ?? null,
    linked: true,
  };
}

export async function mailPayslipOnPaid(breakupId: string): Promise<void> {
  try {
    const [row] = await db
      .select({
        employeeId: salaryBreakup.employeeId,
        month: salaryBreakup.month,
        name: employees.name,
        email: employees.email,
        officialEmail: employees.officialEmail,
        personalEmail: employees.personalEmail,
      })
      .from(salaryBreakup)
      .leftJoin(employees, eq(salaryBreakup.employeeId, employees.id))
      .where(eq(salaryBreakup.id, breakupId))
      .limit(1);

    // `employee_id` is nullable (ON DELETE SET NULL) and sheet-imported rows can
    // predate their employee record, so an unlinked row is expected, not a bug.
    if (!row?.employeeId) return;

    const to = employeeEmailTargets(row);
    if (to.length === 0) {
      console.error(`[salary] no address on file for ${row.name ?? row.employeeId}; paid-mail skipped`);
      return;
    }

    // `month` is a DATE column; the earnings query keys on "YYYY-MM".
    const month = String(row.month).slice(0, 7);
    const data = await getCombinedEarnings(row.employeeId, month, row.name ?? undefined);
    const pdf = await renderCombinedEarningsPdf(data, { generatedBy: "Altus Corp" });
    const filename = `Altus-EarningsSlip-${(data.employeeName || row.name || "employee").replace(/\s+/g, "")}-${month}.pdf`;

    const res = await sendMonthlySlipsEmail({
      recipient: { email: to, name: row.name ?? "" },
      monthLabel: data.monthLabel,
      totalEarnings: data.totalEarnings,
      pdf,
      filename,
      siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
    });
    if (res.error) {
      console.error(`[salary] paid-mail failed for ${row.name ?? row.employeeId}:`, res.error);
    }
  } catch (e) {
    console.error("[salary] paid-mail threw:", e instanceof Error ? e.message : e);
  }
}
