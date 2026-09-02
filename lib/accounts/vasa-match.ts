/**
 * VASA FAMILY MATRIX — does a hand-entered cell agree with its counterpart?
 *
 * ── WHY A CELL IS NO LONGER AUTO-FILLED ────────────────────────────────────
 * The matrix records the same debt twice, once from each side: if MJV is owed
 * ₹26,19,630 by CMV, then CMV owes MJV the same amount. `saveVasaCell` used to
 * enforce that by writing the mirror itself — enter one side and the opposite
 * cell was overwritten with the negation.
 *
 * That made disagreement impossible to see, which is the opposite of what a
 * reconciliation sheet is for. Both sides are now typed by hand from each
 * party's own books, and this module decides whether they agree. Production
 * already holds twelve pairs that do not — off by paise, e.g. 26,19,630.00
 * against 26,19,630.22 — and every one of them was invisible before.
 *
 * ── COMPARED IN PAISE, ON PURPOSE ──────────────────────────────────────────
 * Amounts are `numeric(16,2)`, so two paise is a real difference and must show
 * red. Comparing the floats directly would also make 0.1 + 0.2 disagree with
 * 0.3, so both sides are rounded to whole paise first: exact at the precision
 * the column actually stores, and immune to binary-float noise.
 *
 * PURE — no React, no DB, no `server-only`. The grid renders this in the
 * browser and the PDF renders it in Node; one rule, so the emailed report can
 * never disagree with the screen it was read off.
 */

export type VasaCellState =
  /** Nothing entered here. */
  | "empty"
  /** Entered, but the opposite cell is blank — nothing to check it against. */
  | "unpaired"
  /** Entered and equal to the negation of the opposite cell. */
  | "match"
  /** Entered and NOT equal to the negation of the opposite cell. */
  | "mismatch";

/** Whole paise, so `numeric(16,2)` values compare exactly. */
function paise(n: number): number {
  return Math.round(n * 100);
}

/**
 * What the opposite cell implies THIS cell should be: its negation.
 * Null when the opposite cell is blank — an absent counterpart is not a claim
 * that this cell should be zero.
 */
export function vasaExpected(mirror: number | null): number | null {
  if (mirror === null || !Number.isFinite(mirror)) return null;
  // `|| 0` so a mirror of exactly 0 never yields the string "-0".
  return -mirror || 0;
}

/**
 * Compare one hand-entered cell against its counterpart.
 *
 * `value` and `mirror` are the two amounts as stored: (row → col) and
 * (col → row). Null means the cell is blank.
 */
export function vasaCellState(value: number | null, mirror: number | null): VasaCellState {
  if (value === null || !Number.isFinite(value)) return "empty";
  const expected = vasaExpected(mirror);
  if (expected === null) return "unpaired";
  return paise(value) === paise(expected) ? "match" : "mismatch";
}

/**
 * How far this cell is from what its counterpart implies, or null when there is
 * nothing to compare.
 *
 * Needed because the grid displays whole rupees: a pair differing by 22 paise
 * renders as two identical-looking figures, one green and one red. The
 * difference goes in the cell's hover text so the colour is never unexplained.
 */
export function vasaDelta(value: number | null, mirror: number | null): number | null {
  const expected = vasaExpected(mirror);
  if (value === null || expected === null || !Number.isFinite(value)) return null;
  return (paise(value) - paise(expected)) / 100;
}
