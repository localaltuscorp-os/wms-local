/**
 * Cascade math — the PURE dividers + numeric marshalling for the Y→Q→M→W cascade.
 *
 * Extracted from the server-only `lib/goals/cascade.ts` (design doc
 * docs/superpowers/specs/2026-07-19-goals-redesign-DESIGN.md §3.1) so the client
 * derive layer (`lib/goals/derive.ts`) and the server cascade engine share ONE
 * implementation. The two sides MUST round identically or optimistic and
 * persisted numbers drift — never fork these functions.
 *
 * PURE — no DB, no `server-only`, no React. Safe to import anywhere.
 */

/** numeric(14,2) columns round-trip as strings; parse at the boundary. */
export function parseNum(s: string | null): number | null {
  if (s == null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Serialise back to the numeric(14,2) string shape ("123.40"). */
export function toMoney(n: number | null): string | null {
  return n == null ? null : n.toFixed(2);
}

/** House rounding for cascade-divided targets: 2 decimal places. */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Quarter target = Year ÷ 4. */
export function divideYearToQuarter(target: number | null): number | null {
  return target == null ? null : round2(target / 4);
}

/** Month target = Quarter ÷ 3. */
export function divideQuarterToMonth(target: number | null): number | null {
  return target == null ? null : round2(target / 3);
}

/** Week target = Month ÷ (weeks the month owns, 4 or 5). */
export function divideMonthToWeek(target: number | null, weekCount: number): number | null {
  if (target == null) return null;
  const n = weekCount > 0 ? weekCount : 4;
  return round2(target / n);
}
