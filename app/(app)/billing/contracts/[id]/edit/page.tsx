import { notFound, redirect } from "next/navigation";
import type { Route } from "next";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { PageShell } from "@/components/layout/page-shell";
import { DEFAULT_ENTITY_ID } from "@/lib/hr/entities";
import { listBillingEntities } from "@/lib/billing/entities";
import { listBillToCustomers } from "@/lib/queries/billing-documents";
import { getContract } from "@/lib/queries/billing-contracts";
import { todayISO } from "@/lib/billing/numbering";
import { ContractForm, type ContractFormInitial } from "@/components/billing/contract-form";

/** /billing/contracts/[id]/edit — the Create Contract form, opened on a saved contract. */
export const dynamic = "force-dynamic";

export default async function EditContractPage({ params }: { params: Promise<{ id: string }> }) {
  await requireWorkspace("billing");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const detail = await getContract(id);
  if (!detail) notFound();
  const { contract: c, schedule, pdcs, summary } = detail;
  if (c.status === "cancelled") redirect(`/billing/contracts/${id}` as Route);

  const customers = await listBillToCustomers();
  // A deactivated client still has to show as the selected option.
  const options = customers.map((x) => ({ id: x.id, name: x.name, clientCode: x.clientCode }));
  if (!options.some((o) => o.id === c.customerId)) {
    options.unshift({ id: c.customerId, name: c.customerName, clientCode: null });
  }

  const initial: ContractFormInitial = {
    id: c.id,
    entityId: c.entityId,
    customerId: c.customerId,
    totalValue: c.totalValue,
    startDate: c.startDate,
    endDate: c.endDate,
    billingDate: c.billingDate,
    paymentType: c.paymentType,
    billingFrequency: c.billingFrequency,
    retainerAmount: c.retainerAmount ?? "",
    stopWhenComplete: c.stopWhenComplete,
    notes: c.notes ?? "",
    items: schedule.map((r) => ({
      key: r.id,
      id: r.id,
      dueDate: r.dueDate ?? "",
      description: r.description ?? "",
      amount: r.amount.toFixed(2),
      status: r.status,
      live: r.live,
      docNo: r.document?.docNo ?? null,
    })),
    pdcs: pdcs.map((p) => ({
      key: p.id,
      chequeDate: p.chequeDate ?? "",
      chequeNo: p.chequeNo ?? "",
      bankName: p.bankName ?? "",
      amount: p.amount,
      drawerName: p.drawerName ?? "",
    })),
    attachment: c.attachmentName ? { name: c.attachmentName, url: detail.attachmentUrl } : null,
    billedAmount: summary.billedAmount,
    hasBills: schedule.some((r) => r.status === "billed" || r.document !== null),
  };

  return (
    <PageShell width="wide">
      <ContractForm
        entities={(await listBillingEntities()).map((e) => ({ id: e.id, label: e.displayName }))}
        customers={options}
        defaultEntityId={DEFAULT_ENTITY_ID}
        today={todayISO()}
        initial={initial}
      />
    </PageShell>
  );
}
