/**
 * BILLING — the document form's state, and how a stored row becomes it.
 *
 * A PLAIN module on purpose. The form itself is a client component, and a
 * "use client" module exports functions that a server component may only render
 * or pass as props — never call. The three pages that open the form (new,
 * new-from-source, edit) all build its initial state on the server, so the
 * shapes and the blank-line factory have to live outside that boundary.
 */

import type { BillingDocType } from "@/db/enums";

/** One editable row in the line editor. */
export interface LineState {
  /** Stable React key. Not persisted — the row's identity, not the line's. */
  key: string;
  productId: string | null;
  code: string;
  name: string;
  description: string;
  sacCode: string;
  quantity: string;
  unit: string;
  rate: string;
  discountPct: string;
  discountAmount: string;
  gstRate: string;
}

/** Everything the create/edit form holds. Money stays as typed strings until
 *  the server parses it — a client float is never trusted. */
export interface DocumentFormState {
  id: string | null;
  docType: BillingDocType;
  entityId: string;
  docDate: string;
  dueDate: string;
  customerId: string | null;
  customerName: string;
  customerContactName: string;
  customerEmail: string;
  customerWhatsapp: string;
  customerGstin: string;
  placeOfSupplyCode: string;
  serviceDescription: string;
  sacCode: string;
  paymentTermsId: string | null;
  paymentTermsLabel: string;
  remarks: string;
  gstApplicable: boolean;
  isReverseCharge: boolean;
  isExempt: boolean;
  lines: LineState[];
  sourceDocumentId: string | null;
  sourceLabel: string | null;
}

/** A blank line, ready to type into. */
export function emptyLine(): LineState {
  return {
    key: Math.random().toString(36).slice(2),
    productId: null,
    code: "",
    name: "",
    description: "",
    sacCode: "",
    quantity: "1",
    unit: "",
    rate: "",
    discountPct: "",
    discountAmount: "",
    gstRate: "18",
  };
}

export interface StoredLineish {
  productId: string | null;
  code: string | null;
  name: string;
  description: string | null;
  sacCode: string | null;
  quantity: string;
  unit: string | null;
  rate: string;
  discountPct: string | null;
  discountAmount: string;
  gstRate: string;
}

/** A stored numeric(…) string back to what a person would have typed: "1", not
 *  "1.000"; "7500", not "7500.00". */
function plain(v: string | null | undefined): string {
  if (v === null || v === undefined || v === "") return "";
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : String(v);
}

export function toLineState(l: StoredLineish): LineState {
  return {
    key: Math.random().toString(36).slice(2),
    productId: l.productId,
    code: l.code ?? "",
    name: l.name,
    description: l.description ?? "",
    sacCode: l.sacCode ?? "",
    quantity: plain(l.quantity) || "1",
    unit: l.unit ?? "",
    rate: plain(l.rate),
    discountPct: plain(l.discountPct),
    discountAmount: plain(l.discountAmount),
    gstRate: plain(l.gstRate) || "0",
  };
}
