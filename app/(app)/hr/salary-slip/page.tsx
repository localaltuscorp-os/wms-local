import { notFound, redirect } from "next/navigation";
import type { Route } from "next";
import { HrTitleBar } from "@/components/hr/console/hr-title-bar";
import { PageShell } from "@/components/layout/page-shell";
import { getCurrentEmployee } from "@/lib/auth/current";
import { mySalaryBreakup } from "@/lib/queries/salary-breakup";
import { netAfterWaiveOff } from "@/lib/salary/waive-off";
import { fyForMonth } from "@/lib/salary/period";
import { SalarySlipList, type SalarySlipMonth } from "@/components/salary/salary-slip-list";

export const dynamic = "force-dynamic";

const ACCENT_DEEP = "#A80400";

function monthLabel(ymd: string): string {
  // `month` is a DATE column → "YYYY-MM-DD"; label the month it falls in.
  const [y, m] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, 1)).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * SALARY SLIP — the employee's own slips, one per month, view or download.
 *
 * SELF-SCOPED BY CONSTRUCTION. It reads `mySalaryBreakup(me.id)` for the signed-in
 * employee and nothing else — there is no employee parameter to tamper with, so
 * this page cannot be pointed at someone else's pay. The PDF route it links to
 * re-checks the same boundary on its own (admin, or the employee themselves),
 * which is what keeps the document safe even if someone hand-crafts the URL.
 *
 * It is open to EVERY signed-in employee, deliberately: these are their own
 * payslips. The admin Salary module in the Accounts room stays finance-gated.
 *
 * Reached from the HR deck card. The HR module is rail-less, so that card is the
 * only door and this page carries its own "Back to HR" control, matching the
 * other full-bleed HR surfaces.
 */
export default async function SalarySlipPage() {
  // Killed with the rest of the statement documents — the slips this page lists
  // ARE those documents, so a page that renders rows whose every action 404s
  // would be worse than not offering it.
  if (process.env.SALARY_STATEMENTS === "false") notFound();

  const me = await getCurrentEmployee();
  if (!me) redirect("/login" as Route);

  const rows = await mySalaryBreakup(me.id);

  const months: SalarySlipMonth[] = rows.map((r) => {
    const ym = String(r.month).slice(0, 7);
    return {
      month: ym,
      label: monthLabel(String(r.month)),
      fy: fyForMonth(ym),
      designation: r.designation ?? null,
      companyName: r.companyName ?? null,
      // The EFFECTIVE net — base + condoned wave-off days + signed adjustment —
      // so the figure on the row is the one that was actually paid, matching
      // what the admin table and the slip itself show.
      finalPayment: netAfterWaiveOff(r),
      paid: r.paid,
    };
  });

  return (
    <>
      <HrTitleBar />
      {/* PageShell rather than a hand-rolled `max-w-[900px]`: the 900px cap
          froze this page at one size, so collapsing either sidebar just added
          empty margin instead of giving the content the room. PageShell's cap
          is the shared `wide` token and its gutter is fluid, so the card tracks
          the column it actually sits in - the same behaviour the letters have.
          The list inside is a full-width flex column with no fixed widths of
          its own, so it reflows cleanly at every size. */}
      <PageShell width="wide" py={false} className="pt-8 pb-20">
        <SalarySlipList employeeId={me.id} months={months} />

        {/* Centered under the card it describes, rather than ragged against
            the left edge of a now-variable-width column. */}
        <p className="mt-6 text-center text-[12.5px] text-ink-subtle">
          A slip covers salary, attendance and incentives for the month - the same
          document that is emailed to you when the month is marked paid.
        </p>
      </PageShell>
    </>
  );
}
