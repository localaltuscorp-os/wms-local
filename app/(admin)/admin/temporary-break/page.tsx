import { PauseCircle } from "lucide-react";
import { requireAdmin } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { canEditModule, requireModuleView } from "@/lib/permissions/resolve";
import { AdminSection } from "@/components/admin/ui/section-shell";
import { TemporaryBreakPage } from "@/components/admin/temporary-break/temporary-break-page";
import { loadEmployeeMasterRows } from "@/lib/employees/master-query";
import { listActiveTemporaryBreaks } from "@/lib/employees/temporary-break";

export const dynamic = "force-dynamic";
const NODE = "admin.people.temporary-break";

export default async function TemporaryBreakAdminPage() {
  await requireAdmin();
  await requireModuleView(NODE);
  const [breaks, rows, canEdit] = await Promise.all([
    listActiveTemporaryBreaks(),
    loadEmployeeMasterRows(),
    canEditModule(NODE),
  ]);
  const eligibleEmployees = rows
    .filter((row) => row.isActive && row.employmentStatus === "active" && !row.onTemporaryBreak && !isSuperAdmin(row.loginEmail))
    .map((row) => ({ id: row.id, name: row.name, functionName: row.departmentName, designationName: row.designationName }));

  return (
    <AdminSection title="Temporary Break" subtitle="Employees intentionally outside the active workforce and reporting hierarchy." icon={PauseCircle}>
      <TemporaryBreakPage breaks={breaks} eligibleEmployees={eligibleEmployees} canEdit={canEdit} />
    </AdminSection>
  );
}
