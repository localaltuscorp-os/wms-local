import { requireAdmin } from "@/lib/auth/current";
import { listDepartmentsWithCounts } from "@/lib/queries/departments";
import { DepartmentList } from "@/components/admin/department-list";
import { CreateDepartmentDialog } from "@/components/admin/create-department-dialog";

export const dynamic = "force-dynamic";

export default async function DepartmentsPage() {
  await requireAdmin();
  const rows = await listDepartmentsWithCounts();
  const activeCount = rows.filter((r) => r.isActive).length;
  const totalEmployees = rows.reduce((sum, r) => sum + r.employeeCount, 0);

  return (
    <div>
      <header className="mb-8 flex items-start justify-between gap-6 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-ink-subtle font-bold">
            Admin · Departments
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
            Departments
          </h1>
          <p className="text-body-lg text-ink-subtle mt-2 max-w-2xl tabular-nums">
            {rows.length} total · {activeCount} active · {totalEmployees} employees mapped
          </p>
        </div>
        <div className="mt-1">
          <CreateDepartmentDialog />
        </div>
      </header>
      <DepartmentList departments={rows} />
    </div>
  );
}
