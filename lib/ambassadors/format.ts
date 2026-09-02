/** Client-safe display helpers for the Ambassadors UI. */
import { formatINR } from "@/lib/accounts/amounts";

/** Compact Indian money: 1250000 → "₹12.5L", 34000000 → "₹3.4Cr", 4200 → "₹4,200". */
export function inrCompact(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "₹0";
  const abs = Math.abs(n);
  if (abs >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(abs >= 1_00_00_00_000 ? 0 : 1)}Cr`;
  if (abs >= 1_00_000) return `₹${(n / 1_00_000).toFixed(abs >= 1_00_00_000 ? 0 : 1)}L`;
  if (abs >= 1_000) return `₹${(n / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}K`;
  return `₹${formatINR(n)}`;
}

/** Full Indian money with the ₹ symbol, e.g. "₹1,25,000". */
export function inr(n: number | null | undefined, decimals = false): string {
  return `₹${formatINR(n ?? 0, decimals)}`;
}

/** A 0..1 ratio → "63%". */
export function pct(ratio: number | null | undefined): string {
  if (ratio == null || !Number.isFinite(ratio)) return "0%";
  return `${Math.round(ratio * 100)}%`;
}
