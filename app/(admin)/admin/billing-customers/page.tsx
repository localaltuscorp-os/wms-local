import { Users } from "lucide-react";
import { requireAdmin } from "@/lib/auth/current";
import { canEditModule, requireModuleView } from "@/lib/permissions/resolve";
import { AdminSection } from "@/components/admin/ui/section-shell";
import { listBillingCustomers } from "@/lib/queries/billing-documents";
import { BillingCustomerRoster } from "@/components/admin/billing/customer-roster";
import type { RecordRow } from "@/components/admin/billing/record-table";

/**
 * ADMIN › BILLING CUSTOMERS — who gets billed.
 *
 * Seeded from the clients and outstanding-entity rosters by migration 0229 and
 * linked back to them, so one real customer stays one row across the modules
 * rather than becoming a fourth master with its own spelling of the name.
 */
export const dynamic = "force-dynamic";

export default async function BillingCustomersPage() {
  await requireAdmin();
  await requireModuleView("admin.masters.billing-customers");

  const [customers, canEdit] = await Promise.all([
    listBillingCustomers(true),
    canEditModule("admin.masters.billing-customers"),
  ]);

  const rows: RecordRow[] = customers.map((c) => ({
    id: c.id,
    name: c.name,
    legalName: c.legalName,
    contactName: c.contactName,
    email: c.email,
    whatsapp: c.whatsapp,
    phone: c.phone,
    pan: c.pan,
    gstin: c.gstin,
    addressLine1: c.addressLine1,
    addressLine2: c.addressLine2,
    city: c.city,
    stateCode: c.stateCode,
    pincode: c.pincode,
    country: c.country,
    notes: c.notes,
    isActive: c.isActive,
  }));

  const withEmail = rows.filter((r) => r.email).length;
  const withGstin = rows.filter((r) => r.gstin).length;

  return (
    <AdminSection
      eyebrow="Admin · Masters"
      title="Billing customers"
      subtitle="Email, WhatsApp, PAN, GSTIN and address for everyone you invoice. Filling these in is what makes the document form and the email composer fill themselves."
      icon={Users}
      stats={[
        { label: "Total", value: rows.length },
        { label: "With an email", value: withEmail, tone: withEmail === rows.length ? "green" : "amber" },
        { label: "GST registered", value: withGstin },
      ]}
    >
      <BillingCustomerRoster rows={rows} canEdit={canEdit} />
    </AdminSection>
  );
}
