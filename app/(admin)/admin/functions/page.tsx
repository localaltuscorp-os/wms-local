import { Building2 } from "lucide-react";
import { requireAdmin } from "@/lib/auth/current";
import { listDepartmentsWithCounts } from "@/lib/queries/departments";
import { AdminSection } from "@/components/admin/ui/section-shell";
import { DepartmentList } from "@/components/admin/department-list";
import { CreateDepartmentDialog } from "@/components/admin/create-department-dialog";

export const dynamic = "force-dynamic";

/**
 * ADMIN PANEL → PEOPLE → FUNCTIONS.
 *
 * The same screen, the same rows and the same ids that lived at
 * /admin/departments until migration 0234 — only the word changed. The old URL
 * redirects here, so existing bookmarks keep working.
 *
 * The query helper and the list component still carry `Department` in their
 * names. That was the deliberate boundary of this rename: the words people read
 * change, and the ~1,289 code identifiers do not, because renaming those would
 * have touched ~180 files for no behavioural gain and the real risk was missing
 * one. `listDepartmentsWithCounts()` reads the `functions` table.
 */
export default async function FunctionsPage() {
  await requireAdmin();
  const rows = await listDepartmentsWithCounts();
  const activeCount = rows.filter((r) => r.isActive).length;
  const totalEmployees = rows.reduce((sum, r) => sum + r.employeeCount, 0);

  return (
    <AdminSection
      title="Functions"
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
