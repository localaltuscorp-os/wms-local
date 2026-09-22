import { ReceiptIndianRupee } from "lucide-react";
import { requireAdmin } from "@/lib/auth/current";
import { requireModuleView } from "@/lib/permissions/resolve";
import { AdminSection } from "@/components/admin/ui/section-shell";
import {
  billingEntityAccess,
  listBillingEntities,
} from "@/lib/queries/billing-entities";
import { mayDeleteBillingEntity } from "@/lib/billing/delete-guard";
import { BillingMasterTable } from "@/components/admin/billing-master/master-table";

export const dynamic = "force-dynamic";

/**
 * ADMIN PANEL → MASTERS → BILLING MASTER.
 *
 * The central store for the entity information Billing bills from: the legal
 * name and proprietor, the contact block, the tax identifiers and SAC codes,
 * the bank account, and the logo / signature / documents that go on an invoice.
 *
 * ── IT IS THE SAME FIVE LEGAL ENTITIES, NOT A NEW LIST ─────────────────────
 * These rows ARE `paying_entities` — the table the salary module and the
 * employee-code allocator have always used, extended by migration 0226 with the
 * billing columns it never had. There is no second entity master: a
 * `billing_entities` table would mean two answers to "what is Unleashed's GST
 * number", and eventually two different ones.
 *
 * ── AUTHORIZATION ──────────────────────────────────────────────────────────
 * `requireAdmin()` (again — the layout's gate does not protect an action), then
 * the permission matrix. `billingEntityAccess()` resolves the four capabilities
 * the brief names and they are passed down as props, so the table and workspace
 * render from a server decision rather than making one.
 *
 * Everything they gate is ALSO gated in the actions. What is passed here only
 * decides what appears; nothing here is load-bearing on its own.
 */
export default async function BillingMasterPage() {
  await requireAdmin();
  // The permission matrix, on top of the admin gate the layout already applied.
  await requireModuleView("admin.masters.billing");

  const [rows, access, canDelete] = await Promise.all([
    listBillingEntities(),
    billingEntityAccess(),
    mayDeleteBillingEntity(),
  ]);

  const active = rows.filter((r) => r.isActive).length;
  /**
   * How many entities are not yet invoice-ready.
   *
   * A GST number and a bank account are what an entity needs before it can
   * legitimately raise a tax invoice, so this counts the ones that would print
   * an incomplete document. Shown as a stat because it is the one thing about
   * this master somebody would want to fix, and it is invisible in a list of
   * names.
   */
  const incomplete = rows.filter((r) => r.isActive && (!r.gstNo || !r.panNo)).length;

  return (
    <AdminSection
      title="Billing Master"
      subtitle="Entity details Billing bills from — proprietor, contact, GST, PAN, SAC codes, banking, logo and signature."
      icon={ReceiptIndianRupee}
      stats={[
        { label: "Entities", value: rows.length },
        { label: "Active", value: active, tone: "green" },
        {
          label: "Missing GST/PAN",
          value: incomplete,
          tone: incomplete ? "amber" : undefined,
        },
      ]}
    >
      <BillingMasterTable rows={rows} access={access} canDelete={canDelete} />
    </AdminSection>
  );
}
