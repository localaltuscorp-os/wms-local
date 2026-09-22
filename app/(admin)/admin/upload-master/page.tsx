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
 * The bulk-import template files (Tasks, Goals, Accounts). Replace one and it
 * applies sitewide — every download route resolves "override if present, else
 * built-in" against the same `template_files` record (lib/templates/resolve.ts).
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

  return (
    <AdminSection
      title="Upload Master"
      subtitle="The bulk-import template files. Replace one and it applies everywhere that template is downloaded."
      icon={FileUp}
      stats={[
        { label: "Templates", value: rows.length },
        { label: "Replaced", value: replaced, tone: replaced ? "green" : undefined },
      ]}
    >
      <UploadMasterTable rows={rows} canEdit={canEdit} />
    </AdminSection>
  );
}
