import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { employeeDepartmentNames } from "@/lib/queries/departments";
import { matchesDepartment, ACCOUNTS_DEPARTMENT } from "@/lib/workspaces";
import type { Employee } from "@/db/schema";

/**
 * Finance-viewer access — the Salary module and the Attendance report are open
 * to admins/super-admins AND to the "Accounts" department (assigned in the Admin
 * panel), so the accounts team can read pay + attendance to do their job.
 * Write actions inside those pages (mark paid, edit notes) stay super-admin-only
 * via their own `isSuperAdmin` gate.
 */
export async function isFinanceViewer(me: Employee): Promise<boolean> {
  if (me.isAdmin || isSuperAdmin(me.email)) return true;
  const structured = await employeeDepartmentNames(me.id).catch(() => [] as string[]);
  const departments = me.department ? [...structured, me.department] : structured;
  return matchesDepartment(departments, ACCOUNTS_DEPARTMENT);
}

/** Page guard: returns the signed-in employee, or redirects to /hub. */
export async function requireFinanceAccess(): Promise<Employee> {
  const me = await requireUser();
  if (await isFinanceViewer(me)) return me;
  redirect("/hub");
}

/**
 * Who may WRITE the salary "Paid" mark — SUPER-ADMINS + the ACCOUNTS department
 * (per Sir 2026-08-13, since disbursing + reconciling pay is an accounts job).
 * Regular admins are DELIBERATELY excluded (marking pay as disbursed is a
 * financial control, not general admin). Note: an Accounts member may NOT be an
 * `isAdmin` employee, so the caller must gate on THIS, not `requireAdmin`.
 * The other salary write actions (wave-off, payout adjustment, notes) stay
 * super-admin-only.
 */
export async function canMarkSalaryPaid(me: Employee): Promise<boolean> {
  if (isSuperAdmin(me.email)) return true;
  const structured = await employeeDepartmentNames(me.id).catch(() => [] as string[]);
  const departments = me.department ? [...structured, me.department] : structured;
  return matchesDepartment(departments, ACCOUNTS_DEPARTMENT);
}
