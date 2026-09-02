/**
 * Quarter helpers for KPI Management. PURE + CLIENT-SAFE. A quarter label is
 * "YYYY-Qn" (calendar quarters: Q1 Jan–Mar … Q4 Oct–Dec).
 */

export function quarterOf(date: Date = new Date()): string {
  const y = date.getFullYear();
  const q = Math.floor(date.getMonth() / 3) + 1;
  return `${y}-Q${q}`;
}

/** The current quarter label. */
export function currentQuarter(): string {
  return quarterOf(new Date());
}

/** Validate a "YYYY-Qn" label. */
export function isQuarterLabel(s: string): boolean {
  return /^\d{4}-Q[1-4]$/.test(s);
}

/**
 * A window of quarter labels around the current one — `back` quarters behind
 * and `fwd` ahead — newest first. Powers the quarter selector.
 */
export function quarterWindow(back = 4, fwd = 2, from: Date = new Date()): string[] {
  const baseYear = from.getFullYear();
  const baseIdx = baseYear * 4 + Math.floor(from.getMonth() / 3); // 0-based quarter index
  const out: string[] = [];
  for (let i = fwd; i >= -back; i--) {
    const idx = baseIdx + i;
    const y = Math.floor(idx / 4);
    const q = (idx % 4) + 1;
    out.push(`${y}-Q${q}`);
  }
  return out;
}
