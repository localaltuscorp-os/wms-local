import { requireAdmin } from "@/lib/auth/current";
import { listPayingEntitiesWithCounts } from "@/lib/queries/outstanding-rosters";
import { OutstandingRosterList } from "@/components/admin/outstanding-roster-list";
import { createPayingEntity, updatePayingEntity } from "./actions";
import { AdminSection } from "@/components/admin/ui/section-shell";
import { Landmark } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function PayingEntitiesPage() {
  await requireAdmin();
  const rows = await listPayingEntitiesWithCounts();
  const activeCount = rows.filter((r) => r.isActive).length;
  const inactiveCount = rows.length - activeCount;
  const totalEmployees = rows.reduce((sum, r) => sum + r.usageCount, 0);

  return (
    <AdminSection
      eyebrow="Admin · Salary"
      title="Paying Entities"
      subtitle={`${rows.length} total · ${activeCount} active · Legal entities that pay employee salaries`}
      icon={Landmark}
      stats={[
        { label: "Total", value: rows.length },
        { label: "Active", value: activeCount, tone: "green" },
        { label: "Inactive", value: inactiveCount },
        { label: "Employees", value: totalEmployees, tone: "red" },
      ]}
    >
      <OutstandingRosterList
        title="Paying Entities"
        items={rows}
        createAction={createPayingEntity}
        updateAction={updatePayingEntity}
        usageLabel="employees"
      />
    </AdminSection>
  );
}
