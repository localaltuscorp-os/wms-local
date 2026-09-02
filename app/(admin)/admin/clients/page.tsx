import { requireAdmin } from "@/lib/auth/current";
import { listClientsWithCounts } from "@/lib/queries/clients";
import { ClientList } from "@/components/admin/client-list";
import { CreateClientDialog } from "@/components/admin/create-client-dialog";
import { AdminSection } from "@/components/admin/ui/section-shell";
import { Building2 } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  await requireAdmin();
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
      actions={<CreateClientDialog />}
    >
      <ClientList clients={rows} />
    </AdminSection>
  );
}
