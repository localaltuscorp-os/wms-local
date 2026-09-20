import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText, History } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { PageShell } from "@/components/layout/page-shell";
import { formatDate } from "@/lib/format";
import { BILLING_DOC_TYPE_LABELS } from "@/db/enums";
import { getBillingDocument } from "@/lib/queries/billing-documents";
import { buildInvoiceViewModel } from "@/lib/billing/view-model";
import { isEditable } from "@/lib/billing/documents";
import { todayISO } from "@/lib/billing/numbering";
import { CARD_STYLE } from "@/lib/billing/ui";
import { InvoiceView } from "@/components/billing/invoice-view";
import { DocumentActions } from "@/components/billing/document-actions";
import { DocTypeChip, StatusBadge } from "@/components/billing/chips";

/**
 * /billing/documents/[id] — the document itself.
 *
 * The sheet below is rendered from the same `buildInvoiceViewModel` the PDF
 * uses, so this page IS the preview: what is approved here is what is printed,
 * downloaded and emailed.
 */
export const dynamic = "force-dynamic";

const EVENT_LABELS: Record<string, string> = {
  created: "Created",
  updated: "Edited",
  generated: "Generated",
  emailed: "Emailed",
  printed: "Printed",
  downloaded: "Downloaded",
  converted: "Converted",
  cancelled: "Cancelled",
  paid: "Marked paid",
};

export default async function BillingDocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireWorkspace("billing");
  const { id } = await params;

  const found = await getBillingDocument(id);
  if (!found) notFound();

  const { document, lines, events, emails, source, child, createdByName } = found;
  const vm = buildInvoiceViewModel(document, lines);
  const isOverdue =
    (document.status === "generated" || document.status === "sent") &&
    !!document.dueDate &&
    document.dueDate < todayISO();

  return (
    <PageShell width="wide">
      <div className="billing-no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link
          href={"/billing/documents" as Route}
          className="inline-flex h-9 items-center gap-1.5 rounded-chip px-3 text-[13px] font-bold text-ink-muted"
          style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
        >
          <ArrowLeft size={14} /> Documents
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <DocTypeChip type={document.docType} />
          <StatusBadge status={document.status} isOverdue={isOverdue} />
        </div>
      </div>

      <header className="billing-no-print mb-4">
        <h1
          className="text-ink-strong"
          style={{
            fontFamily: "var(--font-display), system-ui, sans-serif",
            fontWeight: 900,
            fontSize: "clamp(24px,2.8vw,34px)",
            letterSpacing: "-0.025em",
          }}
        >
          {document.docNo ?? `Draft ${BILLING_DOC_TYPE_LABELS[document.docType].toLowerCase()}`}
        </h1>
        <p className="mt-1 text-[13.5px] text-ink-muted">
          {document.customerName} · {formatDate(document.docDate)}
          {createdByName ? ` · raised by ${createdByName}` : ""}
        </p>
      </header>

      <div className="billing-no-print mb-5">
        <DocumentActions
          id={document.id}
          docType={document.docType}
          status={document.status}
          docNo={document.docNo}
          total={Number(document.total)}
          editable={isEditable(document)}
          hasChild={Boolean(child)}
        />
      </div>

      {/* Lineage --------------------------------------------------------- */}
      {source || child ? (
        <div
          className="billing-no-print mb-5 flex flex-wrap items-center gap-4 rounded-[18px] px-4 py-3 text-[13px]"
          style={CARD_STYLE}
        >
          <FileText size={15} className="text-ink-muted" />
          {source ? (
            <span>
              Converted from{" "}
              <Link
                href={`/billing/documents/${source.id}` as Route}
                className="font-bold underline underline-offset-4"
              >
                {BILLING_DOC_TYPE_LABELS[source.docType]} {source.docNo ?? "draft"}
              </Link>
            </span>
          ) : null}
          {child ? (
            <span>
              Converted to{" "}
              <Link
                href={`/billing/documents/${child.id}` as Route}
                className="font-bold underline underline-offset-4"
              >
                {BILLING_DOC_TYPE_LABELS[child.docType]} {child.docNo ?? "draft"}
              </Link>
            </span>
          ) : null}
        </div>
      ) : null}

      {document.status === "cancelled" && document.cancelReason ? (
        <p
          className="billing-no-print mb-5 rounded-[18px] px-4 py-3 text-[13px] font-semibold"
          style={{ background: "#FEE2E2", color: "#450A0A", boxShadow: "inset 0 0 0 1px #FCA5A5" }}
        >
          Cancelled — {document.cancelReason}
        </p>
      ) : null}

      <InvoiceView vm={vm} />

      {/* Trail ----------------------------------------------------------- */}
      <section className="billing-no-print mt-6 grid grid-cols-2 gap-4 max-lg:grid-cols-1">
        <div className="rounded-[22px] p-5" style={CARD_STYLE}>
          <h2 className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.14em] text-ink-muted">
            <History size={14} /> Activity
          </h2>
          <ol className="mt-3 space-y-2.5">
            {events.length === 0 ? (
              <li className="text-[13px] text-ink-muted">Nothing recorded yet.</li>
            ) : null}
            {events.map((e) => (
              <li key={e.id} className="flex items-baseline justify-between gap-3 text-[13px]">
                <span className="font-semibold">
                  {EVENT_LABELS[e.eventType] ?? e.eventType}
                  {e.actorName ? <span className="font-normal text-ink-muted"> · {e.actorName}</span> : null}
                </span>
                <span className="shrink-0 text-[12px] text-ink-muted">{formatDate(e.createdAt)}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="rounded-[22px] p-5" style={CARD_STYLE}>
          <h2 className="text-[12px] font-bold uppercase tracking-[0.14em] text-ink-muted">Emails</h2>
          <ol className="mt-3 space-y-2.5">
            {emails.length === 0 ? (
              <li className="text-[13px] text-ink-muted">This document has not been emailed yet.</li>
            ) : null}
            {emails.map((m) => (
              <li key={m.id} className="text-[13px]">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-semibold">{m.recipient}</span>
                  <span
                    className="shrink-0 text-[11.5px] font-bold"
                    style={{ color: m.status === "sent" ? "#059669" : "#DC2626" }}
                  >
                    {m.status === "sent" ? "Sent" : "Failed"}
                  </span>
                </div>
                <div className="text-[12px] text-ink-muted">{m.subject}</div>
                {m.error ? <div className="text-[12px] text-[#B91C1C]">{m.error}</div> : null}
                <div className="text-[11.5px] text-ink-muted">{formatDate(m.sentAt)}</div>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </PageShell>
  );
}
