import { Package } from "lucide-react";
import { requireAdmin } from "@/lib/auth/current";
import { listOutstandingProductsWithCounts } from "@/lib/queries/outstanding-rosters";
import { OutstandingRosterList } from "@/components/admin/outstanding-roster-list";
import { AdminSection } from "@/components/admin/ui/section-shell";
import { createProduct, updateProduct } from "./actions";

export const dynamic = "force-dynamic";

export default async function OutstandingProductsPage() {
  await requireAdmin();
  const rows = await listOutstandingProductsWithCounts();
  const activeCount = rows.filter((r) => r.isActive).length;
  const inactiveCount = rows.length - activeCount;

  return (
    <AdminSection
      eyebrow="Admin · Outstanding"
      title="Products"
      subtitle="Products offered on outstanding contracts"
      icon={Package}
      stats={[
        { label: "Total", value: rows.length },
        { label: "Active", value: activeCount, tone: "green" },
        { label: "Inactive", value: inactiveCount, tone: "amber" },
      ]}
    >
      <OutstandingRosterList
        title="Products"
        items={rows}
        createAction={createProduct}
        updateAction={updateProduct}
        usageLabel="contracts"
      />
    </AdminSection>
  );
}
