import { KeyRound } from "lucide-react";
import { listControlPanelUsers } from "@/lib/queries/control-panel";
import { allPermissionNodes } from "@/lib/permissions/catalog";
import { AdminSection } from "@/components/admin/ui/section-shell";
import { PermissionsClient } from "@/components/control-panel/permissions-client";

export const dynamic = "force-dynamic";

/**
 * CONTROL PANEL → PERMISSIONS — the existing `module_permissions` matrix
 * (show / view / edit), reached from inside Control Panel. It reuses the
 * master-admin write path (`setModulePermission`) unchanged; nothing new is
 * enforced here.
 */
export default async function ControlPanelPermissionsPage() {
  const users = await listControlPanelUsers();
  const nodes = allPermissionNodes()
    .filter((n) => n.depth <= 3)
    .map((n) => ({
      key: n.key,
      label: n.label,
      depth: n.depth,
      module: n.ancestors[0] ?? n.key,
    }));

  return (
    <AdminSection
      title="Control Panel · Permissions"
      subtitle="Per-employee module permissions (show / view / edit), from the existing permission matrix."
      icon={KeyRound}
    >
      <PermissionsClient
        users={users.map((u) => ({ id: u.id, name: u.name }))}
        nodes={nodes}
      />
    </AdminSection>
  );
}
