import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { PageShell } from "@/components/layout/page-shell";
import { getCustomerDetail } from "@/lib/queries/billing-customers";
import { CustomerRecord } from "@/components/billing/customer-record";

/**
 * /billing/customers/[id] — FULL RECORD. Every KYC field, every contact and
 * address, and the attached files, on one page.
 */
export const dynamic = "force-dynamic";

export default async function CustomerRecordPage({ params }: { params: Promise<{ id: string }> }) {
  await requireWorkspace("billing");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const customer = await getCustomerDetail(id);
  if (!customer) notFound();

  return (
    <PageShell width="wide">
      <CustomerRecord customer={customer} />
    </PageShell>
  );
}
