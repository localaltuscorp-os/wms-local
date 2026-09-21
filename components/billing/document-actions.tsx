"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import {
  Download,
  Printer,
  Mail,
  Pencil,
  Sparkles,
  ArrowRightLeft,
  BadgeIndianRupee,
  Ban,
  Loader2,
} from "lucide-react";
import { fireToast } from "@/lib/toast";
import { BILLING_DOC_TYPE_LABELS, type BillingDocStatus, type BillingDocType } from "@/db/enums";
import { CONVERSION_TARGETS } from "@/lib/billing/numbering";
import { BILLING_PURPLE, BILLING_PURPLE_DEEP } from "@/lib/billing/ui";
import {
  cancelBillingDocumentAction,
  convertBillingDocumentAction,
  generateBillingDocumentAction,
  logBillingDocumentViewAction,
  markBillingDocumentPaidAction,
} from "@/app/(app)/billing/documents/actions";

/**
 * The action bar above a document.
 *
 * Which buttons exist is decided by the document's own status — the same rules
 * the server enforces — so nothing on screen is an invitation to an error.
 */

interface Props {
  id: string;
  docType: BillingDocType;
  status: BillingDocStatus;
  docNo: string | null;
  total: number;
  editable: boolean;
  hasChild: boolean;
}

export function DocumentActions({ id, docType, status, docNo, total, editable, hasChild }: Props) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [cancelling, setCancelling] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [paying, setPaying] = React.useState(false);
  const [paidAmount, setPaidAmount] = React.useState(String(total));
  const [paidAt, setPaidAt] = React.useState(() => new Date().toISOString().slice(0, 10));

  async function run(key: string, label: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(key);
    try {
      const result = await fn();
      if (!result.ok) {
        fireToast({ message: result.error ?? "That did not work.", type: "error" });
        return false;
      }
      fireToast({ message: label, type: "success" });
      router.refresh();
      return true;
    } finally {
      setBusy(null);
    }
  }

  const convertTargets =
    docNo && (status === "generated" || status === "sent" || status === "paid") && !hasChild
      ? CONVERSION_TARGETS[docType]
      : [];

  /**
   * WHY THERE IS NO CONVERT BUTTON — said out loud.
   *
   * Manan, 2026-09-16, against a tax invoice's action bar: "give option to
   * convert quote to proforma, invoice and proforma to invoice." Those options
   * already exist and are wired to CONVERSION_TARGETS. They were simply not on
   * the document being looked at — every document raised in this workspace so
   * far is a TAX INVOICE, which was then the end of the chain, so the buttons
   * had never once appeared and the feature looked absent.
   *
   * 2026-09-20: a tax invoice now converts too (see CONVERSION_TARGETS), so the
   * "last document in the chain" arm below no longer fires for any type. It is
   * kept as the honest answer if a type is ever given an empty chain again.
   *
   * A control that is correctly absent still has to explain itself, or it reads
   * as missing. Null while a convert button IS showing: the control is its own
   * explanation then.
   */
  const convertNote = (() => {
    if (convertTargets.length > 0) return null;
    const chain = CONVERSION_TARGETS[docType];
    const typeName = BILLING_DOC_TYPE_LABELS[docType].toLowerCase();
    if (chain.length === 0) {
      return `A ${typeName} does not convert into anything.`;
    }
    if (hasChild) {
      return "Already converted — the document it became is linked below. A document converts once, so the chain stays a line rather than a fan.";
    }
    if (!docNo || status === "draft") {
      return `Generate this ${typeName} first. Converting carries a numbered document forward, so there has to be a number to carry.`;
    }
    if (status === "cancelled") {
      return `A cancelled ${typeName} cannot be converted.`;
    }
    return null;
  })();

  return (
    <div className="billing-no-print space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {!docNo && status === "draft" ? (
          <Primary
            onClick={() =>
              void run("generate", "Document generated.", () => generateBillingDocumentAction({ id }))
            }
            busy={busy === "generate"}
          >
            <Sparkles size={15} /> Generate
          </Primary>
        ) : null}

        {docNo && status !== "cancelled" ? (
          <Primary asLink href={`/billing/documents/${id}/email` as Route}>
            <Mail size={15} /> Send email
          </Primary>
        ) : null}

        {editable ? (
          <Secondary asLink href={`/billing/documents/${id}/edit` as Route}>
            <Pencil size={14} /> Edit
          </Secondary>
        ) : null}

        {docNo ? (
          <>
            <Secondary
              asAnchor
              href={`/billing/documents/${id}/pdf?download=1`}
              onClick={() => void logBillingDocumentViewAction(id, "downloaded")}
            >
              <Download size={14} /> Download PDF
            </Secondary>
            <Secondary
              onClick={() => {
                void logBillingDocumentViewAction(id, "printed");
                window.print();
              }}
            >
              <Printer size={14} /> Print
            </Secondary>
          </>
        ) : null}

        {convertTargets.map((to) => (
          <Secondary
            key={to}
            busy={busy === `convert-${to}`}
            onClick={() => {
              /* CONVERT IN PLACE. This used to bounce to the documents LIST,
                 which is the one screen that does not show the result: you
                 landed on a page of rows and had to find the draft yourself.
                 `run` already refreshes on success, and this page then shows
                 the "Converted to …" link to the new draft, so the conversion
                 happens and is reported where it was asked for. */
              void run(
                `convert-${to}`,
                `Converted to a ${BILLING_DOC_TYPE_LABELS[to].toLowerCase()} draft.`,
                () => convertBillingDocumentAction({ sourceId: id, toType: to }),
              );
            }}
          >
            <ArrowRightLeft size={14} /> Convert to {BILLING_DOC_TYPE_LABELS[to]}
          </Secondary>
        ))}

        {docNo && status !== "paid" && status !== "cancelled" ? (
          <Secondary onClick={() => setPaying((v) => !v)}>
            <BadgeIndianRupee size={14} /> Mark paid
          </Secondary>
        ) : null}

        {status !== "cancelled" ? (
          <Secondary onClick={() => setCancelling((v) => !v)} danger>
            <Ban size={14} /> Cancel
          </Secondary>
        ) : null}
      </div>

      {convertNote ? (
        <p className="max-w-3xl text-[12px] font-medium leading-snug text-ink-subtle">
          {convertNote}
        </p>
      ) : null}

      {paying ? (
        <Panel title="Record a payment">
          <div className="flex flex-wrap items-end gap-3">
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.12em] text-ink-muted">
                Amount
              </span>
              <input
                className={INPUT}
                inputMode="decimal"
                value={paidAmount}
                onChange={(e) => setPaidAmount(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.12em] text-ink-muted">
                Paid on
              </span>
              <input
                className={INPUT}
                type="date"
                value={paidAt}
                onChange={(e) => setPaidAt(e.target.value)}
              />
            </label>
            <Primary
              busy={busy === "paid"}
              onClick={async () => {
                const ok = await run("paid", "Marked paid.", () =>
                  markBillingDocumentPaidAction({ id, paidAmount, paidAt }),
                );
                if (ok) setPaying(false);
              }}
            >
              Save payment
            </Primary>
          </div>
        </Panel>
      ) : null}

      {cancelling ? (
        <Panel title="Cancel this document">
          <p className="mb-2 text-[12.5px] text-ink-muted">
            Cancelling never deletes anything. The document keeps its number — retired, so it can
            never be reused — and stays in the ledger with the reason attached.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="block min-w-[280px] flex-1">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.12em] text-ink-muted">
                Reason
              </span>
              <input
                className={INPUT}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. raised against the wrong entity"
              />
            </label>
            <Primary
              busy={busy === "cancel"}
              disabled={reason.trim().length < 3}
              onClick={async () => {
                const ok = await run("cancel", "Document cancelled.", () =>
                  cancelBillingDocumentAction({ id, reason }),
                );
                if (ok) setCancelling(false);
              }}
            >
              Cancel document
            </Primary>
          </div>
        </Panel>
      ) : null}
    </div>
  );
}

const INPUT =
  "h-10 w-full rounded-chip border border-hairline bg-white px-3 text-[13px] outline-none focus:border-[color:var(--color-altus-red)]";

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-[18px] p-4"
      style={{ background: "rgba(248,250,252,0.9)", boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
    >
      <h3 className="mb-2 text-[12px] font-bold uppercase tracking-[0.14em] text-ink-muted">{title}</h3>
      {children}
    </div>
  );
}

function Primary({
  children,
  onClick,
  busy,
  disabled,
  asLink,
  href,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  busy?: boolean;
  disabled?: boolean;
  asLink?: boolean;
  href?: Route;
}) {
  const className =
    "inline-flex h-10 items-center gap-2 rounded-chip px-4 text-[13px] font-bold text-white disabled:opacity-50";
  const style = { background: `linear-gradient(135deg, ${BILLING_PURPLE}, ${BILLING_PURPLE_DEEP})` };
  if (asLink && href) {
    return (
      <Link href={href} className={className} style={style}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={busy || disabled} className={className} style={style}>
      {busy ? <Loader2 size={15} className="animate-spin" /> : null}
      {children}
    </button>
  );
}

function Secondary({
  children,
  onClick,
  busy,
  danger,
  asLink,
  asAnchor,
  href,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  busy?: boolean;
  danger?: boolean;
  asLink?: boolean;
  asAnchor?: boolean;
  href?: string;
}) {
  const className = `inline-flex h-10 items-center gap-2 rounded-chip px-3.5 text-[13px] font-bold ${
    danger ? "text-[#B91C1C]" : "text-ink-muted"
  } disabled:opacity-50`;
  const style = { boxShadow: "inset 0 0 0 1px var(--color-hairline)" };
  if (asLink && href) {
    return (
      <Link href={href as Route} className={className} style={style}>
        {children}
      </Link>
    );
  }
  if (asAnchor && href) {
    return (
      <a href={href} className={className} style={style} onClick={onClick}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={busy} className={className} style={style}>
      {busy ? <Loader2 size={15} className="animate-spin" /> : null}
      {children}
    </button>
  );
}
