/**
 * BILLING — the GST engine.
 *
 * PURE and client-safe. The SAME functions run in the form (live totals as you
 * type) and on the server (the authoritative recompute on save), which is the
 * whole point: a posted total is display state, never a number we store. The
 * server recomputes from the lines and the mode and writes its own figures.
 *
 * The one rule worth restating: GST is DERIVED, never typed. The user says
 * whether GST applies and at what rate; intra-state vs inter-state comes from
 * the seller's state code against the place of supply, and CGST / SGST / IGST
 * are outputs of that.
 */

import type { BillingGstMode } from "@/db/enums";

/** Round half-up to 2dp, immune to the usual binary-float drift. */
export function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Parse money that arrived as a string (form field, numeric column). */
export function money(v: string | number | null | undefined): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (v === null || v === undefined) return 0;
  const n = Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

export interface LineInput {
  quantity: string | number;
  rate: string | number;
  /** Percentage discount off (qty × rate). Wins over `discountAmount`. */
  discountPct?: string | number | null;
  /** Flat discount off (qty × rate), used when no percentage is given. */
  discountAmount?: string | number | null;
  /** The full GST rate for the line — 18 means 18%, split 9/9 intra-state. */
  gstRate?: string | number | null;
}

export interface LineComputed {
  /** qty × rate, before any discount. */
  gross: number;
  discountAmount: number;
  /** gross − discount. This is the taxable value of the line. */
  amount: number;
  gstRate: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  /** amount + the line's taxes. */
  lineTotal: number;
}

export interface Totals {
  mode: BillingGstMode;
  /** Sum of every line's gross (before discount). */
  subtotal: number;
  discountTotal: number;
  /** Sum of every line's amount — what tax is charged on. */
  taxableValue: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  taxTotal: number;
  /** total − (taxable + tax). Explicit, never back-computed. */
  roundOff: number;
  /** The payable figure, rounded to the nearest rupee. */
  total: number;
  /** The distinct GST rates in play, for the "CGST @ 9%" style labels. */
  rates: number[];
}

/**
 * Which GST applies.
 *
 * A seller with no GSTIN cannot charge GST at all — that outranks everything
 * else, including the user's toggle, because an unregistered seller issuing a
 * taxed invoice is the one outcome nobody wants shipped.
 */
export function resolveGstMode(args: {
  sellerGstin: string | null | undefined;
  sellerStateCode: string | null | undefined;
  customerStateCode: string | null | undefined;
  gstApplicable: boolean;
  /** Registered but zero-rated — tax rows print at 0% with the exemption note. */
  exempt?: boolean;
}): BillingGstMode {
  const sellerRegistered = Boolean(args.sellerGstin?.trim());
  if (!sellerRegistered || !args.gstApplicable) return "none";
  if (args.exempt) return "exempt";

  const seller = (args.sellerStateCode ?? "").trim();
  const customer = (args.customerStateCode ?? "").trim();
  // An unknown place of supply is treated as inter-state: IGST is the safe
  // default, because charging CGST+SGST across a state line is the error that
  // cannot be corrected without a credit note.
  if (!seller || !customer) return "igst";
  return seller === customer ? "cgst_sgst" : "igst";
}

/** One line's money, in the order the rules read: gross → discount → tax. */
export function computeLine(line: LineInput, mode: BillingGstMode): LineComputed {
  const qty = money(line.quantity);
  const rate = money(line.rate);
  const gross = round2(qty * rate);

  const pct = line.discountPct === null || line.discountPct === undefined || line.discountPct === ""
    ? null
    : money(line.discountPct);
  const discountAmount =
    pct !== null && pct > 0
      ? round2((gross * pct) / 100)
      : Math.min(round2(money(line.discountAmount)), gross);

  const amount = round2(gross - discountAmount);
  const gstRate = mode === "none" || mode === "exempt" ? 0 : money(line.gstRate);
  const tax = round2((amount * gstRate) / 100);

  let cgstAmount = 0;
  let sgstAmount = 0;
  let igstAmount = 0;
  if (mode === "cgst_sgst") {
    cgstAmount = round2(tax / 2);
    // The remainder, not a second rounding — so the two halves always sum to
    // the tax exactly, even on an odd paisa.
    sgstAmount = round2(tax - cgstAmount);
  } else if (mode === "igst") {
    igstAmount = tax;
  }

  return {
    gross,
    discountAmount,
    amount,
    gstRate: mode === "none" ? 0 : money(line.gstRate),
    cgstAmount,
    sgstAmount,
    igstAmount,
    lineTotal: round2(amount + cgstAmount + sgstAmount + igstAmount),
  };
}

/** Sum the lines, then round the payable ONCE, into an explicit round-off. */
export function computeTotals(lines: LineInput[], mode: BillingGstMode): Totals {
  let subtotal = 0;
  let discountTotal = 0;
  let taxableValue = 0;
  let cgstAmount = 0;
  let sgstAmount = 0;
  let igstAmount = 0;
  const rates = new Set<number>();

  for (const line of lines) {
    const c = computeLine(line, mode);
    subtotal = round2(subtotal + c.gross);
    discountTotal = round2(discountTotal + c.discountAmount);
    taxableValue = round2(taxableValue + c.amount);
    cgstAmount = round2(cgstAmount + c.cgstAmount);
    sgstAmount = round2(sgstAmount + c.sgstAmount);
    igstAmount = round2(igstAmount + c.igstAmount);
    if (c.amount > 0 && c.gstRate > 0) rates.add(c.gstRate);
  }

  const taxTotal = round2(cgstAmount + sgstAmount + igstAmount);
  const beforeRounding = round2(taxableValue + taxTotal);
  const total = Math.round(beforeRounding);
  const roundOff = round2(total - beforeRounding);

  return {
    mode,
    subtotal,
    discountTotal,
    taxableValue,
    cgstAmount,
    sgstAmount,
    igstAmount,
    taxTotal,
    roundOff,
    total,
    rates: [...rates].sort((a, b) => a - b),
  };
}

/**
 * The tax rows a document actually prints.
 *
 * A non-GST document returns an EMPTY array — it prints no tax lines at all,
 * rather than a row of "CGST 0.00", which is the difference between a clean
 * document and one that looks like a mistake.
 */
export function taxRows(totals: Totals): { label: string; amount: number }[] {
  if (totals.mode === "none") return [];
  const rateLabel = totals.rates.length === 1 ? totals.rates[0]! : null;
  const half = rateLabel !== null ? rateLabel / 2 : null;

  if (totals.mode === "igst") {
    return [
      {
        label: rateLabel !== null ? `IGST @ ${fmtRate(rateLabel)}%` : "IGST",
        amount: totals.igstAmount,
      },
    ];
  }
  if (totals.mode === "exempt") {
    return [{ label: "GST (exempt) @ 0%", amount: 0 }];
  }
  return [
    { label: half !== null ? `CGST @ ${fmtRate(half)}%` : "CGST", amount: totals.cgstAmount },
    { label: half !== null ? `SGST @ ${fmtRate(half)}%` : "SGST", amount: totals.sgstAmount },
  ];
}

/** "9" not "9.00", "2.5" not "2.50" — rate labels read as people write them. */
export function fmtRate(rate: number): string {
  return String(round2(rate)).replace(/\.0+$/, "");
}

/** The badge under the GST toggle: what the user is about to charge, in words. */
export function gstModeLabel(mode: BillingGstMode, rates: number[]): string {
  const rate = rates.length === 1 ? rates[0]! : null;
  switch (mode) {
    case "cgst_sgst":
      return rate !== null
        ? `Intra-state — CGST ${fmtRate(rate / 2)}% + SGST ${fmtRate(rate / 2)}%`
        : "Intra-state — CGST + SGST";
    case "igst":
      return rate !== null ? `Inter-state — IGST ${fmtRate(rate)}%` : "Inter-state — IGST";
    case "exempt":
      return "GST exempt — zero-rated";
    case "none":
    default:
      return "No GST";
  }
}
