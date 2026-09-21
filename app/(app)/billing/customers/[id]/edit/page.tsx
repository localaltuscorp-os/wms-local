import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { PageShell } from "@/components/layout/page-shell";
import { allLookupOptions } from "@/lib/queries/billing-lookups";
import { assignableEmployees, getCustomerDetail } from "@/lib/queries/billing-customers";
import { CustomerKycForm } from "@/components/billing/customer-kyc-form";
import { listBillableProducts } from "@/lib/queries/billing-documents";
import { productFullName } from "@/lib/billing/product-names";

/**
 * /billing/customers/[id]/edit — the KYC form, opened on a saved client.
 * Same form as onboarding, so a field added there is editable here too.
 */
export const dynamic = "force-dynamic";

export default async function EditCustomerKycPage({ params }: { params: Promise<{ id: string }> }) {
  await requireWorkspace("billing");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  // One after another — parallel bursts have stalled on the pooler.
  const customer = await getCustomerDetail(id);
  const options = await allLookupOptions();
  const employees = await assignableEmployees();
  const productTypes = (await listBillableProducts()).map((p) => productFullName(p));
  if (!customer) notFound();

  return (
    <PageShell width="wide">
      <CustomerKycForm
        options={options}
        employees={employees}
        nextCode={customer.clientCode ?? "—"}
        initial={customer}
        productTypeOptions={productTypes}
      />
    </PageShell>
  );
}
