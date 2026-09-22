/** Client-safe display helpers for the Ambassadors UI. */
import { formatINR } from "@/lib/accounts/amounts";

/**
 * NO LONGER ABBREVIATES — kept only as a name the Ambassadors screens already
 * call (Manan, 2026-09-15: amounts show every digit, "Rs. 10,12,11,999").
 *
 * It used to round to "Rs. 12.5L" / "Rs. 3.4Cr" for the KPI tiles. That is the
 * form the brief rules out: a tile reading "Rs. 3.4Cr" cannot be reconciled
 * against anything, because the digits it is checked against are the ones it
 * dropped. The tiles are wider than the abbreviation needed them to be; the
 * figure is the point.
 *
 * Left as an alias rather than deleted so the ~10 call sites keep compiling and
 * there is exactly ONE money format in this module, not two that can drift.
 */
export function inrCompact(n: number | null | undefined): string {
  return inr(n);
}

/** Full Indian money, e.g. "Rs. 1,25,000". */
export function inr(n: number | null | undefined, decimals = false): string {
  if (n == null || !Number.isFinite(n)) return "Rs. 0";
  return `Rs. ${formatINR(n, decimals)}`;
}

/** A 0..1 ratio → "63%". */
export function pct(ratio: number | null | undefined): string {
  if (ratio == null || !Number.isFinite(ratio)) return "0%";
  return `${Math.round(ratio * 100)}%`;
}
