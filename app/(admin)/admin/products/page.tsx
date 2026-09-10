import { Package } from "lucide-react";
import { requireAdmin } from "@/lib/auth/current";
import { canEditModule, requireModuleView } from "@/lib/permissions/resolve";
import { listProductsWithCounts } from "@/lib/queries/products";
import { ProductMasterList } from "@/components/admin/product-master-list";
import { AdminSection } from "@/components/admin/ui/section-shell";
import { createProduct, updateProduct } from "./actions";

/**
 * ADMIN › PRODUCT MASTER.
 *
 * The canonical product roster, with CODE and NAME as separate columns. Reads
 * `lib/queries/products`, which is the one module-neutral door onto the master —
 * so this screen, Billing, the Outstanding contract form and the `product`
 * form-field MCQ are all looking at the same rows.
 *
 * `/admin/outstanding-products` still exists and manages the same table through
 * the shared roster component. It is kept rather than redirected because it is
 * linked from the Outstanding nav group and bookmarked; it simply shows no code
 * column. Both write paths bust the same `products` cache tag.
 */
export const dynamic = "force-dynamic";

export default async function ProductMasterPage() {
  await requireAdmin();
  // The permission matrix, on top of the admin gate the layout already applied.
  await requireModuleView("admin.masters.products");

  const [rows, canEdit] = await Promise.all([
    listProductsWithCounts(),
    canEditModule("admin.masters.products"),
  ]);

  const activeCount = rows.filter((r) => r.isActive).length;
  const codedCount = rows.filter((r) => r.code).length;

  return (
    <AdminSection
      eyebrow="Admin · Masters"
      title="Products"
      subtitle="The company's one product roster. Every product picker in the application reads this list — Billing, Outstanding contracts and the product fields on intake forms."
      icon={Package}
      stats={[
        { label: "Total", value: rows.length },
        { label: "Active", value: activeCount, tone: "green" },
        { label: "Inactive", value: rows.length - activeCount, tone: "amber" },
        { label: "With a code", value: codedCount },
      ]}
    >
      <ProductMasterList
        items={rows}
        createAction={createProduct}
        updateAction={updateProduct}
        canEdit={canEdit}
      />
    </AdminSection>
  );
}
