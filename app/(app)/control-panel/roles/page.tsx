import { listControlPanelUsers, listRolePermissions, listRoles } from "@/lib/queries/control-panel";
import { allPermissionNodes } from "@/lib/permissions/catalog";
import { PageCommandBar } from "@/components/layout/page-command-bar";
import { RolesClient } from "@/components/control-panel/roles-client";

export const dynamic = "force-dynamic";

export default async function ControlPanelRolesPage() {
  const [roles, users] = await Promise.all([listRoles(), listControlPanelUsers()]);
  const permissionsByRole: Record<string, Awaited<ReturnType<typeof listRolePermissions>>> = {};

  await Promise.all(
    roles.map(async (role) => {
      permissionsByRole[role.id] = await listRolePermissions(role.id);
    }),
  );

  const modules = allPermissionNodes()
    .filter((node) => node.depth === 1)
    .map((node) => ({ key: node.key, label: node.label }));

  return (
    <main className="w-full px-8 pt-6 pb-8 max-md:px-4 max-md:pt-5 max-md:pb-6">
      <PageCommandBar
        title="Roles"
        hint={`${roles.length} roles · assign employees and set basic module access.`}
      />
      <RolesClient
        roles={roles}
        employees={users.map((user) => ({
          id: user.id,
          name: user.name,
          email: user.email,
          employeeCode: user.employeeCode,
          roleNames: user.roleNames,
        }))}
        permissionsByRole={permissionsByRole}
        modules={modules}
      />
    </main>
  );
}
