import { Hash } from "lucide-react";
import { requireAdmin } from "@/lib/auth/current";
import { canEditModule, requireModuleView } from "@/lib/permissions/resolve";
import { AdminSection } from "@/components/admin/ui/section-shell";
import { listSacCodes } from "@/lib/queries/billing-documents";
import { SacCodeRoster } from "@/components/admin/billing/lookup-rosters";
import type { RecordRow } from "@/components/admin/billing/record-table";

/**
 * ADMIN › SAC CODES.
 *
 * The service-accounting codes a tax invoice can carry, each with the GST rate
 * it usually attracts. A document takes its SAC from the line's product, from
 * the entity's default, or from a code typed here — in that order.
 */
export const dynamic = "force-dynamic";

export default async function BillingSacCodesPage() {
  await requireAdmin();
  await requireModuleView("admin.masters.billing-sac-codes");

  const [codes, canEdit] = await Promise.all([
    listSacCodes(true),
    canEditModule("admin.masters.billing-sac-codes"),
  ]);

  const rows: RecordRow[] = codes.map((c) => ({
    id: c.id,
    code: c.code,
    description: c.description,
    defaultGstRate: c.defaultGstRate === null ? null : String(Number(c.defaultGstRate)),
    isActive: c.isActive,
    sortOrder: String(c.sortOrder),
  }));

  return (
    <AdminSection
      eyebrow="Admin · Masters"
      title="SAC codes"
      subtitle="Service accounting codes and the GST rate each one usually carries."
      icon={Hash}
      stats={[
        { label: "Total", value: rows.length },
        { label: "Active", value: rows.filter((r) => r.isActive).length, tone: "green" },
      ]}
    >
      <SacCodeRoster rows={rows} canEdit={canEdit} />
    </AdminSection>
  );
}
