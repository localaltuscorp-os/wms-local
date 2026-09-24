import { Users } from "lucide-react";
import { requireAdmin } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { AdminSection } from "@/components/admin/ui/section-shell";
import {
  loadEmployeeMasterRows,
  loadMasterOptions,
} from "@/lib/employees/master-query";
import { EmployeeMasterTable } from "@/components/admin/employee-master/master-table";
import { SalaryProfileImportDialog } from "@/components/admin/salary-profile-import-dialog";

export const dynamic = "force-dynamic";

/**
 * PEOPLE → EMPLOYEE MASTER.
 *
 * The consolidated employee record: one table, one workspace, and every field
 * read from the place that already owns it. See `lib/employees/master-query.ts`
 * for the full map of which source answers which field — nothing here is a
 * second copy of anything.
 *
 * ── WHAT IT DOES NOT REPLACE ───────────────────────────────────────────────
 * The existing People → Employees screen stays exactly where it is, and so does
 * every HR surface. This is an additional door onto the same records, not a
 * migration: the brief is explicit that HR Records continue to live in the HR
 * module, and the workspace LINKS there rather than reimplementing it (§14).
 *
 * ── SERVER COMPONENT, SERVER AUTHORIZATION ─────────────────────────────────
 * `requireAdmin()` gates the page, and every mutation the table can start goes
 * through the existing employee actions, each of which calls `requireAdmin()`
 * again for itself. Hiding a button is presentation; the action is the boundary
 * (§21). `canSeePay` below decides only whether the CTC column and the Payroll
 * section are RENDERED — the salary actions do their own check regardless.
 */
export default async function EmployeeMasterPage() {
  const me = await requireAdmin();

  const [rows, options] = await Promise.all([
    loadEmployeeMasterRows(),
    loadMasterOptions(),
  ]);

  // Pay visibility follows the existing rule on the Employees screen: salary is
  // a super-admin concern. Read here so the payload never carries CTC to a
  // browser that is not allowed to see it — hiding it in CSS would ship the
  // numbers anyway.
  const canSeePay = isSuperAdmin(me.email);
  const visible = canSeePay
    ? rows
    : rows.map((r) => ({
        ...r,
        annualCtc: null,
        monthlyCtc: null,
        tdsMonthly: null,
        ptExempt: null,
      }));

  const onProbation = rows.filter((r) => r.onProbation).length;
  const withoutCode = rows.filter((r) => !r.employeeCode).length;

  return (
    <AdminSection
      title="Employee Master"
      subtitle="Every employee record in one place — employment, payroll, contact, family and documents."
      icon={Users}
      stats={[
        { label: "Employees", value: rows.length },
        { label: "On probation", value: onProbation, tone: onProbation ? "amber" : undefined },
        {
          label: "No code",
          value: withoutCode,
          tone: withoutCode ? "amber" : undefined,
        },
      ]}
      actions={<SalaryProfileImportDialog />}
    >
      <EmployeeMasterTable
        rows={visible}
        options={options}
        canSeePay={canSeePay}
        canDelete={isSuperAdmin(me.email)}
        currentUserId={me.id}
      />
    </AdminSection>
  );
}
