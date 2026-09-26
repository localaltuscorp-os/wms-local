import { listControlPanelUsers } from "@/lib/queries/control-panel";
import { allPermissionNodes } from "@/lib/permissions/catalog";
import { PageCommandBar } from "@/components/layout/page-command-bar";
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
    <main className="w-full px-8 pt-6 pb-8 max-md:px-4 max-md:pt-5 max-md:pb-6">
      <PageCommandBar title="Permissions" hint="Employee Show, View and Edit access." />
      <PermissionsClient
        users={users.map((u) => ({ id: u.id, name: u.name }))}
        nodes={nodes}
      />
    </main>
  );
}
