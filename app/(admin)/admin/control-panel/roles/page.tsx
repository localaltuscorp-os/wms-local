import { UserCog } from "lucide-react";
import { requireAdmin } from "@/lib/auth/current";
import { listRoles, listControlPanelUsers, listRolePermissions } from "@/lib/queries/control-panel";
import { allPermissionNodes } from "@/lib/permissions/catalog";
import { PERMISSION_ACTIONS, PERMISSION_ACTION_LABELS, DATA_SCOPES, DATA_SCOPE_LABELS } from "@/lib/permissions/vocabulary";
import { AdminSection } from "@/components/admin/ui/section-shell";
import { RolesClient } from "@/components/admin/control-panel/roles-client";

export const dynamic = "force-dynamic";

/** Build a flat, human-labelled node list for the permission pickers. */
function nodeOptions() {
  const byKey = new Map(allPermissionNodes().map((n) => [n.key, n]));
  return allPermissionNodes()
    .filter((n) => n.depth <= 3)
    .map((n) => {
      const label = [...n.ancestors, n.key]
        .map((k) => byKey.get(k)?.label ?? k)
        .join(" → ");
      return { key: n.key, label };
    });
}

export default async function ControlPanelRolesPage() {
  await requireAdmin();
  const [roles, users] = await Promise.all([listRoles(), listControlPanelUsers()]);
  const permissionsByRole: Record<string, Awaited<ReturnType<typeof listRolePermissions>>> = {};
  await Promise.all(
    roles.map(async (r) => {
      permissionsByRole[r.id] = await listRolePermissions(r.id);
    }),
  );
  const nodes = nodeOptions();
  const actions = PERMISSION_ACTIONS.map((a) => ({ id: a, label: PERMISSION_ACTION_LABELS[a] }));
  const scopes = DATA_SCOPES.map((s) => ({ id: s, label: DATA_SCOPE_LABELS[s] }));

  return (
    <AdminSection
      title="Control Panel · Roles"
      subtitle="Reusable permission templates. A user holds several roles; their effective access combines them."
      icon={UserCog}
      stats={[
        { label: "Roles", value: roles.length },
        { label: "System roles", value: roles.filter((r) => r.isSystem).length },
      ]}
    >
      <RolesClient
        roles={roles}
        users={users.map((u) => ({ id: u.id, name: u.name, roleNames: u.roleNames }))}
        permissionsByRole={permissionsByRole}
        nodes={nodes}
        actions={actions}
        scopes={scopes}
      />
    </AdminSection>
  );
}
