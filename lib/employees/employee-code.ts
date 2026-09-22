/**
 * EMPLOYEE CODES — the allocation rules, as pure functions.
 *
 * No database, no `server-only`, no request scope. The rules below are the ones
 * that were dictated rather than inferred, and they are the part most worth
 * testing exhaustively; a database mock should not be the price of doing so.
 * `lib/employees/code-registry.ts` holds the writes.
 *
 * ── THE SCHEME ─────────────────────────────────────────────────────────────
 * One letter per paying entity, then a dash, then a number from 101 up:
 *
 *     A = Altus Corp        A-101, A-102, …
 *     U = Unleashed         U-101, …
 *     K = Khushboo Shah     K-101, …
 *     M = MJV HUF           M-101, …
 *     J = JSV HUF           J-101, …
 *
 * INTERNS carry an "I" after the entity letter — UI-101, KI-101, MI-101,
 * JI-101, AI-101 — and that is a SEPARATE NUMBER SERIES from the entity's own.
 * UI-101 and U-101 are two different codes held by two different people; the
 * "I" is part of the prefix, not a decoration on it.
 *
 * ── TWO RULES THAT LOOK SMALL AND ARE NOT ──────────────────────────────────
 *
 * 1. A NUMBER IS NEVER REUSED. "Whoever leaves the organisation — that number
 *    cannot be given to any new person — it is permanently retired." So
 *    {@link nextSeq} is given every seq EVER ISSUED for a prefix, retired ones
 *    included, and returns one past the highest. It deliberately does not look
 *    for gaps: a gap is somebody who left, and filling it is the one thing this
 *    rule forbids.
 *
 * 2. CONFIRMATION MOVES SERIES, IT DOES NOT RENAME. "UI will become U — UI will
 *    be retired permanently." An intern confirmed into a job is issued the next
 *    free number in the entity's own series and their intern code is retired.
 *    UI-101 does NOT become U-101 — U-101 is somebody else, and even if it were
 *    free, rewriting the code in place would quietly free the UI number for
 *    reissue, which breaks rule 1.
 */

/** The lowest number any series starts at. */
export const FIRST_SEQ = 101;

/** The marker that makes a prefix an intern series. */
const INTERN_MARK = "I";

/**
 * A prefix is one or two letters: the entity letter, optionally followed by the
 * intern marker. Upper-case is canonical; input is normalised before matching.
 */
const PREFIX_RE = /^[A-Z]I?$/;

/** "A-101" / "UI-103". The dash is part of the format, not a separator to trim. */
const CODE_RE = /^([A-Z]I?)-(\d{1,9})$/;

export interface ParsedEmployeeCode {
  /** Upper-cased, e.g. "A" or "UI". */
  prefix: string;
  seq: number;
  /** The canonical rendering, which may differ from what was typed in case. */
  code: string;
}

/** Upper-case and trim. The canonical form of a prefix, or null if it is not one. */
export function normalizePrefix(raw: string | null | undefined): string | null {
  const v = raw?.trim().toUpperCase() ?? "";
  return v && PREFIX_RE.test(v) ? v : null;
}

/** Is this an intern series? "UI" yes, "U" no. */
export function isInternPrefix(prefix: string): boolean {
  const p = normalizePrefix(prefix);
  return !!p && p.length === 2 && p.endsWith(INTERN_MARK);
}

/**
 * The intern series for an entity letter. "U" → "UI".
 *
 * Idempotent: an already-intern prefix comes back unchanged, so calling this on
 * "UI" cannot produce "UII".
 */
export function internPrefix(prefix: string): string | null {
  const p = normalizePrefix(prefix);
  if (!p) return null;
  return isInternPrefix(p) ? p : `${p}${INTERN_MARK}`;
}

/**
 * The entity series an intern series confirms INTO. "UI" → "U".
 *
 * Also idempotent, and returns the prefix unchanged for a non-intern series —
 * confirming somebody who is already on the entity series is a no-op rather
 * than an error, which is what makes the conversion safe to retry.
 */
export function confirmedPrefix(prefix: string): string | null {
  const p = normalizePrefix(prefix);
  if (!p) return null;
  return isInternPrefix(p) ? p.slice(0, 1) : p;
}

/** "A" + 101 → "A-101". Returns null for a prefix that is not one. */
export function formatEmployeeCode(prefix: string, seq: number): string | null {
  const p = normalizePrefix(prefix);
  if (!p) return null;
  if (!Number.isInteger(seq) || seq < 0) return null;
  return `${p}-${seq}`;
}

/** "a-101" → { prefix: "A", seq: 101, code: "A-101" }. Null if unparseable. */
export function parseEmployeeCode(raw: string | null | undefined): ParsedEmployeeCode | null {
  const v = raw?.trim().toUpperCase() ?? "";
  const m = CODE_RE.exec(v);
  if (!m) return null;
  const prefix = m[1]!;
  const seq = Number(m[2]);
  if (!Number.isSafeInteger(seq)) return null;
  return { prefix, seq, code: `${prefix}-${seq}` };
}

/**
 * The next number to issue in a series, given every number ever issued in it.
 *
 * ── WHY IT DOES NOT FILL GAPS ──────────────────────────────────────────────
 * A gap is a retired number — somebody who left. Filling it is precisely the
 * thing the retirement rule forbids, so `max + 1` is not a simplification here,
 * it IS the rule. Pass RETIRED SEQUENCES TOO; passing only the live ones would
 * reissue a leaver's number the first time anybody left.
 *
 * An empty series starts at {@link FIRST_SEQ}. Numbers below it (a hand-entered
 * legacy code, say) do not drag the series backwards.
 */
export function nextSeq(existingSeqs: readonly number[]): number {
  let max = FIRST_SEQ - 1;
  for (const n of existingSeqs) {
    if (Number.isSafeInteger(n) && n > max) max = n;
  }
  return max + 1;
}

/**
 * The prefix to SUGGEST for an employee, from their entity and whether they are
 * an intern. A suggestion only — the allocator takes an explicit prefix, because
 * most of the roster has no paying entity set yet and a screen that could not
 * issue a code until that data was cleaned up would be useless on day one.
 *
 * Returns null when the entity has no letter assigned, which is the honest
 * answer rather than a guess: two entities currently carry a Khushboo name, and
 * which of them owns "K" is an administrator's decision.
 */
export function suggestPrefix(input: {
  entityCodePrefix: string | null | undefined;
  isIntern: boolean;
}): string | null {
  const base = normalizePrefix(input.entityCodePrefix);
  if (!base) return null;
  // `confirmedPrefix` first, so an entity mistakenly configured with "UI"
  // still yields "UI" for an intern and "U" for everybody else.
  const entity = confirmedPrefix(base)!;
  return input.isIntern ? internPrefix(entity) : entity;
}

/**
 * Does this designation name mean "intern"?
 *
 * A heuristic, used ONLY to pre-select the intern checkbox on the issue form —
 * never to decide a code on its own. The roster's designation list carries a
 * literal "Intern", and "Trainee" is the other word the same idea arrives under.
 */
export function looksLikeInternDesignation(designation: string | null | undefined): boolean {
  const d = designation?.trim().toLowerCase() ?? "";
  return /\b(intern|trainee|apprentice)\b/.test(d);
}
