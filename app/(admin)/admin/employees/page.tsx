import { desc } from "drizzle-orm";
import { Download, Users } from "lucide-react";
import { db } from "@/lib/db";
import { employees, salaryProfiles } from "@/db/schema";
import { isCurrentStaff } from "@/lib/queries/employees";
import {
  listFormerEmployees,
  getFormerEmployeeDetails,
} from "@/lib/queries/offboarding";
import { PreviousEmployees } from "@/components/admin/previous-employees";
import type { SalaryProfileRates } from "@/components/admin/employee-list";
import { requireAdmin } from "@/lib/auth/current";
import {
  listActiveDepartments,
  getEmployeeDepartmentMap,
} from "@/lib/queries/departments";
import { AdminSection } from "@/components/admin/ui/section-shell";
import { EmployeeList } from "@/components/admin/employee-list";
import { LeaveRequestsCallout } from "@/components/attendance/leave/leave-requests-callout";
import {
  countPendingLeaveForReview,
  leaveReviewScopeFor,
} from "@/lib/queries/leave";
import { InviteEmployeeDialog } from "@/components/admin/invite-employee-dialog";
import type { EmployeeDepartmentMembership } from "@/components/admin/employee-editor";

export default async function EmployeesPage() {
  const me = await requireAdmin();
  // Leave lives in Attendance; the Employees page only ANNOUNCES that some is
  // waiting (spec §3). One count, no queue — see LeaveRequestsCallout.
  const leaveScope = await leaveReviewScopeFor(me);
  const [all, activeDepartments, departmentMap, profileRows, pendingLeave, former] =
    await Promise.all([
    db.select().from(employees).where(isCurrentStaff).orderBy(desc(employees.createdAt)),
    listActiveDepartments(),
    getEmployeeDepartmentMap(),
    db
      .select({
        employeeId: salaryProfiles.employeeId,
        monthlyPayAtTarget: salaryProfiles.monthlyPayAtTarget,
        weeklyTargetHours: salaryProfiles.weeklyTargetHours,
        monthlyFee: salaryProfiles.monthlyFee,
      })
      .from(salaryProfiles),
    countPendingLeaveForReview(leaveScope).catch(() => ({ requests: 0, employees: 0 })),
    getFormerEmployeeDetails(),
  ]);
  const salaryProfileByEmployee: Record<string, SalaryProfileRates> =
    Object.fromEntries(
      profileRows.map((p) => [
        p.employeeId,
        {
          monthlyPayAtTarget: p.monthlyPayAtTarget,
          weeklyTargetHours: p.weeklyTargetHours,
          monthlyFee: p.monthlyFee,
        },
      ]),
    );
  const departmentOptions = activeDepartments.map((d) => ({
    id: d.id,
    name: d.name,
  }));
  const managerOptions = all.map((e) => ({ value: e.id, label: e.name }));
  const membershipsByEmployee: Record<string, EmployeeDepartmentMembership[]> =
    Object.fromEntries(departmentMap);
  const activeCount = all.filter((e) => e.isActive).length;
  const invitedCount = all.filter((e) => e.isActive && !e.joinedAt).length;
  // Any admin may now grant or revoke another employee's admin access (Sir,
  // 2026-08), so the toggle shows for every admin. The server guards in
  // actions.ts are the real boundary — this is UX, not security — and they still
  // stop a non-super-admin from touching a super-admin's row.
  const canManageAdmins = me.isAdmin;

  return (
    <AdminSection
      eyebrow="Admin · Employees"
      title="The team"
      subtitle={`${all.length} total · ${activeCount} active · ${invitedCount} pending invite`}
      icon={Users}
      stats={[
        { label: "Total", value: all.length },
        { label: "Active", value: activeCount, tone: "green" },
        { label: "Pending invite", value: invitedCount, tone: "amber" },
      ]}
      actions={
        <>
          <a
            href="/admin/employees/export"
            download
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-soft hover:text-ink-strong transition-colors px-3.5 py-2 rounded-pill border border-hairline bg-surface-card wg-btn"
            style={{ boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)" }}
            title="Download current view as CSV"
            aria-label="Export CSV"
          >
            <Download size={14} strokeWidth={2.2} />
            Export CSV
          </a>
          <InviteEmployeeDialog
            departmentOptions={departmentOptions}
            canManageAdmins={canManageAdmins}
          />
        </>
      }
    >
      <LeaveRequestsCallout
        requests={pendingLeave.requests}
        employees={pendingLeave.employees}
      />
      <EmployeeList
        employees={all}
        membershipsByEmployee={membershipsByEmployee}
        salaryProfileByEmployee={salaryProfileByEmployee}
        currentEmployeeId={me.id}
        canManageAdmins={canManageAdmins}
        departmentOptions={departmentOptions}
        managerOptions={managerOptions}
      />

      {/*
        PREVIOUS EMPLOYEES (migration 0212). Everyone here kept their record;
        only their login and photo were destroyed. Rendered below the roster
        rather than on a separate route so the two states of the same person
        stay one page apart, not one navigation apart.
      */}
      <div className="mt-10">
        <h2 className="font-serif text-lg text-ink-strong mb-1">Previous employees</h2>
        <p className="text-[13px] text-ink-muted mb-3">
          {former.length === 0
            ? "Nobody has been offboarded yet."
            : `${former.length} former ${former.length === 1 ? "employee" : "employees"} · records retained, logins destroyed`}
        </p>
        <PreviousEmployees rows={former} />
      </div>
    </AdminSection>
  );
}
