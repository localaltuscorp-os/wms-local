import { FileUp } from "lucide-react";
import { requireAdmin } from "@/lib/auth/current";
import { canEditModule, requireModuleView } from "@/lib/permissions/resolve";
import { AdminSection } from "@/components/admin/ui/section-shell";
import { listTemplateFiles } from "@/lib/queries/template-files";
import { UploadMasterTable } from "@/components/admin/upload-master/master-table";

export const dynamic = "force-dynamic";

/**
 * ADMIN PANEL → MASTERS → UPLOAD MASTER.
 *
 * The bulk-import template files — EVERY one the application serves, because
 * the list is lib/templates/registry.ts and each module's "Download Template"
 * button resolves through the same registry. Replace one and it applies
 * sitewide, to every caller of that feature.
 *
 * Authorization matches every other admin master: `requireAdmin()` first, then
 * the permission matrix. `canEdit` is resolved here and passed down, so the
 * table renders from a server decision; the actions re-check it.
 */
export default async function UploadMasterPage() {
  await requireAdmin();
  await requireModuleView("admin.masters.upload-master");

  const [rows, canEdit] = await Promise.all([
    listTemplateFiles(),
    canEditModule("admin.masters.upload-master"),
  ]);

  const replaced = rows.filter((r) => r.overridden).length;
  const modules = new Set(rows.map((r) => r.module)).size;

  return (
    <AdminSection
      title="Upload Master"
      subtitle="Every bulk-import template in the system. Replace one and it is what that module's Download Template button serves, immediately."
      icon={FileUp}
      stats={[
        { label: "Templates", value: rows.length },
        { label: "Modules", value: modules },
        { label: "Replaced", value: replaced, tone: replaced ? "green" : undefined },
      ]}
    >
      <UploadMasterTable rows={rows} canEdit={canEdit} />
    </AdminSection>
  );
}
