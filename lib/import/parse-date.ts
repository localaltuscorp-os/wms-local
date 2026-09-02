/**
 * Parse a legacy 'yyyy-mm-dd' string as Asia/Kolkata midnight, so the
 * imported created_at / due_at reflect IST calendar dates, not UTC.
 *
 * Without this, `new Date("2025-11-04")` parses as UTC midnight, which
 * renders as 2025-11-03 in IST (UTC+5:30) — every date in every view
 * would shift back one calendar day.
 *
 * Falls back to the native `Date` constructor for any other input shape
 * (full ISO strings with explicit offsets, etc.) — the caller is
 * expected to validate the result with `isNaN(d.getTime())`.
 */
export function parseLegacyDate(raw: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) {
    return new Date(`${raw.trim()}T00:00:00+05:30`);
  }
  return new Date(raw);
}
