// Pure period helpers for the salary module. No DB. The canonical `month`
// string is "YYYY-MM" (e.g. "2026-04"); everything keys on it.

/** Financial-year label for a YYYY-MM month (Apr–Mar). "2026-04" → "FY 26-27". */
export function fyForMonth(month: string): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const startYear = m >= 4 ? y : y - 1; // Jan–Mar belong to the prior FY
  const a = String(startYear % 100).padStart(2, "0");
  const b = String((startYear + 1) % 100).padStart(2, "0");
  return `FY ${a}-${b}`;
}

/** Calendar days in a YYYY-MM month. */
export function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Human label "Apr 2026" for a YYYY-MM month. */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-IN", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
