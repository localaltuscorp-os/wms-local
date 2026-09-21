import { requireWorkspace } from "@/lib/auth/workspace-access";
import { PageShell } from "@/components/layout/page-shell";
import { allLookupOptions } from "@/lib/queries/billing-lookups";
import { assignableEmployees, nextClientCode } from "@/lib/queries/billing-customers";
import { CustomerKycForm } from "@/components/billing/customer-kyc-form";
import { listBillableProducts } from "@/lib/queries/billing-documents";
import { productFullName } from "@/lib/billing/product-names";

/**
 * /billing/customers/new — CREATE NEW CUSTOMER KYC.
 *
 * Every dropdown on the form is filled from `billing_lookups`, which falls
 * back to the registry defaults in `lib/billing/lookups.ts`. There is no
 * dropdown editor in the Billing room any more: this form and the Customer
 * Master hold the customer's own data, and everything the ISSUING company
 * brings to an invoice comes from Admin › Billing Profiles.
 */
export const dynamic = "force-dynamic";

export default async function NewCustomerKycPage() {
  await requireWorkspace("billing");
  // One after another — parallel bursts have stalled on the pooler.
  const options = await allLookupOptions();
  const employees = await assignableEmployees();
  const code = await nextClientCode();
  // Product Type is picked from the Admin Panel's product master.
  const productTypes = (await listBillableProducts()).map((p) => productFullName(p));

  return (
    <PageShell width="wide">
      <CustomerKycForm options={options} employees={employees} nextCode={code} productTypeOptions={productTypes} />
    </PageShell>
  );
}
