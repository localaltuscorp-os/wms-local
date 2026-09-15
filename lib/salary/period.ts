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

/** Calendar days in a YYYY-MM month. 28 | 29 | 30 | 31 — never assumed. */
export function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** The company timezone every salary month is reckoned in. */
export const SALARY_TZ = "Asia/Kolkata";

/**
 * "Today" in the company's timezone, as YYYY-MM-DD.
 *
 * Salary months, attendance days and the elapsed-day bound are all IST facts.
 * Reading them off the server's local clock (`now.getFullYear()`) put a
 * UTC-hosted deployment on the wrong day for five and a half hours out of every
 * twenty-four, and on the wrong MONTH for that window on the 1st.
 */
export function todayKeyOf(now: Date = new Date()): string {
  // en-CA yields YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SALARY_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** The month currently in progress (YYYY-MM), in the company's timezone. */
export function currentMonthKeyOf(now: Date = new Date()): string {
  return todayKeyOf(now).slice(0, 7);
}

/**
 * Every month a dated change touches, in order, de-duplicated.
 *
 * A leave, a remote-work block or an attendance correction can span a month
 * boundary, and BOTH months' pay moves. Returning the set rather than a single
 * month is what stops the second one being silently left stale (spec §11).
 *
 * Pure month arithmetic, so it lives here rather than beside the writer that
 * consumes it — a test should not have to load the database layer to assert
 * that August-to-September is two months.
 */
export function monthsSpanned(startYmd: string, endYmd: string): string[] {
  const from = startYmd.slice(0, 7);
  const to = endYmd.slice(0, 7);
  if (from > to) return [];
  const out: string[] = [];
  let [y, m] = from.split("-").map(Number) as [number, number];
  // Bounded rather than `while (true)`: a malformed date cannot spin here.
  for (let guard = 0; guard < 120; guard++) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    out.push(key);
    if (key >= to) break;
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
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
