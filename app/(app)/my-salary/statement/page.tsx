import { redirect } from "next/navigation";
import { DashboardHeader } from "@/components/layout/header";
import { PageCommandBar } from "@/components/layout/page-command-bar";
import { getCurrentEmployee, guardNotCandidate } from "@/lib/auth/current";
import { loadMySalaryMonths } from "@/lib/salary/my-salary";
import { loadSalarySlipData } from "@/lib/salary/salary-slip-data";
import { loadSalaryViewAccess, resolveSalaryTarget } from "@/lib/salary/salary-people";
import { SalaryPersonPicker } from "@/components/salary/salary-person-picker";
import { SalaryStatement } from "@/components/salary/salary-statement";
import { isMonthKey, currentMonthKey } from "@/lib/incentive/analytics/periods";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * SALARY STATEMENT — the employee's own three-part statement, on the web.
 *
 * ── WHY THIS IS A PAGE AND NOT A PDF ───────────────────────────────────────
 * The statement used to exist only as a PDF, and the PDF had grown dropdowns and
 * JavaScript so one file could be browsed like an app: every week was a hidden
 * layer, every incentive window too. That made the document unreadable when
 * printed, fragile as data grew, and impossible to check against the screen.
 *
 * So the browsing lives HERE, where browsing belongs, and the PDF went back to
 * being a fixed three-page document (see lib/salary/salary-slip-pdf.ts). Both
 * read the SAME `loadSalarySlipData` — one query, one set of figures, two
 * renderings.
 *
 * ── THE VIEWS ARE IN THE URL ───────────────────────────────────────────────
 * `?month=`, `?view=` and `?inv=` are the state. That keeps the page
 * server-rendered (so a long month is a long page only in the table it draws,
 * never in hidden markup), makes any view linkable, and means the PDF link can
 * carry the same month the reader is looking at.
 */
export default async function SalaryStatementPage({ searchParams }: PageProps) {
  const me = await getCurrentEmployee();
  if (!me) redirect("/login");
  guardNotCandidate(me);

  const sp = await searchParams;
  const empParam = typeof sp.emp === "string" ? sp.emp : null;
  const monthParam = typeof sp.month === "string" && isMonthKey(sp.month) ? sp.month : null;
  const viewParam = typeof sp.view === "string" ? sp.view : null;
  const invParam = typeof sp.inv === "string" ? sp.inv : null;

  const access = await loadSalaryViewAccess(me);
  // Same gate, same helper as My Salary — a URL that names somebody this viewer
  // may not open falls back to their own record.
  const { targetId, name: targetName, workerType } = await resolveSalaryTarget(me, empParam);

  // The month the statement opens on: the one asked for, else the open payroll
  // month (the same default My Salary uses).
  const month = monthParam ?? currentMonthKey();

  // TWO READS OF ONE ENGINE, deliberately. `loadSalarySlipData` builds the whole
  // statement for ONE month; the picker needs the list of months that exist. The
  // list is read with `ledgerMonths: "none"` — no day rows — and it is the same
  // engine, so the two can never disagree about what a month's figures are.
  const [data, months] = await Promise.all([
    loadSalarySlipData(targetId, month),
    loadMySalaryMonths(targetId, workerType, new Date(), { ledgerMonths: "none" }),
  ]);

  const viewingOther = targetId !== me.id;
  const hint = viewingOther
    ? "Salary statement for this employee — slip, attendance calculation and incentives."
    : "Your salary statement — the slip, how the month was calculated, and your incentives.";

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 pt-6 pb-8 max-md:px-4 max-md:pt-5 max-md:pb-6">
        <PageCommandBar
          title={viewingOther ? `Salary Statement · ${targetName}` : "Salary Statement"}
          hint={hint}
          actions={
            access.scope !== "self" ? (
              <SalaryPersonPicker
                people={access.people}
                selectedId={targetId}
                selfId={me.id}
                scope={access.scope}
              />
            ) : undefined
          }
        />

        <SalaryStatement
          data={data}
          months={months.map((m) => ({ month: m.month, label: m.label }))}
          month={month}
          employeeId={targetId}
          initialView={viewParam}
          initialIncentive={invParam}
        />
      </main>
    </>
  );
}
