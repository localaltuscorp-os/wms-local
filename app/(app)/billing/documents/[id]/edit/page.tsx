import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { PageShell } from "@/components/layout/page-shell";
import { listBillingEntities } from "@/lib/billing/entities";
import { BILLING_DOC_TYPE_LABELS } from "@/db/enums";
import {
  getBillingDocument,
  getBillingFormData,
  listServiceDescriptions,
} from "@/lib/queries/billing-documents";
import { isEditable } from "@/lib/billing/documents";
import { toLineState, type DocumentFormState } from "@/lib/billing/form-state";
import { BillingDocumentForm } from "@/components/billing/document-form";

/**
 * /billing/documents/[id]/edit
 *
 * Refuses on the same rule the server enforces (`isEditable`), rather than
 * showing a form whose save will be rejected: a generated tax invoice is not
 * editable — it is cancelled and reissued.
 */
export const dynamic = "force-dynamic";

export default async function EditBillingDocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireWorkspace("billing");
  const { id } = await params;

  const found = await getBillingDocument(id);
  if (!found) notFound();
  const d = found.document;

  const entities = await listBillingEntities();
  const entityIds = entities.map((e) => e.id);
  // One after another — see getBillingFormData on why not in parallel.
  const { customers, products, terms, sacCodes, sellers } = await getBillingFormData(entityIds);
  const serviceDescriptions = await listServiceDescriptions();

  if (!isEditable(d)) {
    return (
      <PageShell width="wide">
        <BackLink id={id} />
        <div
          className="rounded-[22px] p-8 text-center"
          style={{ background: "rgba(255,255,255,0.78)", boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
        >
          <h1 className="text-[18px] font-black text-ink-strong">This document can no longer be edited</h1>
          <p className="mx-auto mt-2 max-w-[54ch] text-[13.5px] text-ink-muted">
            {d.docType === "tax_invoice"
              ? "A generated tax invoice is immutable — GST documents are corrected by cancelling and reissuing, never by quietly editing the original."
              : `A ${d.status} document is frozen. Its numbers, dates and lines stay exactly as they were issued.`}
          </p>
          <Link
            href={`/billing/documents/${id}` as Route}
            className="mt-4 inline-flex h-10 items-center rounded-chip px-4 text-[13px] font-bold text-white"
            style={{ background: "linear-gradient(135deg, #E10600, #A80400)" }}
          >
            View the document
          </Link>
        </div>
      </PageShell>
    );
  }

  const initial: DocumentFormState = {
    id: d.id,
    docType: d.docType,
    entityId: d.entityId,
    docDate: d.docDate,
    dueDate: d.dueDate ?? "",
    customerId: d.customerId,
    customerName: d.customerName,
    customerContactName: d.customerContactName ?? "",
    customerEmail: d.customerEmail ?? "",
    customerWhatsapp: d.customerWhatsapp ?? "",
    customerGstin: d.customerGstin ?? "",
    placeOfSupplyCode: d.placeOfSupplyCode ?? "",
    serviceDescription: d.serviceDescription ?? "",
    sacCode: d.sacCode ?? "",
    paymentTermsId: d.paymentTermsId,
    paymentTermsLabel: d.paymentTermsLabel ?? "",
    remarks: d.remarks ?? "",
    gstApplicable: d.gstApplicable,
    isReverseCharge: d.isReverseCharge,
    isExempt: d.gstMode === "exempt",
    lines: found.lines.map(toLineState),
    sourceDocumentId: d.sourceDocumentId,
    sourceLabel: d.sourceDocNo && d.sourceDocType
      ? `${BILLING_DOC_TYPE_LABELS[d.sourceDocType]} ${d.sourceDocNo}`
      : null,
  };

  return (
    <PageShell width="wide">
      <BackLink id={id} />
      <h1
        className="mb-4 text-ink-strong"
        style={{
          fontFamily: "var(--font-display), system-ui, sans-serif",
          fontWeight: 900,
          fontSize: "clamp(22px,2.4vw,30px)",
          letterSpacing: "-0.02em",
        }}
      >
        Edit {d.docNo ?? BILLING_DOC_TYPE_LABELS[d.docType].toLowerCase()}
      </h1>

      <BillingDocumentForm
        initial={initial}
        entities={entities.map((e) => ({ id: e.id, label: e.displayName }))}
        sellers={sellers}
        customers={customers}
        products={products}
        terms={terms.map((t) => ({ id: t.id, label: t.label, dueDays: t.dueDays, isDefault: t.isDefault }))}
        sacCodes={sacCodes.map((s) => ({
          id: s.id,
          code: s.code,
          description: s.description,
          defaultGstRate: s.defaultGstRate,
        }))}
        serviceDescriptions={serviceDescriptions}
        locked={Boolean(d.docNo)}
      />
    </PageShell>
  );
}

function BackLink({ id }: { id: string }) {
  return (
    <Link
      href={`/billing/documents/${id}` as Route}
      className="mb-4 inline-flex h-9 items-center gap-1.5 rounded-chip px-3 text-[13px] font-bold text-ink-muted"
      style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
    >
      <ArrowLeft size={14} /> Back to the document
    </Link>
  );
}
