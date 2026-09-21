import { CalendarClock } from "lucide-react";
import { requireAdmin } from "@/lib/auth/current";
import { canEditModule, requireModuleView } from "@/lib/permissions/resolve";
import { AdminSection } from "@/components/admin/ui/section-shell";
import { listPaymentTerms } from "@/lib/queries/billing-documents";
import { PaymentTermRoster } from "@/components/admin/billing/lookup-rosters";
import type { RecordRow } from "@/components/admin/billing/record-table";

/**
 * ADMIN › PAYMENT TERMS.
 *
 * Choosing a term on a document also computes its due date, which is why the
 * days live here rather than in the form. "Custom" is deliberately not a row —
 * it is a free-text override stored on the document itself.
 */
export const dynamic = "force-dynamic";

export default async function BillingPaymentTermsPage() {
  await requireAdmin();
  await requireModuleView("admin.masters.billing-payment-terms");

  const [terms, canEdit] = await Promise.all([
    listPaymentTerms(true),
    canEditModule("admin.masters.billing-payment-terms"),
  ]);

  const rows: RecordRow[] = terms.map((t) => ({
    id: t.id,
    label: t.label,
    dueDays: t.dueDays === null ? null : String(t.dueDays),
    isDefault: t.isDefault,
    isActive: t.isActive,
    sortOrder: String(t.sortOrder),
  }));

  const active = rows.filter((r) => r.isActive).length;

  return (
    <AdminSection
      eyebrow="Admin · Masters"
      title="Payment terms"
      subtitle="The terms a document can be issued on, and the days each one adds to the due date."
      icon={CalendarClock}
      stats={[
        { label: "Total", value: rows.length },
        { label: "Active", value: active, tone: "green" },
      ]}
    >
      <PaymentTermRoster rows={rows} canEdit={canEdit} />
    </AdminSection>
  );
}
