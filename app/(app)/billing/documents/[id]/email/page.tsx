import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { PageShell } from "@/components/layout/page-shell";
import { BILLING_DOC_TYPE_LABELS } from "@/db/enums";
import { getBillingDocument } from "@/lib/queries/billing-documents";
import { buildInvoiceViewModel, invoiceFilename } from "@/lib/billing/view-model";
import { invoiceEmailBody, invoiceEmailSubject } from "@/lib/billing/email-template";
import { CARD_STYLE } from "@/lib/billing/ui";
import { EmailComposer } from "@/components/billing/email-composer";
import { DUMMY_EMAIL_CONFIG } from "@/lib/billing/master";

/**
 * /billing/documents/[id]/email — the Email Composer.
 *
 * "Send Email" on the document opens THIS, it does not send. Everything the
 * composer needs is resolved here, server-side: the recipient from the customer
 * on the document, the subject from the number and the issuing company, the
 * body from the shared template, and the attachment name from the same
 * `invoiceFilename` the PDF route uses.
 */
export const dynamic = "force-dynamic";

export default async function BillingEmailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireWorkspace("billing");
  const { id } = await params;

  const found = await getBillingDocument(id);
  if (!found) notFound();
  const { document, lines } = found;
  const vm = buildInvoiceViewModel(document, lines);

  const blocked =
    document.status === "cancelled"
      ? "This document is cancelled and cannot be emailed."
      : !document.docNo
        ? "Generate this document before emailing it — an unnumbered draft has nothing to send."
        : null;

  if (blocked) {
    return (
      <PageShell width="wide">
        <Back id={id} />
        <div className="rounded-[22px] p-8 text-center" style={CARD_STYLE}>
          <h1 className="text-[18px] font-black text-ink-strong">Not ready to send</h1>
          <p className="mx-auto mt-2 max-w-[52ch] text-[13.5px] text-ink-muted">{blocked}</p>
        </div>
      </PageShell>
    );
  }

  const ctx = {
    docType: document.docType,
    docNo: document.docNo,
    docDate: document.docDate,
    dueDate: document.dueDate,
    total: Number(document.total),
    customerName: document.customerName,
    contactName: document.customerContactName,
    companyName: document.sellerSnapshot?.legalName ?? "",
    paymentTermsLabel: document.paymentTermsLabel,
    contactLine: vm.contactLine,
  };

  return (
    <PageShell width="wide">
      <Back id={id} />
      <h1
        className="mb-1 text-ink-strong"
        style={{
          fontFamily: "var(--font-display), system-ui, sans-serif",
          fontWeight: 900,
          fontSize: "clamp(22px,2.4vw,30px)",
          letterSpacing: "-0.02em",
        }}
      >
        Email {document.docNo}
      </h1>
      <p className="mb-5 text-[13.5px] text-ink-muted">
        To {document.customerName} · {BILLING_DOC_TYPE_LABELS[document.docType]}
      </p>

      <div className="max-w-[1000px]">
        <EmailComposer
          id={document.id}
          defaultTo={document.customerEmail ?? ""}
          defaultSubject={invoiceEmailSubject(ctx)}
          defaultBody={invoiceEmailBody(ctx)}
          attachmentName={invoiceFilename(document)}
          documentLabel={`${BILLING_DOC_TYPE_LABELS[document.docType]} ${document.docNo}`}
          lastSentTo={document.lastSentTo}
          missingRecipient={!document.customerEmail}
          defaultCc={DUMMY_EMAIL_CONFIG.cc}
          defaultBcc={DUMMY_EMAIL_CONFIG.bcc}
        />
      </div>
    </PageShell>
  );
}

function Back({ id }: { id: string }) {
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
