import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/current";
import { canManageTaskRosters } from "@/lib/security/capabilities";
import { listClientsWithCounts } from "@/lib/queries/clients";
import { ClientList } from "@/components/admin/client-list";
import { CreateClientDialog } from "@/components/admin/create-client-dialog";
import { RosterLockedNote } from "@/components/admin/roster-locked-note";
import { AdminSection } from "@/components/admin/ui/section-shell";
import { Building2 } from "lucide-react";

export const dynamic = "force-dynamic";

/**
 * Clients — every admin can SEE the list; only Manan Sir, Jeevan and Rohan
 * (`task_rosters.manage`) can change it (2026-09-15). The actions re-check.
 */
export default async function ClientsPage() {
  const me = await requireUser();
  const canEdit = canManageTaskRosters(me.email);
  if (!me.isAdmin && !canEdit) redirect("/hub");

  const rows = await listClientsWithCounts();
  const activeCount = rows.filter((r) => r.isActive).length;
  const inactiveCount = rows.length - activeCount;
  const totalTasks = rows.reduce((sum, r) => sum + r.taskCount, 0);

  return (
    <AdminSection
      eyebrow="Admin · Clients"
      title="Clients"
      subtitle={`${rows.length} total · ${activeCount} active · ${totalTasks} tasks mapped`}
      icon={Building2}
      stats={[
        { label: "Total", value: rows.length },
        { label: "Active", value: activeCount, tone: "green" },
        { label: "Inactive", value: inactiveCount },
        { label: "Tasks mapped", value: totalTasks, tone: "red" },
      ]}
      actions={canEdit ? <CreateClientDialog /> : <RosterLockedNote noun="clients" />}
    >
      <ClientList clients={rows} canEdit={canEdit} />
    </AdminSection>
  );
}
