/**
 * BILLING — the module's shared visual vocabulary.
 *
 * Colours come from the app's existing status palette (`statusBadgeStyle` in
 * lib/format.ts); nothing here invents one. Keeping the mapping in a single
 * client-safe file is what stops the list, the detail header and the form from
 * each having their own idea of what "Sent" looks like.
 */

import type { CSSProperties } from "react";
import {
  BILLING_DOC_TYPE_LABELS,
  BILLING_DOC_STATUS_LABELS,
  type BillingDocStatus,
  type BillingDocType,
} from "@/db/enums";
import { statusBadgeStyle, type StatusBadgeStyle } from "@/lib/format";

/** The Billing room's accent, as already used by app/(app)/billing/page.tsx. */
export const BILLING_PURPLE = "#E10600";
export const BILLING_PURPLE_DEEP = "#A80400";

const DOC_TYPE_TOKEN: Record<BillingDocType, string> = {
  quotation: "slate",
  proforma_invoice: "amber",
  tax_invoice: "purple",
};

const STATUS_TOKEN: Record<BillingDocStatus, string> = {
  draft: "stone",
  generated: "blue",
  sent: "purple",
  paid: "green",
  converted: "brown",
  cancelled: "red",
};

export function docTypeStyle(type: BillingDocType): StatusBadgeStyle {
  return statusBadgeStyle(DOC_TYPE_TOKEN[type]);
}

export function docTypeLabel(type: BillingDocType): string {
  return BILLING_DOC_TYPE_LABELS[type];
}

/** Shorter chip text for a narrow table column. */
export function docTypeShort(type: BillingDocType): string {
  return type === "tax_invoice" ? "Tax Invoice" : type === "proforma_invoice" ? "Proforma" : "Quotation";
}

/**
 * The badge for a row. `Overdue` is derived here rather than stored — an issued,
 * unpaid document past its due date — so nothing has to be re-written when a
 * date simply passes.
 */
export function statusView(
  status: BillingDocStatus,
  isOverdue: boolean,
): { label: string; style: StatusBadgeStyle } {
  if (isOverdue && (status === "generated" || status === "sent")) {
    return { label: "Overdue", style: statusBadgeStyle("orange") };
  }
  return { label: BILLING_DOC_STATUS_LABELS[status], style: statusBadgeStyle(STATUS_TOKEN[status]) };
}

/** "Rs. 88,500.00" — the app spells the rupee out; the ₹ glyph is not in the
 *  PDF font, and the two surfaces are kept consistent on purpose. */
export function rupees(n: number): string {
  return `Rs. ${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * NO LONGER ABBREVIATES — the summary tiles print the whole figure.
 *
 * It rounded to "Rs. 4.2L" / "Rs. 1.25Cr". Dropped with every other
 * abbreviation on 2026-09-15: the tiles above a billing register are read
 * against the register, and a headline that has dropped four digits cannot be.
 * Kept as a name so the call sites compile; it is `rupees` without the paise.
 */
export function rupeesCompact(n: number): string {
  return `Rs. ${Math.round(n).toLocaleString("en-IN")}`;
}

/** The soft card the module uses everywhere — one definition, not twelve. */
export const CARD_STYLE: CSSProperties = {
  background: "rgba(255,255,255,0.78)",
  boxShadow:
    "inset 0 0 0 1px var(--color-hairline), inset 0 1px 0 rgba(255,255,255,0.85), 0 18px 44px -30px rgba(15,23,42,0.22)",
};
