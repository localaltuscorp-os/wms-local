import { desc } from "drizzle-orm";
import { Download } from "lucide-react";
import { db } from "@/lib/db";
import { employees } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import {
  listActiveDepartments,
  getEmployeeDepartmentMap,
} from "@/lib/queries/departments";
import { EmployeeList } from "@/components/admin/employee-list";
import { InviteEmployeeDialog } from "@/components/admin/invite-employee-dialog";
import type { EmployeeDepartmentMembership } from "@/components/admin/edit-employee-dialog";

export default async function EmployeesPage() {
  const me = await requireAdmin();
  const [all, activeDepartments, departmentMap] = await Promise.all([
    db.select().from(employees).orderBy(desc(employees.createdAt)),
    listActiveDepartments(),
    getEmployeeDepartmentMap(),
  ]);
  const departmentOptions = activeDepartments.map((d) => ({
    id: d.id,
    name: d.name,
  }));
  const managerOptions = all.map((e) => ({ value: e.id, label: e.name }));
  const membershipsByEmployee: Record<string, EmployeeDepartmentMembership[]> =
    Object.fromEntries(departmentMap);
  const activeCount = all.filter((e) => e.isActive).length;
  const invitedCount = all.filter((e) => e.isActive && !e.joinedAt).length;
  // Only super-admins may change an employee's admin status; non-super-admins
  // get the admin toggle hidden in the create + edit dialogs. The server
  // guards in actions.ts are the real boundary — this is UX, not security.
  const canManageAdmins = isSuperAdmin(me.email);

  return (
    <div>
      <header className="mb-8 flex items-start justify-between gap-6 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-ink-subtle font-bold">
            Admin · Employees
          </div>
          <h1
            className="mt-1 text-ink-strong"
            style={{
              fontFamily: "var(--font-serif)",
              fontStyle: "italic",
              fontWeight: 500,
              fontSize: 44,
              lineHeight: 1.05,
              letterSpacing: "-0.02em",
            }}
          >
            The team
          </h1>
          <p className="text-body-lg text-ink-subtle mt-2 max-w-2xl tabular-nums">
            {all.length} total · {activeCount} active · {invitedCount} pending invite
          </p>
        </div>
        <div className="flex items-center gap-2.5 mt-1">
          <a
            href="/admin/employees/export"
            download
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-soft hover:text-ink-strong transition-colors px-3.5 py-2 rounded-chip border border-hairline bg-surface-card"
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
        </div>
      </header>
      <EmployeeList
        employees={all}
        membershipsByEmployee={membershipsByEmployee}
        currentEmployeeId={me.id}
        canManageAdmins={canManageAdmins}
        departmentOptions={departmentOptions}
        managerOptions={managerOptions}
      />
    </div>
  );
}
