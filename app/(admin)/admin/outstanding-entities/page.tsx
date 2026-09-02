import { Building2 } from "lucide-react";
import { requireAdmin } from "@/lib/auth/current";
import { listOutstandingEntitiesWithCounts } from "@/lib/queries/outstanding-rosters";
import { OutstandingRosterList } from "@/components/admin/outstanding-roster-list";
import { AdminSection } from "@/components/admin/ui/section-shell";
import { createEntity, updateEntity } from "./actions";

export const dynamic = "force-dynamic";

export default async function OutstandingEntitiesPage() {
  await requireAdmin();
  const rows = await listOutstandingEntitiesWithCounts();
  const activeCount = rows.filter((r) => r.isActive).length;
  const inactiveCount = rows.length - activeCount;

  return (
    <AdminSection
      eyebrow="Admin · Outstanding"
      title="Entities"
      subtitle="Billing entities used on outstanding contracts"
      icon={Building2}
      stats={[
        { label: "Total", value: rows.length },
        { label: "Active", value: activeCount, tone: "green" },
        { label: "Inactive", value: inactiveCount, tone: "amber" },
      ]}
    >
      <OutstandingRosterList
        title="Entities"
        items={rows}
        createAction={createEntity}
        updateAction={updateEntity}
        usageLabel="contracts"
      />
    </AdminSection>
  );
}
