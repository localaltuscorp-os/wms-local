import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees } from "@/db/schema";
import { DashboardHeader } from "@/components/layout/header";
import { PageCommandBar } from "@/components/layout/page-command-bar";
import { getCurrentEmployee, guardNotCandidate } from "@/lib/auth/current";
import { loadMySalaryMonths } from "@/lib/salary/my-salary";
import { loadSalaryViewAccess, canViewSalaryOf } from "@/lib/salary/salary-people";
import { MySalaryView } from "@/components/salary/my-salary-view";
import { SalaryPersonPicker } from "@/components/salary/salary-person-picker";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * My Salary — self-service pay. Any signed-in employee sees their OWN pay; on top
 * of that, an admin can open ANYONE's and a manager can open anyone in their
 * team's (`?emp=<id>`), both re-checked server-side through `canViewSalaryOf` so
 * the query string can never widen access. The figures come from the SAME
 * `loadMySalaryMonths` engine for everyone — there is no second calculation path.
 * The full admin Salary module still lives in the Accounts room.
 */
export default async function MySalaryPage({ searchParams }: PageProps) {
  const me = await getCurrentEmployee();
  if (!me) redirect("/login");
  guardNotCandidate(me);

  const sp = await searchParams;
  const empParam = typeof sp.emp === "string" ? sp.emp : null;

  // Who this viewer may open (drives the picker), and whether the requested
  // `?emp=` is one of them. Anything not allowed silently falls back to self.
  const access = await loadSalaryViewAccess(me);
  let targetId = me.id;
  if (empParam && empParam !== me.id && (await canViewSalaryOf(me, empParam))) {
    targetId = empParam;
  }

  // For someone else's record we need THEIR worker type (the pay engine keys off
  // it) and name; for our own the session already has both.
  let targetWorkerType = me.workerType;
  let targetName = me.name;
  if (targetId !== me.id) {
    const t = await db.query.employees.findFirst({
      where: eq(employees.id, targetId),
      columns: { workerType: true, name: true },
    });
    if (!t) {
      targetId = me.id;
    } else {
      targetWorkerType = t.workerType;
      targetName = t.name;
    }
  }

  // The open month is computed live from the payroll engine; closed months come
  // from their stored run; anything older falls back to the legacy breakup rows.
  // See lib/salary/my-salary.ts for why the page no longer reads one table.
  // `ledgerMonths: "first"` attaches the Daily Salary Report to the month the
  // page opens on, and only that one. The rest arrive through
  // `fetchMonthLedger` when the employee picks them — a month of day rows is
  // ~30KB serialised, and inlining a whole history would be most of a
  // megabyte for months nobody has asked to see.
  const months = await loadMySalaryMonths(targetId, targetWorkerType, new Date(), {
    ledgerMonths: "first",
  });

  const viewingOther = targetId !== me.id;
  const hint = viewingOther
    ? access.scope === "all"
      ? "Viewing this employee's pay, deductions and attendance."
      : "Viewing your team member's pay, deductions and attendance."
    : access.scope === "self"
      ? "Your monthly pay, deductions and attendance — visible only to you."
      : "Your monthly pay, deductions and attendance. Switch person to view others.";

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 pt-6 pb-8 max-md:px-4 max-md:pt-5 max-md:pb-6">
        <PageCommandBar
          title={viewingOther ? `Salary · ${targetName}` : "My Salary"}
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

        <MySalaryView months={months} employeeId={targetId} />
      </main>
    </>
  );
}
