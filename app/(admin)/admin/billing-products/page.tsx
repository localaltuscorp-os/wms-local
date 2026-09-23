import { Package } from "lucide-react";
import { asc } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/current";
import { canEditModule, requireModuleView } from "@/lib/permissions/resolve";
import { AdminSection } from "@/components/admin/ui/section-shell";
import { db } from "@/lib/db";
import { outstandingProducts } from "@/db/schema";
import { ProductBillingRoster } from "@/components/admin/billing/lookup-rosters";
import type { RecordRow } from "@/components/admin/billing/record-table";

/**
 * ADMIN › PRODUCT BILLING FIELDS.
 *
 * The SAME rows as Admin › Products — `outstanding_products` — showing only the
 * columns migration 0229 added for billing: SAC code, default rate, default GST
 * rate, description, and whether the product may be invoiced at all.
 *
 * A separate screen rather than five more columns on the product master,
 * because the product master is a short, scannable roster of names and codes
 * that three other modules rely on, and because these fields are billing's
 * business. It is NOT a second master: same table, same rows, same cache tag —
 * names and codes are still edited on Admin › Products, and nothing is created
 * here.
 */
export const dynamic = "force-dynamic";

export default async function BillingProductsPage() {
  await requireAdmin();
  await requireModuleView("admin.masters.products");

  const [products, canEdit] = await Promise.all([
    db
      .select()
      .from(outstandingProducts)
      .orderBy(asc(outstandingProducts.sortOrder), asc(outstandingProducts.name)),
    canEditModule("admin.masters.products"),
  ]);

  const rows: RecordRow[] = products.map((p) => ({
    id: p.id,
    name: p.name,
    code: p.code,
    sacCode: p.sacCode,
    defaultRate: p.defaultRate === null ? null : String(Number(p.defaultRate)),
    defaultGstRate: p.defaultGstRate === null ? null : String(Number(p.defaultGstRate)),
    description: p.description,
    isBillable: p.isBillable,
  }));

  const priced = rows.filter((r) => r.defaultRate).length;
  const withSac = rows.filter((r) => r.sacCode).length;

  return (
    <AdminSection
      eyebrow="Admin · Masters"
      title="Product billing fields"
      subtitle="SAC code, default rate and GST rate per product — what a billing line fills itself with the moment that product is picked. Names and codes live on Admin › Products."
      icon={Package}
      stats={[
        { label: "Products", value: rows.length },
        { label: "With a rate", value: priced, tone: priced ? "green" : "amber" },
        { label: "With a SAC", value: withSac },
        { label: "Billable", value: rows.filter((r) => r.isBillable).length },
      ]}
    >
      <ProductBillingRoster rows={rows} canEdit={canEdit} />
    </AdminSection>
  );
}
