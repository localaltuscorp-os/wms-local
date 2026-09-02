import { Building2 } from "lucide-react";
import { requireAdmin } from "@/lib/auth/current";
import { listDepartmentsWithCounts } from "@/lib/queries/departments";
import { AdminSection } from "@/components/admin/ui/section-shell";
import { DepartmentList } from "@/components/admin/department-list";
import { CreateDepartmentDialog } from "@/components/admin/create-department-dialog";

export const dynamic = "force-dynamic";

export default async function DepartmentsPage() {
  await requireAdmin();
  const rows = await listDepartmentsWithCounts();
  const activeCount = rows.filter((r) => r.isActive).length;
  const totalEmployees = rows.reduce((sum, r) => sum + r.employeeCount, 0);

  return (
    <AdminSection
      eyebrow="Admin · Departments"
      title="Departments"
      subtitle={`${rows.length} total · ${activeCount} active · ${totalEmployees} employees mapped`}
      icon={Building2}
      stats={[
        { label: "Total", value: rows.length },
        { label: "Active", value: activeCount, tone: "green" },
        { label: "Employees mapped", value: totalEmployees },
      ]}
      actions={<CreateDepartmentDialog />}
    >
      <DepartmentList departments={rows} />
    </AdminSection>
  );
}
