import { BadgeCheck } from "lucide-react";
import { requireAdmin } from "@/lib/auth/current";
import { listDesignationsWithCounts } from "@/lib/queries/outstanding-rosters";
import { AdminSection } from "@/components/admin/ui/section-shell";
import { OutstandingRosterList } from "@/components/admin/outstanding-roster-list";
import { createDesignation, updateDesignation } from "./actions";

export const dynamic = "force-dynamic";

export default async function DesignationsPage() {
  await requireAdmin();
  const rows = await listDesignationsWithCounts();
  const activeCount = rows.filter((r) => r.isActive).length;

  return (
    <AdminSection
      eyebrow="Admin · Salary"
      title="Designations"
      subtitle={`${rows.length} total · ${activeCount} active · Job titles assigned to employees`}
      icon={BadgeCheck}
      stats={[
        { label: "Total", value: rows.length },
        { label: "Active", value: activeCount, tone: "green" },
      ]}
    >
      <OutstandingRosterList
        title="Designations"
        items={rows}
        createAction={createDesignation}
        updateAction={updateDesignation}
        usageLabel="employees"
      />
    </AdminSection>
  );
}
