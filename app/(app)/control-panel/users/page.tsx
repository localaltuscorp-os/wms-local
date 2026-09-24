import { Users as UsersIcon } from "lucide-react";
import { listControlPanelUsers } from "@/lib/queries/control-panel";
import { AdminSection } from "@/components/admin/ui/section-shell";
import { ControlPanelUsersTable } from "@/components/control-panel/users-table";

export const dynamic = "force-dynamic";

export default async function ControlPanelUsersPage() {
  const users = await listControlPanelUsers();
  return (
    <AdminSection
      title="Control Panel · Users"
      subtitle="Manage employee roles and review effective access."
      icon={UsersIcon}
      stats={[
        { label: "Active", value: users.filter((u) => u.isActive).length },
        { label: "Inactive", value: users.filter((u) => !u.isActive).length },
      ]}
    >
      <ControlPanelUsersTable users={users} />
    </AdminSection>
  );
}
