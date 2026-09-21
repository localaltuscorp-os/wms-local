import { requireWorkspace } from "@/lib/auth/workspace-access";
import { PageShell } from "@/components/layout/page-shell";
import { DEFAULT_ENTITY_ID } from "@/lib/hr/entities";
import { listBillingEntities } from "@/lib/billing/entities";
import { listBillToCustomers } from "@/lib/queries/billing-documents";
import { todayISO } from "@/lib/billing/numbering";
import { ContractForm } from "@/components/billing/contract-form";

/**
 * /billing/contracts/new — CREATE CONTRACT.
 *
 * Client Name offers the Customer Master (the Admin Panel's client list for
 * Billing) — the same live, KYC'd rows New Document's Bill To offers, so any
 * contract saved here can raise its bills.
 */
export const dynamic = "force-dynamic";

export default async function NewContractPage() {
  await requireWorkspace("billing");
  const customers = await listBillToCustomers();
  return (
    <PageShell width="wide">
      <ContractForm
        entities={(await listBillingEntities()).map((e) => ({ id: e.id, label: e.displayName }))}
        customers={customers.map((c) => ({ id: c.id, name: c.name, clientCode: c.clientCode }))}
        defaultEntityId={DEFAULT_ENTITY_ID}
        today={todayISO()}
      />
    </PageShell>
  );
}
