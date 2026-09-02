import { UserCog } from "lucide-react";
import { requireAdmin } from "@/lib/auth/current";
import { listOutstandingResponsiblesWithCounts } from "@/lib/queries/outstanding-rosters";
import { OutstandingRosterList } from "@/components/admin/outstanding-roster-list";
import { AdminSection } from "@/components/admin/ui/section-shell";
import { createResponsible, updateResponsible } from "./actions";

export const dynamic = "force-dynamic";

export default async function OutstandingResponsiblesPage() {
  await requireAdmin();
  const rows = await listOutstandingResponsiblesWithCounts();
  const activeCount = rows.filter((r) => r.isActive).length;
  const inactiveCount = rows.length - activeCount;

  return (
    <AdminSection
      eyebrow="Admin · Outstanding"
      title="Responsibles"
      subtitle="People responsible for outstanding contracts"
      icon={UserCog}
      stats={[
        { label: "Total", value: rows.length },
        { label: "Active", value: activeCount, tone: "green" },
        { label: "Inactive", value: inactiveCount, tone: "amber" },
      ]}
    >
      <OutstandingRosterList
        title="Responsibles"
        items={rows}
        createAction={createResponsible}
        updateAction={updateResponsible}
        usageLabel="contracts"
      />
    </AdminSection>
  );
}
