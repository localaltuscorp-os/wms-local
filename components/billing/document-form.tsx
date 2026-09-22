"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";
import { Plus, Trash2, Loader2, FileText, Sparkles, AlertTriangle, ExternalLink, UserPlus } from "lucide-react";
import { Select } from "@/components/ui/select";
import { DateField } from "@/components/ui/date-field";
import { Button } from "@/components/ui/button";
import { fireToast } from "@/lib/toast";
import { BILLING_DOC_TYPES, BILLING_DOC_TYPE_LABELS, type BillingDocType } from "@/db/enums";
import { useDocTypeTitle } from "@/components/billing/doc-type-title";
import type { BillingSellerSnapshot } from "@/db/schema";
import { computeLine, computeTotals, gstModeLabel, money, resolveGstMode } from "@/lib/billing/tax";
import { dueDateFor } from "@/lib/billing/numbering";
import { emptyLine, type DocumentFormState, type LineState } from "@/lib/billing/form-state";
import { GST_STATES, stateByCode, stateFromGstin } from "@/lib/billing/states";
import { fmtMoney } from "@/lib/billing/view-model";
import { BILLING_PURPLE, BILLING_PURPLE_DEEP, CARD_STYLE, rupees } from "@/lib/billing/ui";
import { entityChargesGst } from "@/lib/billing/gst-entities";
import { productFullName } from "@/lib/billing/product-names";
import { DictateTextarea } from "@/components/billing/dictate-textarea";
import {
  saveAndGenerateAction,
  saveBillingDraftAction,
} from "@/app/(app)/billing/documents/actions";

/**
 * BILLING — the create / edit form.
 *
 * Built so that almost nothing is typed twice: pick the entity and the company
 * block fills itself from the Admin Panel; pick the customer and the address,
 * GSTIN, email and place of supply arrive; pick a product and its code, SAC,
 * rate and GST rate arrive; pick a payment term and the due date follows.
 *
 * The totals panel runs the SAME `computeTotals` the server runs on save, so
 * what is shown while typing is what gets stored — but the figures the client
 * computes are display only: the server recomputes and writes its own.
 */

export interface FormCustomer {
  id: string;
  name: string;
  legalName: string | null;
  contactName: string | null;
  email: string | null;
  whatsapp: string | null;
  phone: string | null;
  pan: string | null;
  gstin: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  stateName: string | null;
  stateCode: string | null;
  pincode: string | null;
  /* From the Customer KYC — shown and applied when the customer is picked. */
  clientCode?: string | null;
  contactDesignation?: string | null;
  paymentTerms?: string | null;
  creditDays?: string | null;
  shippingAddress?: string | null;
}

export interface FormProduct {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  sacCode: string | null;
  defaultRate: string | null;
  defaultGstRate: string | null;
}

export interface FormTerm {
  id: string;
  label: string;
  dueDays: number | null;
  isDefault: boolean;
}

export interface FormSac {
  id: string;
  code: string;
  description: string;
  defaultGstRate: string | null;
}

export interface FormEntity {
  id: string;
  label: string;
}

export type { DocumentFormState, LineState };

interface Props {
  initial: DocumentFormState;
  entities: FormEntity[];
  sellers: Record<string, BillingSellerSnapshot>;
  customers: FormCustomer[];
  products: FormProduct[];
  terms: FormTerm[];
  sacCodes: FormSac[];
  serviceDescriptions: string[];
  /** True when the row is already numbered — the type can no longer change. */
  locked?: boolean;
}

export function BillingDocumentForm({
  initial,
  entities,
  sellers,
  customers: seedCustomers,
  products,
  terms,
  sacCodes,
  serviceDescriptions,
  locked = false,
}: Props) {
  const router = useRouter();
  const [form, setForm] = React.useState<DocumentFormState>(initial);
  // Straight from the server: a customer onboarded in another tab (New
  // Customer KYC opens in one) shows up on return, because focusing the page
  // re-reads the list.
  const customers = seedCustomers;
  React.useEffect(() => {
    const onFocus = () => router.refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [router]);
  const [busy, setBusy] = React.useState<null | "draft" | "generate">(null);
  const [error, setError] = React.useState<string | null>(null);

  const seller = sellers[form.entityId] ?? null;
  /* GST ONLY FOR ALTUS CORP AND COLOUR GRAPHICS. For any other issuing entity
     the document carries no GST details: the Tax toggles and the GST % column
     are not offered, and the server forces the same on save. */
  const gstAllowed = entityChargesGst(
    form.entityId,
    entities.find((e) => e.id === form.entityId)?.label,
  );
  const gstOn = gstAllowed && form.gstApplicable;
  const set = <K extends keyof DocumentFormState>(key: K, value: DocumentFormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  /* REMARKS — one box plus any number of "extra remark" boxes. They are
     stored as ONE remarks text, each box on its own line (blank boxes are
     dropped), so the document and its PDF need nothing new. An existing
     document opens with all its remarks in the first box. */
  const [remarkParts, setRemarkPartsRaw] = React.useState<string[]>([initial.remarks ?? ""]);
  function setRemarkParts(update: (p: string[]) => string[]) {
    const next = update(remarkParts);
    setRemarkPartsRaw(next);
    setForm((f) => ({ ...f, remarks: next.map((x) => x.trim()).filter(Boolean).join("\n") }));
  }
  const setRemarkPart = (index: number, value: string) =>
    setRemarkParts((p) => p.map((x, k) => (k === index ? value : x)));
  const removeRemarkPart = (index: number) => setRemarkParts((p) => p.filter((_, k) => k !== index));
  /** How many notes will actually print — blank boxes do not. Decides whether
   *  the first box is labelled "Note" or "Note 1", matching the document. */
  const remarkCount = remarkParts.filter((x) => x.trim()).length;

  // ── Derived money ────────────────────────────────────────────────────────
  const gstMode = resolveGstMode({
    sellerGstin: seller?.gstin ?? null,
    sellerStateCode: seller?.stateCode ?? null,
    customerStateCode: form.placeOfSupplyCode || null,
    gstApplicable: gstOn,
    exempt: gstAllowed && form.isExempt,
  });
  const totals = computeTotals(form.lines, gstMode);

  // ── Customer selection fills everything it can ───────────────────────────
  function pickCustomer(id: string | null) {
    if (!id) {
      setForm((f) => ({ ...f, customerId: null }));
      return;
    }
    const c = customers.find((x) => x.id === id);
    if (!c) return;
    const stateCode = c.stateCode ?? stateFromGstin(c.gstin)?.code ?? "";
    // The KYC's payment terms, matched to the payment-term master by name, so
    // the due date follows the same way it does when a term is picked by hand.
    const kycTerm = c.paymentTerms?.trim().toLowerCase();
    const term = kycTerm ? terms.find((t) => t.label.trim().toLowerCase() === kycTerm) ?? null : null;
    setForm((f) => ({
      ...f,
      customerId: c.id,
      customerName: c.name,
      customerContactName: c.contactName ?? "",
      customerEmail: c.email ?? "",
      customerWhatsapp: c.whatsapp ?? c.phone ?? "",
      customerGstin: c.gstin ?? "",
      placeOfSupplyCode: stateCode,
      ...(term
        ? {
            paymentTermsId: term.id,
            paymentTermsLabel: term.label,
            dueDate: dueDateFor(f.docDate, term.dueDays) ?? f.dueDate,
          }
        : {}),
    }));
  }

  const selectedCustomer = customers.find((c) => c.id === form.customerId) ?? null;

  // ── Product or service ───────────────────────────────────────────────────
  // Held per line in the browser only; the saved line is the same either way.
  const [kinds, setKinds] = React.useState<Record<string, "product" | "service">>({});
  const lineKind = (l: LineState): "product" | "service" =>
    kinds[l.key] ?? (l.productId ? "product" : "service");
  function setLineKind(index: number, kind: "product" | "service") {
    const l = form.lines[index];
    if (!l || lineKind(l) === kind) return;
    setKinds((k) => ({ ...k, [l.key]: kind }));
    // Switching clears what the other list put on the line.
    setLine(index, { productId: null, code: "", name: "", description: "" });
  }
  const serviceOptions = React.useMemo(
    () => [...new Set(serviceDescriptions.map((d) => d.trim()).filter(Boolean))],
    [serviceDescriptions],
  );
  function pickService(index: number, value: string) {
    setLine(index, { productId: null, code: "", name: value, description: value });
  }

  // ── Product selection fills the line ─────────────────────────────────────
  function pickProduct(index: number, productId: string | null) {
    const p = products.find((x) => x.id === productId) ?? null;
    setForm((f) => {
      const lines = [...f.lines];
      const line = lines[index];
      if (!line) return f;
      lines[index] = p
        ? {
            ...line,
            productId: p.id,
            code: p.code ?? "",
            // The full product name, not the master's short code (BSS → Business Scale Up Shastra).
            name: productFullName(p),
            description: line.description || p.description || "",
            sacCode: p.sacCode ?? line.sacCode,
            rate: p.defaultRate ?? line.rate,
            gstRate: p.defaultGstRate ?? line.gstRate,
          }
        : { ...line, productId: null };
      return { ...f, lines };
    });
  }

  function setLine(index: number, patch: Partial<LineState>) {
    setForm((f) => {
      const lines = [...f.lines];
      const line = lines[index];
      if (!line) return f;
      lines[index] = { ...line, ...patch };
      return { ...f, lines };
    });
  }

  function addLine() {
    setForm((f) => ({ ...f, lines: [...f.lines, { ...emptyLine(), gstRate: f.lines.at(-1)?.gstRate ?? "18" }] }));
  }

  function removeLine(index: number) {
    setForm((f) => ({
      ...f,
      lines: f.lines.length <= 1 ? f.lines : f.lines.filter((_, i) => i !== index),
    }));
  }

  // ── Payment terms drive the due date ─────────────────────────────────────
  function pickTerm(id: string | null) {
    const t = terms.find((x) => x.id === id) ?? null;
    setForm((f) => ({
      ...f,
      paymentTermsId: t?.id ?? null,
      paymentTermsLabel: t?.label ?? "",
      dueDate: t ? (dueDateFor(f.docDate, t.dueDays) ?? "") : f.dueDate,
    }));
  }

  // ── Submit ───────────────────────────────────────────────────────────────
  function payload() {
    return {
      id: form.id,
      docType: form.docType,
      entityId: form.entityId,
      docDate: form.docDate,
      dueDate: form.dueDate || null,
      customerId: form.customerId,
      customerName: form.customerName,
      customerContactName: form.customerContactName,
      customerEmail: form.customerEmail,
      customerWhatsapp: form.customerWhatsapp,
      customerGstin: form.customerGstin,
      placeOfSupplyState: stateByCode(form.placeOfSupplyCode)?.name ?? "",
      placeOfSupplyCode: form.placeOfSupplyCode,
      serviceDescription: form.serviceDescription,
      sacCode: form.sacCode,
      paymentTermsId: form.paymentTermsId,
      paymentTermsLabel: form.paymentTermsLabel,
      remarks: form.remarks,
      gstApplicable: gstOn,
      isReverseCharge: gstAllowed && form.isReverseCharge,
      isExempt: gstAllowed && form.isExempt,
      sourceDocumentId: form.sourceDocumentId,
      lines: form.lines.map((l) => ({
        productId: l.productId,
        code: l.code,
        name: l.name,
        description: l.description,
        sacCode: l.sacCode,
        quantity: l.quantity || "0",
        unit: l.unit,
        rate: l.rate || "0",
        discountPct: l.discountPct || null,
        discountAmount: l.discountAmount || "0",
        gstRate: gstOn ? l.gstRate || "0" : "0",
      })),
    };
  }

  /** The checks worth catching before a round trip; the server re-runs them. */
  function clientBlockers(forGenerate: boolean): string | null {
    if (!form.customerId) {
      return "Select the customer in Bill To. A new customer must be onboarded in New Customer KYC first.";
    }
    if (!form.customerName.trim()) return "The customer needs a name as printed.";
    if (form.lines.length === 0) return "Add at least one product or service.";
    const bad = form.lines.findIndex((l) => !l.name.trim());
    if (bad >= 0) return `Line ${bad + 1} needs a product or service name.`;
    const badQty = form.lines.findIndex((l) => money(l.quantity) <= 0);
    if (badQty >= 0) return `Line ${badQty + 1} needs a quantity greater than zero.`;
    if (forGenerate && totals.total <= 0) return "The document total must be greater than zero.";
    if (forGenerate && gstOn && form.docType === "tax_invoice" && !seller?.gstin) {
      return "This entity has no GSTIN yet — add one in Admin › Billing Profiles before issuing a tax invoice.";
    }
    if (forGenerate && form.docType === "tax_invoice" && !form.placeOfSupplyCode) {
      return "Set the place of supply before issuing a tax invoice.";
    }
    return null;
  }

  async function submit(kind: "draft" | "generate") {
    setError(null);
    const blocker = clientBlockers(kind === "generate");
    if (blocker) {
      setError(blocker);
      fireToast({ message: blocker, type: "error" });
      return;
    }
    setBusy(kind);
    try {
      const result =
        kind === "draft"
          ? await saveBillingDraftAction(payload())
          : await saveAndGenerateAction(payload());
      if (!result.ok) {
        setError(result.error);
        fireToast({ message: result.error, type: "error" });
        return;
      }
      fireToast({
        message:
          kind === "draft"
            ? "Draft saved."
            : `${BILLING_DOC_TYPE_LABELS[form.docType]} ${"docNo" in result ? result.docNo : ""} generated.`,
        type: "success",
      });
      router.push(`/billing/documents/${result.id}` as Route);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  // The page heading names the document type and lives outside this component
  // — see components/billing/doc-type-title.tsx. Null on the edit screen, which
  // renders no provider because its title is the document number.
  const titleCtx = useDocTypeTitle();
  React.useEffect(() => {
    titleCtx?.setDocType(form.docType);
  }, [form.docType, titleCtx]);

  const taxInvoiceBlocked = form.docType === "tax_invoice" && !seller?.gstin;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-5 max-lg:grid-cols-1">
      <div className="space-y-5">
        {form.sourceLabel ? (
          <div
            className="flex items-center gap-2 rounded-[16px] px-4 py-3 text-[13px] font-semibold"
            style={{ background: "#FEE2E2", color: "#7F1D1D", boxShadow: "inset 0 0 0 1px #FCA5A5" }}
          >
            <FileText size={15} />
            Converting {form.sourceLabel} — everything below was carried forward. Adjust before generating.
          </div>
        ) : null}

        {/* 1 — Basics -------------------------------------------------- */}
        <Section title="Document" hint="What is being issued, by whom, and when.">
          <Field label="Document type">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Document type">
              {BILLING_DOC_TYPES.map((t) => {
                const active = form.docType === t;
                return (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={active}
                    disabled={locked}
                    onClick={() => set("docType", t)}
                    className="rounded-pill px-3.5 py-1.5 text-[13px] font-bold transition disabled:opacity-50"
                    style={
                      active
                        ? {
                            background: `linear-gradient(135deg, ${BILLING_PURPLE}, ${BILLING_PURPLE_DEEP})`,
                            color: "#fff",
                          }
                        : {
                            boxShadow: "inset 0 0 0 1px var(--color-hairline)",
                            color: "var(--color-ink-muted)",
                          }
                    }
                  >
                    {BILLING_DOC_TYPE_LABELS[t]}
                  </button>
                );
              })}
            </div>
            {locked ? (
              <p className="mt-1.5 text-[12px] text-ink-muted">
                This document already carries a number from its series, so its type is fixed. Convert
                it instead.
              </p>
            ) : null}
          </Field>

          <div className="grid grid-cols-3 gap-4 max-md:grid-cols-1">
            <Field label="Issuing company">
              <Select
                options={entities.map((e) => ({ value: e.id, label: e.label }))}
                value={form.entityId}
                onValueChange={(v) => set("entityId", v)}
                ariaLabel="Issuing company"
              />
            </Field>
            {/* NAMED AFTER THE TYPE BEING RAISED, not "Document". Picking
                Quotation above turns these into "Quotation date" and
                "Quotation number", and likewise for the two invoices — the
                form then reads the way the finished document does, and there
                is no moment where someone has chosen a quotation but is being
                asked for a generic document's details. */}
            <Field label={`${BILLING_DOC_TYPE_LABELS[form.docType]} date`}>
              <DateField
                value={form.docDate}
                onChange={(e) => {
                  const docDate = e.target.value;
                  const t = terms.find((x) => x.id === form.paymentTermsId) ?? null;
                  setForm((f) => ({
                    ...f,
                    docDate,
                    dueDate: t ? (dueDateFor(docDate, t.dueDays) ?? "") : f.dueDate,
                  }));
                }}
                className={INPUT}
              />
            </Field>
            <Field label={`${BILLING_DOC_TYPE_LABELS[form.docType]} number`}>
              <div className="flex h-10 items-center rounded-chip px-3 text-[13px] text-ink-muted" style={READONLY}>
                Auto generate
              </div>
            </Field>
          </div>
        </Section>

        {/* 2 — Customer ------------------------------------------------ */}
        <Section
          title="Customer"
          hint="Only customers onboarded in New Customer KYC can be billed. Selecting one fills in everything from their KYC."
        >
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 max-md:grid-cols-1">
            <Field label="Bill to *">
              <Select
                options={customers.map((c) => ({
                  value: c.id,
                  label: c.clientCode ? `${c.name} · ${c.clientCode}` : c.name,
                }))}
                value={form.customerId ?? ""}
                onValueChange={(v) => pickCustomer(v || null)}
                placeholder={customers.length === 0 ? "No customers yet — onboard one first" : "Search customers…"}
                searchable
                ariaLabel="Bill to"
              />
            </Field>
            {/* A NEW customer goes through KYC, not a quick form here. Opens in
                a new tab so this draft is not lost; the list refreshes when
                you come back to this tab. */}
            <Link
              href={"/billing/customers/new" as Route}
              target="_blank"
              className="mb-[2px] inline-flex h-10 items-center gap-1.5 rounded-chip px-3 text-[13px] font-semibold text-ink-muted"
              style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
            >
              <UserPlus size={14} /> New Customer KYC
            </Link>
          </div>

          {customers.length === 0 ? (
            <Note tone="warn">
              There are no customers in the Customer Master yet. Onboard the customer in New Customer
              KYC first — then they can be selected here.
            </Note>
          ) : null}

          <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
            <Field label="Customer name (as printed)">
              <input
                className={INPUT}
                value={form.customerName}
                onChange={(e) => set("customerName", e.target.value)}
                placeholder="Who is being billed"
              />
            </Field>
            <Field label="Kind attention">
              <input
                className={INPUT}
                value={form.customerContactName}
                onChange={(e) => set("customerContactName", e.target.value)}
                placeholder="Contact person"
              />
            </Field>
            <Field label="Email" hint="Pre-fills the recipient when this document is emailed.">
              <input
                className={INPUT}
                type="email"
                value={form.customerEmail}
                onChange={(e) => set("customerEmail", e.target.value)}
                placeholder="name@company.com"
              />
            </Field>
            <Field label="WhatsApp / phone">
              <input
                className={INPUT}
                value={form.customerWhatsapp}
                onChange={(e) => set("customerWhatsapp", e.target.value)}
                placeholder="+91…"
              />
            </Field>
            <Field label="Customer GSTIN" hint="Leave blank for an unregistered customer.">
              <input
                className={INPUT}
                value={form.customerGstin}
                onChange={(e) => {
                  const gstin = e.target.value.toUpperCase();
                  const st = stateFromGstin(gstin);
                  setForm((f) => ({
                    ...f,
                    customerGstin: gstin,
                    placeOfSupplyCode: st?.code ?? f.placeOfSupplyCode,
                  }));
                }}
                placeholder="27ABCDE1234F1Z5"
              />
            </Field>
            <Field label="Place of supply">
              <Select
                options={GST_STATES.map((s) => ({ value: s.code, label: `${s.code} · ${s.name}` }))}
                value={form.placeOfSupplyCode}
                onValueChange={(v) => set("placeOfSupplyCode", v)}
                placeholder="Select state…"
                searchable
                ariaLabel="Place of supply"
              />
            </Field>
            {/* ADDRESS — fetched from the customer's KYC billing address the
                moment Bill To is picked, and printed on the document as it is
                here. Read-only: the address is the customer's, so it is
                corrected on their KYC (Customer Master › Edit), where every
                future document then picks it up. */}
            <div className="col-span-2 max-md:col-span-1">
              <Field label="Address">
                <textarea
                  readOnly
                  rows={2}
                  value={
                    selectedCustomer
                      ? [
                          selectedCustomer.addressLine1,
                          selectedCustomer.addressLine2,
                          [selectedCustomer.city, selectedCustomer.stateName, selectedCustomer.pincode]
                            .filter(Boolean)
                            .join(", "),
                        ]
                          .filter(Boolean)
                          .join(", ")
                      : ""
                  }
                  placeholder={selectedCustomer ? "No billing address in the KYC" : "Select Bill To to fetch the address"}
                  className={`${INPUT} h-auto resize-none py-2`}
                  style={READONLY}
                />
              </Field>
            </div>
          </div>

          {form.customerId && !form.customerGstin ? (
            <Note tone="info">
              This customer has no GSTIN — the document will be issued to an unregistered customer.
            </Note>
          ) : null}

          {/* NO KYC SUMMARY PANEL (2026-09-20). It repeated the client code,
              billing address, PAN, contact and payment terms that are already
              on the customer's own record, read-only, on a form whose job is
              to raise a document — six facts nobody could act on here, between
              Bill To and the lines. The fields this form actually USES from the
              KYC (address, GSTIN, place of supply) are still filled in above. */}
        </Section>

        {/* 3 — Service + lines ----------------------------------------- */}
        <Section
          title="Products &amp; services"
          hint="Choose Product or Service for each line. A document of services prints as Service Description / Total Amount Due."
        >
          {/* NO DOCUMENT-LEVEL SERVICE DESCRIPTION FIELD.
              Manan, 2026-09-16, against this textarea and its suggestion chips:
              "remove this — and below, the product/service has a description, so
              name that one Service Description and give it a dropdown."

              There were two descriptions on this form: one for the DOCUMENT,
              printed above the line table, and one per LINE. On the reference
              invoice there is only one — "Fees for Technical Services", sitting
              in the Service Description column of the table itself — so the
              document-level one was a second place to say the same thing, and
              whichever you filled in, the other stayed blank.

              The COLUMN is untouched: `serviceDescription` still exists on the
              document, is still optional, and still prints when set (the PDF
              suppresses it when it merely repeats a line name — see
              `showServiceDescription` in lib/billing/view-model.ts). Old
              documents that have one keep it. New ones simply do not collect it
              here; the line below is where the description is written now. */}

          <div className="space-y-3">
            {form.lines.map((line, i) => {
              const computed = computeLine(
                { ...line, gstRate: gstOn ? line.gstRate : 0 },
                gstMode,
              );
              return (
                <div key={line.key} className="rounded-[16px] p-3.5" style={READONLY}>
                  <div className="flex items-center justify-between gap-3 pb-2">
                    <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-muted">
                      Line {i + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeLine(i)}
                      disabled={form.lines.length <= 1}
                      aria-label={`Remove line ${i + 1}`}
                      className="rounded-chip p-1.5 text-ink-muted transition hover:text-[#DC2626] disabled:opacity-30"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>

                  {/* PRODUCT OR SERVICE — chosen first. Product lists ONLY the
                      product master; Service lists ONLY service descriptions
                      (the Service Description lookup list plus ones used
                      before). A line with a product already on it opens as
                      Product. */}
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-muted">
                      Select
                    </span>
                    {(["product", "service"] as const).map((k) => {
                      const on = lineKind(line) === k;
                      return (
                        <button
                          key={k}
                          type="button"
                          onClick={() => setLineKind(i, k)}
                          aria-pressed={on}
                          className="inline-flex h-8 items-center rounded-pill px-3.5 text-[12.5px] font-bold transition"
                          style={
                            on
                              ? { background: `linear-gradient(135deg, ${BILLING_PURPLE}, ${BILLING_PURPLE_DEEP})`, color: "#fff" }
                              : { boxShadow: "inset 0 0 0 1px var(--color-hairline)", color: "var(--color-ink-muted)" }
                          }
                        >
                          {k === "product" ? "Product" : "Service"}
                        </button>
                      );
                    })}
                  </div>

                  {lineKind(line) === "service" ? (
                    /* SERVICE — the service, then the same SAC · Quantity ·
                       Unit · Rate · Discount % · GST % row a product line has. */
                    <>
                      <Field label="Service">
                        <Select
                          options={serviceOptions.map((d) => ({ value: d, label: d }))}
                          value={serviceOptions.includes(line.description) ? line.description : ""}
                          onValueChange={(v) => pickService(i, v)}
                          placeholder={
                            serviceOptions.length === 0
                              ? "No service descriptions yet — type one on the line"
                              : "Search services…"
                          }
                          searchable
                          ariaLabel={`Service for line ${i + 1}`}
                        />
                      </Field>

                      <div
                        className={`mt-3 grid gap-3 max-lg:grid-cols-3 max-md:grid-cols-2 ${
                          gstAllowed ? "grid-cols-6" : "grid-cols-5"
                        }`}
                      >
                        <Field label="SAC">
                          <input
                            className={INPUT}
                            value={line.sacCode}
                            onChange={(e) => setLine(i, { sacCode: e.target.value })}
                            list="billing-sac-codes"
                            placeholder="e.g. 998311"
                          />
                        </Field>
                        <Field label="Quantity">
                          <input
                            className={`${INPUT} text-right tabular-nums`}
                            inputMode="decimal"
                            value={line.quantity}
                            onChange={(e) => setLine(i, { quantity: e.target.value })}
                            placeholder="1"
                          />
                        </Field>
                        <Field label="Unit">
                          <input
                            className={INPUT}
                            value={line.unit}
                            onChange={(e) => setLine(i, { unit: e.target.value })}
                            placeholder="e.g. nos"
                          />
                        </Field>
                        <Field label="Rate">
                          <input
                            className={`${INPUT} text-right tabular-nums`}
                            inputMode="decimal"
                            value={line.rate}
                            onChange={(e) => setLine(i, { rate: e.target.value })}
                            placeholder="0.00"
                          />
                        </Field>
                        <Field label="Discount %">
                          <input
                            className={`${INPUT} text-right tabular-nums`}
                            inputMode="decimal"
                            value={line.discountPct}
                            onChange={(e) => setLine(i, { discountPct: e.target.value })}
                            placeholder="0"
                          />
                        </Field>
                        {gstAllowed ? (
                          <Field label="GST %">
                            <input
                              className={`${INPUT} text-right tabular-nums`}
                              inputMode="decimal"
                              value={line.gstRate}
                              onChange={(e) => setLine(i, { gstRate: e.target.value })}
                              disabled={!form.gstApplicable}
                              placeholder="18"
                            />
                          </Field>
                        ) : null}
                      </div>
                    </>
                  ) : (
                    <>
                      {/* PRODUCT — pick from the product master, then the fields
                          in the order they are read: Product code, Product name,
                          Product description, SAC, Quantity, Unit, Rate,
                          Discount %, GST %. Picking fills them; all stay
                          editable for this one document. */}
                      <Field label="Product">
                        <Select
                          options={products.map((p) => ({
                            value: p.id,
                            label: p.code ? `${p.code} · ${productFullName(p)}` : productFullName(p),
                          }))}
                          value={line.productId ?? ""}
                          onValueChange={(v) => pickProduct(i, v || null)}
                          placeholder={products.length === 0 ? "No products in the product master" : "Search products…"}
                          searchable
                          ariaLabel={`Product for line ${i + 1}`}
                        />
                      </Field>

                      <div className="mt-3 grid grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)_minmax(0,2fr)] gap-3 max-md:grid-cols-1">
                        <Field label="Product code">
                          <input
                            className={INPUT}
                            value={line.code}
                            onChange={(e) => setLine(i, { code: e.target.value })}
                            placeholder="e.g. P90"
                          />
                        </Field>
                        <Field label="Product name">
                          <input
                            className={INPUT}
                            value={line.name}
                            onChange={(e) => setLine(i, { name: e.target.value })}
                            placeholder="Product name"
                          />
                        </Field>
                        <Field label="Product description">
                          <input
                            className={INPUT}
                            value={line.description}
                            onChange={(e) => setLine(i, { description: e.target.value })}
                            // Suggestions from the product master; still free text.
                            list="billing-product-descriptions"
                            placeholder="Product description"
                          />
                        </Field>
                      </div>

                      <div
                        className={`mt-3 grid gap-3 max-lg:grid-cols-3 max-md:grid-cols-2 ${
                          gstAllowed ? "grid-cols-6" : "grid-cols-5"
                        }`}
                      >
                        <Field label="SAC">
                          <input
                            className={INPUT}
                            value={line.sacCode}
                            onChange={(e) => setLine(i, { sacCode: e.target.value })}
                            list="billing-sac-codes"
                            placeholder="e.g. 998311"
                          />
                        </Field>
                        <Field label="Quantity">
                          <input
                            className={`${INPUT} text-right tabular-nums`}
                            inputMode="decimal"
                            value={line.quantity}
                            onChange={(e) => setLine(i, { quantity: e.target.value })}
                            placeholder="1"
                          />
                        </Field>
                        <Field label="Unit">
                          <input
                            className={INPUT}
                            value={line.unit}
                            onChange={(e) => setLine(i, { unit: e.target.value })}
                            placeholder="e.g. nos"
                          />
                        </Field>
                        <Field label="Rate">
                          <input
                            className={`${INPUT} text-right tabular-nums`}
                            inputMode="decimal"
                            value={line.rate}
                            onChange={(e) => setLine(i, { rate: e.target.value })}
                            placeholder="0.00"
                          />
                        </Field>
                        <Field label="Discount %">
                          <input
                            className={`${INPUT} text-right tabular-nums`}
                            inputMode="decimal"
                            value={line.discountPct}
                            onChange={(e) => setLine(i, { discountPct: e.target.value })}
                            placeholder="0"
                          />
                        </Field>
                        {gstAllowed ? (
                          <Field label="GST %">
                            <input
                              className={`${INPUT} text-right tabular-nums`}
                              inputMode="decimal"
                              value={line.gstRate}
                              onChange={(e) => setLine(i, { gstRate: e.target.value })}
                              disabled={!form.gstApplicable}
                              placeholder="18"
                            />
                          </Field>
                        ) : null}
                      </div>
                    </>
                  )}

                  <div className="mt-3 flex items-baseline justify-end gap-3 text-[13px]">
                    <span className="text-ink-muted">Line amount</span>
                    <span className="text-[15px] font-black tabular-nums">{fmtMoney(computed.amount)}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Product Description suggestions — the product master's own
              descriptions and names; the field stays free text. */}
          <datalist id="billing-product-descriptions">
            {[
              ...new Set(
                products
                  .flatMap((p) => [p.description ?? "", p.name])
                  .map((v) => v.trim())
                  .filter(Boolean),
              ),
            ].map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>

          <datalist id="billing-sac-codes">
            {sacCodes.map((s) => (
              <option key={s.id} value={s.code}>
                {s.description}
              </option>
            ))}
          </datalist>

          <button
            type="button"
            onClick={addLine}
            className="inline-flex items-center gap-1.5 rounded-chip px-3 py-2 text-[13px] font-bold text-ink-muted"
            style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
          >
            <Plus size={15} /> Add item
          </button>
        </Section>

        {/* 4 — Tax ----------------------------------------------------- */}
        <Section title="Tax" hint="Intra-state versus inter-state is derived — never typed.">
          {gstAllowed ? (
            <>
            <div className="flex flex-wrap items-center gap-4">
              <Toggle
                checked={form.gstApplicable}
                onChange={(v) => set("gstApplicable", v)}
                label="GST applicable"
              />
              <Toggle
                checked={form.isReverseCharge}
                onChange={(v) => set("isReverseCharge", v)}
                label="Reverse charge"
              />
              <Toggle
                checked={form.isExempt}
                onChange={(v) => set("isExempt", v)}
                label="Exempt / zero-rated"
              />
              <span
                className="rounded-pill px-3 py-1 text-[12px] font-bold"
                style={{ background: "#FEE2E2", color: "#7F1D1D", boxShadow: "inset 0 0 0 1px #FCA5A5" }}
              >
                {gstModeLabel(gstMode, totals.rates)}
              </span>
            </div>
            {form.gstApplicable && !seller?.gstin ? (
              <Note tone="warn">
                {seller ? seller.legalName : "This entity"} has no GSTIN configured, so no GST can be
                charged. Add one in Admin › Billing Profiles.
              </Note>
            ) : null}
            </>
          ) : (
            <Note tone="info">
              GST applies only when the issuing company is Altus Corp or Colour Graphics.{" "}
              {entities.find((e) => e.id === form.entityId)?.label ?? "This entity"} issues without
              any GST details — no GST is charged on this document.
            </Note>
          )}
        </Section>

        {/* 5 — Payment + remarks --------------------------------------- */}
        <Section title="Payment &amp; remarks">
          <div className="grid grid-cols-3 gap-4 max-md:grid-cols-1">
            <Field label="Payment terms">
              <Select
                options={[
                  { value: "", label: "Custom / none" },
                  ...terms.map((t) => ({ value: t.id, label: t.label })),
                ]}
                value={form.paymentTermsId ?? ""}
                onValueChange={(v) => pickTerm(v || null)}
                ariaLabel="Payment terms"
              />
            </Field>
            <Field label="Terms as printed" hint="Overrides the label above.">
              <input
                className={INPUT}
                value={form.paymentTermsLabel}
                onChange={(e) => set("paymentTermsLabel", e.target.value)}
                placeholder="Immediate"
              />
            </Field>
            <Field label="Due date">
              <DateField
                value={form.dueDate}
                onChange={(e) => set("dueDate", e.target.value)}
                className={INPUT}
              />
            </Field>
          </div>
          {/* THE BOX LABELS ARE THE PRINTED LABELS. A second note prints as
              "Note 2 :", so the box that holds it says Note 2 — the old
              "Extra remark 1" heading named the same text two different ways
              and left you counting to work out which box became which note. */}
          <Field
            label={remarkCount > 1 ? "Note 1" : "Note"}
            hint="Optional. Printed on the document when provided."
          >
            <DictateTextarea
              rows={3}
              value={remarkParts[0] ?? ""}
              onChange={(v) => setRemarkPart(0, v)}
              placeholder="Anything to print on the document"
              className={`${INPUT} h-auto min-h-[72px] py-2`}
            />
          </Field>
          {remarkParts.slice(1).map((r, k) => (
            <div key={k} className="relative">
              <Field label={`Note ${k + 2}`}>
                <DictateTextarea
                  rows={2}
                  value={r}
                  onChange={(v) => setRemarkPart(k + 1, v)}
                  placeholder="Another remark"
                  className={`${INPUT} h-auto min-h-[60px] py-2`}
                />
              </Field>
              <button
                type="button"
                onClick={() => removeRemarkPart(k + 1)}
                aria-label={`Remove note ${k + 2}`}
                className="absolute right-0 top-0 rounded-chip p-1 text-ink-muted hover:text-[#DC2626]"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setRemarkParts((p) => [...p, ""])}
            className="inline-flex items-center gap-1.5 self-start rounded-chip px-3 py-2 text-[13px] font-bold text-ink-muted"
            style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
          >
            <Plus size={15} /> Add note
          </button>
        </Section>

        {/* 6 — Company details (read-only) ----------------------------- */}
        <Section
          title="Company details"
          hint="From the Admin Panel — logo, PAN, GSTIN, bank and signatory. Never typed here."
        >
          {seller ? (
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-[12.5px] max-md:grid-cols-1">
              <div className="col-span-2 flex items-center gap-3 max-md:col-span-1">
                {seller.logoUrl ? (
                  <Image
                    src={seller.logoUrl}
                    alt=""
                    width={96}
                    height={40}
                    className="h-10 w-auto object-contain"
                    unoptimized
                  />
                ) : null}
                <span className="font-black">{seller.legalName}</span>
              </div>
              <ReadRow label="PAN" value={seller.pan} />
              <ReadRow label="GSTIN" value={seller.gstin} />
              <ReadRow label="State" value={seller.stateName} />
              <ReadRow label="Address" value={seller.addressLine} />
              <ReadRow label="Email" value={seller.email} />
              <ReadRow label="Bank" value={seller.bankName} />
              <ReadRow label="Account" value={seller.bankAccountNo} />
              <ReadRow label="IFSC" value={seller.bankIfsc} />
              <ReadRow label="Signatory" value={seller.signatoryName} />
            </div>
          ) : null}
          <Link
            href={"/admin/billing-profiles" as Route}
            className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-ink-muted underline underline-offset-4"
          >
            Edit in Admin Panel <ExternalLink size={13} />
          </Link>
          {taxInvoiceBlocked ? (
            <Note tone="warn">
              A tax invoice cannot be generated without a GSTIN for this entity. You can still save a
              draft.
            </Note>
          ) : null}
        </Section>
      </div>

      {/* Totals panel ---------------------------------------------------- */}
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="rounded-[22px] p-5" style={CARD_STYLE}>
          <h3 className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink-muted">Totals</h3>
          <dl className="mt-3 space-y-2 text-[13px]">
            <TotalRow label="Subtotal" value={fmtMoney(totals.subtotal)} />
            {totals.discountTotal > 0 ? (
              <TotalRow label="Discount" value={`− ${fmtMoney(totals.discountTotal)}`} />
            ) : null}
            <TotalRow label="Taxable value" value={fmtMoney(totals.taxableValue)} />
            {gstMode === "cgst_sgst" ? (
              <>
                <TotalRow label="CGST" value={fmtMoney(totals.cgstAmount)} />
                <TotalRow label="SGST" value={fmtMoney(totals.sgstAmount)} />
              </>
            ) : null}
            {gstMode === "igst" ? <TotalRow label="IGST" value={fmtMoney(totals.igstAmount)} /> : null}
            {totals.roundOff !== 0 ? (
              <TotalRow label="Round off" value={fmtMoney(totals.roundOff)} />
            ) : null}
          </dl>
          <div className="mt-3 border-t border-hairline pt-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[12px] font-bold uppercase tracking-[0.12em] text-ink-muted">
                Total
              </span>
              <span
                className="text-[22px] font-black tabular-nums"
                style={{ fontFamily: "var(--font-display), system-ui, sans-serif" }}
              >
                {rupees(totals.total)}
              </span>
            </div>
          </div>

          {error ? <Note tone="warn">{error}</Note> : null}

          <div className="mt-4 space-y-2">
            <Button
              className="w-full"
              onClick={() => void submit("generate")}
              disabled={busy !== null}
              style={{ background: `linear-gradient(135deg, ${BILLING_PURPLE}, ${BILLING_PURPLE_DEEP})` }}
            >
              {busy === "generate" ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
              Generate {BILLING_DOC_TYPE_LABELS[form.docType].toLowerCase()}
            </Button>
            <button
              type="button"
              onClick={() => void submit("draft")}
              disabled={busy !== null}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-chip text-[13px] font-bold text-ink-muted disabled:opacity-50"
              style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
            >
              {busy === "draft" ? <Loader2 size={15} className="animate-spin" /> : null}
              Save draft
            </button>
          </div>
          <p className="mt-2 text-[11.5px] text-ink-muted">
            A number is allocated only when the document is generated — a draft never burns one.
          </p>
        </div>
      </aside>
    </div>
  );
}

/* ── Small building blocks ──────────────────────────────────────────────── */

const INPUT =
  "h-10 w-full rounded-chip border border-hairline bg-white px-3 text-[13px] text-ink-strong outline-none transition focus:border-[color:var(--color-altus-red)]";

const READONLY: React.CSSProperties = {
  background: "rgba(248,250,252,0.85)",
  boxShadow: "inset 0 0 0 1px var(--color-hairline)",
};

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[22px] p-5 max-md:p-4" style={CARD_STYLE}>
      <header className="mb-4">
        <h2
          className="text-[15px] font-black text-ink-strong"
          style={{ fontFamily: "var(--font-display), system-ui, sans-serif" }}
        >
          {title}
        </h2>
        {hint ? <p className="mt-0.5 text-[12.5px] text-ink-muted">{hint}</p> : null}
      </header>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.12em] text-ink-muted">
        {label}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-[11.5px] text-ink-muted">{hint}</span> : null}
    </label>
  );
}

function ReadRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex gap-2">
      <span className="w-[86px] shrink-0 text-ink-muted">{label}</span>
      <span className="min-w-0 break-words font-semibold">{value ?? "—"}</span>
    </div>
  );
}

function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-[13px] font-semibold text-ink-strong">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-[color:var(--color-altus-red)]"
      />
      {label}
    </label>
  );
}

function Note({ tone, children }: { tone: "info" | "warn"; children: React.ReactNode }) {
  const style =
    tone === "warn"
      ? { background: "#FFEDD5", color: "#431407", boxShadow: "inset 0 0 0 1px #FDBA74" }
      : { background: "#E0E7FF", color: "#1E1B4B", boxShadow: "inset 0 0 0 1px #C7D2FE" };
  return (
    <p
      className="mt-2 flex items-start gap-2 rounded-[14px] px-3 py-2 text-[12.5px] font-semibold"
      style={style}
    >
      {tone === "warn" ? <AlertTriangle size={14} className="mt-[2px] shrink-0" /> : null}
      <span>{children}</span>
    </p>
  );
}
