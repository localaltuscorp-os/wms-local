import { Wallet } from "lucide-react";
import { requireAdmin } from "@/lib/auth/current";
import { listOutstandingPaymentModesWithCounts } from "@/lib/queries/outstanding-rosters";
import { OutstandingRosterList } from "@/components/admin/outstanding-roster-list";
import { AdminSection } from "@/components/admin/ui/section-shell";
import { createPaymentMode, updatePaymentMode } from "./actions";

export const dynamic = "force-dynamic";

export default async function OutstandingPaymentModesPage() {
  await requireAdmin();
  const rows = await listOutstandingPaymentModesWithCounts();
  const activeCount = rows.filter((r) => r.isActive).length;
  const inactiveCount = rows.length - activeCount;

  return (
    <AdminSection
      eyebrow="Admin · Outstanding"
      title="Payment Modes"
      subtitle="Expected payment modes on outstanding contracts"
      icon={Wallet}
      stats={[
        { label: "Total", value: rows.length },
        { label: "Active", value: activeCount, tone: "green" },
        { label: "Inactive", value: inactiveCount, tone: "amber" },
      ]}
    >
      <OutstandingRosterList
        title="Payment Modes"
        items={rows}
        createAction={createPaymentMode}
        updateAction={updatePaymentMode}
        usageLabel="contracts"
      />
    </AdminSection>
  );
}
