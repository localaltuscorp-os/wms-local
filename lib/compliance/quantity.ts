/**
 * WCC / MCC — HOW MANY, FOR A COMPLIANCE THAT COUNTS (account holder,
 * 2026-09-19).
 *
 * PURE and client-safe: the table, the server action and the reports all read
 * these, so a compliance can never count on one screen and not on another.
 *
 * ── WHICH COMPLIANCES COUNT ──────────────────────────────────────────────
 * One whose target is MORE THAN ONE. "Send 25 emails" asks, when it is marked
 * Done, how many were actually sent — 18 of 25, say. "Send the update to Manan
 * Sir" or "Make 1 call" is simply Done: nothing more is asked.
 *
 * The target comes from, in order:
 *   1. the compliance's own Target (dcc_kpi_items.target_number, with its unit)
 *      — what the DCC Masters and the WCC/MCC pop-up set. When it is set it is
 *      the answer, even when it is 1: that is how a title with a number in it
 *      that is not a count is told to stop asking.
 *   2. otherwise, the number in the title — "Send 25 emails" → 25. Read
 *      cautiously: "before 9:45 am", "by 5 pm", "Rs 500", "within 24 hours",
 *      "GSTR-2B" and "20th" are not counts, and a title with two counts in it
 *      ("25 emails and 10 calls") is too ambiguous to guess — both need a Target.
 *
 * ── WHAT IS RECORDED ─────────────────────────────────────────────────────
 * dcc_entries.completed_quantity (migration 0239): a whole number, 0 or more,
 * set with Done and cleared when the fill leaves Done. The same number goes to
 * dcc_entries.value_number, DCC's own "value", which the 10 pm DCC report and
 * the Android app read — and a fill recorded only there (the old DCC board, the
 * app) still reads here through `completedQuantityOf`.
 */

/** The most anybody can report completing — a typo guard, far above any real target. */
export const MAX_QUANTITY = 1_000_000;

export interface QuantityTarget {
  /** Always more than one — a target of one is not tracked. */
  target: number;
  unit: string | null;
  /** Where the target came from: the compliance's own Target, or its title. */
  source: "target" | "title";
}

/** Words after a number that make it a time, a date, money or a share — not a count. */
const NOT_A_COUNT_AFTER = new Set([
  "am", "pm", "a.m", "p.m", "o'clock", "oclock",
  "h", "hr", "hrs", "hour", "hours", "min", "mins", "minute", "minutes", "sec", "secs", "second", "seconds",
  "day", "days", "week", "weeks", "month", "months", "year", "years", "yr", "yrs",
  "jan", "january", "feb", "february", "mar", "march", "apr", "april", "may", "jun", "june", "jul", "july",
  "aug", "august", "sep", "sept", "september", "oct", "october", "nov", "november", "dec", "december",
  "percent", "pct", "rs", "inr", "rupee", "rupees", "k", "lakh", "lakhs", "lac", "lacs", "crore", "crores", "cr",
]);

/** Words before a number that make it a time, a date, a label or money. */
const NOT_A_COUNT_BEFORE = new Set([
  "by", "at", "before", "after", "till", "until", "on", "within", "from", "to", "upto",
  "rs", "inr", "no", "q", "v", "version", "step", "level", "phase", "round", "sprint", "batch", "chapter",
  "section", "floor", "room", "gate", "plot", "flat", "day", "week", "month", "year",
]);

const word = (s: string | undefined) => (s ?? "").toLowerCase().replace(/^[^a-z]+|[^a-z']+$/g, "");

/**
 * The count a title asks for — "Send 25 emails" → 25 — or null when it asks for
 * none, or for more than one thing and so cannot be read without a guess.
 */
export function targetFromTitle(title: string | null | undefined): number | null {
  if (!title) return null;
  // A standalone whole number (not part of 9:45, 2.5, 1,000, GSTR-2B, ₹500 or
  // #3) followed by a word.
  const re = /(?<![\w.:/,₹$#-])(\d{1,6})(?![\w.:/,%-])\s+([A-Za-z][\w'.-]*)/g;
  const found: number[] = [];
  for (const m of title.matchAll(re)) {
    const after = word(m[2]);
    const before = word(title.slice(0, m.index).trim().split(/\s+/).pop());
    if (NOT_A_COUNT_AFTER.has(after) || NOT_A_COUNT_BEFORE.has(before)) continue;
    found.push(Number(m[1]));
  }
  return found.length === 1 ? found[0]! : null;
}

/**
 * The target a compliance counts towards, or null when it does not count — no
 * target, a target of one, or a Target that is not a whole number (2.5 hours
 * is measured, not counted).
 */
export function quantityTargetOf(item: {
  title: string;
  targetNumber?: string | number | null;
  unit?: string | null;
}): QuantityTarget | null {
  const own = item.targetNumber;
  if (own !== null && own !== undefined && String(own).trim() !== "") {
    const n = Number(own);
    if (!Number.isInteger(n) || n <= 1 || n > MAX_QUANTITY) return null;
    return { target: n, unit: item.unit?.trim() || null, source: "target" };
  }
  const n = targetFromTitle(item.title);
  return n !== null && n > 1 ? { target: n, unit: null, source: "title" } : null;
}

/** A value is a completed quantity only as a whole number from 0 to MAX_QUANTITY. */
export function isCompletedQuantity(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= MAX_QUANTITY;
}

/**
 * What the doer typed, checked — the pop-up's test, and the server's in words
 * a person can act on.
 */
export function checkQuantity(raw: string): { ok: true; value: number } | { ok: false; error: string } {
  const t = raw.trim();
  if (t === "") return { ok: false, error: "Enter how many were completed." };
  if (!/^\d+$/.test(t)) return { ok: false, error: "Enter a whole number — 0 or more." };
  const n = Number(t);
  if (!isCompletedQuantity(n)) return { ok: false, error: `That is more than ${MAX_QUANTITY.toLocaleString("en-IN")}.` };
  return { ok: true, value: n };
}

/**
 * How many a fill records as completed — its own count, or, for a fill made on
 * the old DCC board or the Android app, the whole-number value it carries.
 */
export function completedQuantityOf(
  fill: { completedQuantity?: number | null; valueNumber?: string | number | null } | null | undefined,
): number | null {
  if (!fill) return null;
  if (isCompletedQuantity(fill.completedQuantity)) return fill.completedQuantity;
  const v = fill.valueNumber;
  if (v === null || v === undefined || String(v).trim() === "") return null;
  const n = Number(v);
  return isCompletedQuantity(n) ? n : null;
}

/** "18 / 25 emails". */
export function quantityText(completed: number | null, t: Pick<QuantityTarget, "target" | "unit">): string {
  return `${completed ?? "—"} / ${t.target}${t.unit ? ` ${t.unit}` : ""}`;
}
