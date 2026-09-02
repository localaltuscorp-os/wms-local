import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Route } from "next";
import { ArrowLeft, FileText } from "lucide-react";
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
    <main className="mx-auto w-full max-w-[900px] px-8 pb-20 pt-8 max-md:px-4">
      <Link
        href={"/hr" as Route}
        className="mb-6 inline-flex items-center gap-1.5 rounded-pill border border-hairline-strong bg-surface-card px-3.5 py-2 text-[12.5px] font-bold text-ink-soft transition-colors hover:border-[color-mix(in_srgb,var(--color-altus-red)_45%,transparent)] hover:text-altus-red"
      >
        <ArrowLeft size={15} strokeWidth={2.6} /> Back to HR
      </Link>

      <header className="mb-6">
        <div
          className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.12em]"
          style={{ color: ACCENT_DEEP }}
        >
          <FileText size={14} strokeWidth={2.6} /> Altus · Salary Slip
        </div>
        <h1
          className="mt-2 text-ink-strong"
          style={{
            fontFamily: "var(--font-display), system-ui, sans-serif",
            fontWeight: 900,
            fontSize: "clamp(26px,3vw,34px)",
            letterSpacing: "-0.025em",
          }}
        >
          {me.name?.split(" ")[0] ? `${me.name.split(" ")[0]}'s salary slips` : "Salary slips"}
        </h1>
        <p className="mt-1 text-[14.5px] text-ink-muted">
          Every month your salary has been processed. Open one to read it here, or
          download the PDF. Visible only to you.
        </p>
      </header>

      <SalarySlipList employeeId={me.id} months={months} />

      <p className="mt-6 text-[12.5px] text-ink-subtle">
        A slip covers salary, attendance and incentives for the month — the same
        document that is emailed to you when the month is marked paid.
      </p>
    </main>
  );
}
