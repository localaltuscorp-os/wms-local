/**
 * Client-SAFE money helpers for the Accounts amount-grid sections (SIP, FNO).
 * Indian-format display + tolerant parsing of sheet-style strings ("1,25,000").
 */

/** Parse a sheet/input amount string to a number, or null when blank/invalid. */
export function parseAmount(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const s = raw.replace(/[,₹\s%]/g, "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** "125000" → "1,25,000" (Indian grouping). Blank for null. */
export function formatINR(n: number | null | undefined, decimals = false): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "";
  return n.toLocaleString("en-IN", {
    maximumFractionDigits: decimals ? 2 : 0,
    minimumFractionDigits: 0,
  });
}

/** Sum a list of nullable numbers (nulls = 0). */
export function sumAmounts(values: Array<number | null | undefined>): number {
  return values.reduce<number>((a, v) => a + (v ?? 0), 0);
}

/** value / base as a percentage string, e.g. "1.30%". Blank when base is 0/null. */
export function pctOf(value: number | null | undefined, base: number | null | undefined): string {
  if (!base || !Number.isFinite(base) || value === null || value === undefined) return "";
  return `${((value / base) * 100).toFixed(2)}%`;
}
