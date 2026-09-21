import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { PageShell } from "@/components/layout/page-shell";
import { DEFAULT_ENTITY_ID } from "@/lib/hr/entities";
import { listBillingEntities } from "@/lib/billing/entities";
import { BILLING_DOC_TYPES, BILLING_DOC_TYPE_LABELS, type BillingDocType } from "@/db/enums";
import {
  getBillingDocument,
  getBillingFormData,
  listServiceDescriptions,
} from "@/lib/queries/billing-documents";
import { dueDateFor, todayISO } from "@/lib/billing/numbering";
import { BILLING_PURPLE } from "@/lib/billing/ui";
import { BillingDocumentForm } from "@/components/billing/document-form";
import { DocTypeTitleProvider, NewDocumentTitle } from "@/components/billing/doc-type-title";
import { emptyLine, toLineState, type DocumentFormState } from "@/lib/billing/form-state";

/**
 * /billing/documents/new — raise a document.
 *
 * `?from=<id>` preloads everything from a source document, which is the
 * "reference document" half of the conversion flow: the same server path a
 * Convert from the list uses runs when it is submitted, so the two cannot
 * diverge.
 */
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const one = (v: string | string[] | undefined): string | null => {
  const s = Array.isArray(v) ? v[0] : v;
  return s?.trim() ? s.trim() : null;
};

export default async function NewBillingDocumentPage({ searchParams }: PageProps) {
  await requireWorkspace("billing");
  const sp = await searchParams;

  const typeParam = one(sp.type);
  const docType: BillingDocType = BILLING_DOC_TYPES.includes(typeParam as BillingDocType)
    ? (typeParam as BillingDocType)
    : "tax_invoice";

  // The five in code plus any company added in Admin › Billing Profiles.
  const entities = await listBillingEntities();
  const entityIds = entities.map((e) => e.id);
  // One after another — see getBillingFormData on why not in parallel.
  const { customers, products, terms, sacCodes, sellers } = await getBillingFormData(entityIds);
  const serviceDescriptions = await listServiceDescriptions();

  // (The "sample master data in use" notice was removed from this page —
  // Manan, 2026-09-19. The Billing room's Admin Master reader went with it on
  // 2026-09-20; Admin › Billing Profiles is where the real rows are entered.)

  const today = todayISO();
  const defaultTerm = terms.find((t) => t.isDefault) ?? null;

  let initial: DocumentFormState = {
    id: null,
    docType,
    entityId: DEFAULT_ENTITY_ID,
    docDate: today,
    dueDate: defaultTerm ? (dueDateFor(today, defaultTerm.dueDays) ?? "") : "",
    customerId: null,
    customerName: "",
    customerContactName: "",
    customerEmail: "",
    customerWhatsapp: "",
    customerGstin: "",
    placeOfSupplyCode: "",
    serviceDescription: "",
    sacCode: "",
    paymentTermsId: defaultTerm?.id ?? null,
    paymentTermsLabel: defaultTerm?.label ?? "",
    remarks: "",
    gstApplicable: true,
    isReverseCharge: false,
    isExempt: false,
    lines: [emptyLine()],
    sourceDocumentId: null,
    sourceLabel: null,
  };

  // Reference document — carry everything forward rather than retyping it.
  const fromId = one(sp.from);
  if (fromId) {
    const source = await getBillingDocument(fromId);
    if (!source) notFound();
    const d = source.document;
    initial = {
      ...initial,
      docType,
      entityId: d.entityId,
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
      lines: source.lines.map(toLineState),
      sourceDocumentId: d.id,
      sourceLabel: `${BILLING_DOC_TYPE_LABELS[d.docType]} ${d.docNo ?? ""}`.trim(),
    };
  }

  return (
    <DocTypeTitleProvider initial={docType}>
    <PageShell width="wide">
      <div className="mb-4 flex items-center gap-3">
        <Link
          href={"/billing/documents" as Route}
          className="inline-flex h-9 items-center gap-1.5 rounded-chip px-3 text-[13px] font-bold text-ink-muted"
          style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
        >
          <ArrowLeft size={14} /> Documents
        </Link>
        {/* The SAME heading as before, in the same place — but rendered by a
            client component that reads the live document type, so the toggle
            in the form below moves it. See doc-type-title.tsx. */}
        <NewDocumentTitle fallback={docType} />
      </div>

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
      />
    </PageShell>
    </DocTypeTitleProvider>
  );
}
