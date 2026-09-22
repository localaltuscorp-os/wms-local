/**
 * SPLIT INCENTIVE — the pure rules.
 *
 * Shared by the New Incentive Request dialog (live total, inline messages) and
 * `lib/incentive/prepare-request.ts`, which both server entry points — the web
 * action and POST /api/mobile/incentive — run before inserting. One set of
 * rules, so the browser can never accept a split the server would refuse.
 * Client-safe: no server-only imports.
 *
 * ── WHY BASIS POINTS ───────────────────────────────────────────────────────
 * Every total is computed in hundredths of a percent (10 000 = 100%). Summing
 * floats is how 33.33 + 33.33 + 33.34 becomes 99.99999999999999 and a correct
 * split gets rejected. Shares may carry at most two decimals, so a share is
 * always a whole number of basis points and the total is exact.
 *
 * ── WHAT A SPLIT IS NOT ────────────────────────────────────────────────────
 * It records who shares the incentive and in what proportion. It does not
 * compute or pay anyone's amount — that remains with Approval and Accounts,
 * which were deliberately left unchanged in this brief.
 */

export const MIN_SPLIT_PEOPLE = 2;
export const MAX_SPLIT_PEOPLE = 5;
/** 100%, in basis points. */
export const FULL_SPLIT_BP = 10_000;

/** One share as submitted: who, and what percentage (≤ 2 decimals). */
export interface SplitShareInput {
  employeeId: string;
  pct: number;
}

/** One share as stored on `incentive_requests.split` — the name is snapshotted
 *  from the employee row at submission so the request keeps reading correctly
 *  if that person is later renamed or leaves. */
export interface IncentiveSplitShare extends SplitShareInput {
  name: string;
}

/** A row while it is being edited: the percentage may not parse yet. */
export interface SplitRowDraft {
  employeeId: string;
  pct: number | null;
}

/** Why a single percentage is unusable, or null when it is fine. */
export function pctIssue(pct: number | null): string | null {
  if (pct === null || typeof pct !== "number" || !Number.isFinite(pct)) {
    return "Enter a share for every person in the split.";
  }
  if (pct < 0) return "Shares cannot be negative.";
  if (pct === 0) return "Every share must be more than 0%.";
  if (pct > 100) return "A share cannot be more than 100%.";
  if (Math.abs(pct * 100 - Math.round(pct * 100)) > 1e-6) {
    return "Use at most 2 decimal places for a share.";
  }
  return null;
}

/** pct → basis points; null when the percentage is not usable. */
export function pctToBasisPoints(pct: number | null): number | null {
  return pctIssue(pct) === null ? Math.round((pct as number) * 100) : null;
}

/**
 * Equal shares for `n` people, in basis points, summing to exactly 10 000.
 *
 * The indivisible remainder goes to the first rows, one basis point each, so
 * 3 people are 33.34 / 33.33 / 33.33 — never three 33.33s that total 99.99.
 */
export function equalSplitBasisPoints(n: number): number[] {
  if (!Number.isInteger(n) || n < 1) return [];
  const base = Math.floor(FULL_SPLIT_BP / n);
  const remainder = FULL_SPLIT_BP - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < remainder ? 1 : 0));
}

/** 50 → "50", 33.34 → "33.34", 12.5 → "12.5". */
export function formatPct(pct: number): string {
  return String(Math.round(pct * 100) / 100);
}

/**
 * Keep only what can become a percentage while typing: digits and a single
 * decimal point with at most two digits after it.
 *
 * A minus sign cannot be typed at all, which is how the dialog prevents a
 * negative share rather than merely complaining about one. The server still
 * refuses negatives, for any client that does not go through this.
 */
export function sanitizePctTyping(raw: string): string {
  let s = raw.replace(/[^0-9.]/g, "");
  const dot = s.indexOf(".");
  if (dot !== -1) {
    s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, "").slice(0, 2);
  }
  // "007" → "7", but "0" and "0.5" survive.
  s = s.replace(/^0+(?=\d)/, "");
  return s.slice(0, 6);
}

/** The typed text as a number, or null while it is empty or half-typed ("."). */
export function parsePct(raw: string): number | null {
  const s = raw.trim();
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** The message for a total that is not exactly 100%, or null when it is. */
export function splitTotalMessage(totalBp: number): string | null {
  if (totalBp === FULL_SPLIT_BP) return null;
  return totalBp > FULL_SPLIT_BP ? "Split cannot exceed 100%." : "Split must total 100%.";
}

export type SplitCheck =
  | { ok: true; shares: SplitShareInput[]; totalBp: number }
  | { ok: false; error: string; totalBp: number };

/**
 * Validate a split. `totalBp` counts only the shares that are usable, so the
 * dialog can show a live total while a row is still half-typed.
 *
 * The requester must be one of the people. A request is filed by an employee
 * for themselves (`createIncentiveRequest` has always inserted `employee_id =
 * me`); a split that left them out would be a request filed purely on other
 * people's behalf, which the existing authorisation model does not allow.
 */
export function checkSplit(
  rows: readonly SplitRowDraft[],
  opts: { requesterId: string },
): SplitCheck {
  let totalBp = 0;
  for (const r of rows) totalBp += pctToBasisPoints(r.pct) ?? 0;
  const fail = (error: string): SplitCheck => ({ ok: false, error, totalBp });

  if (rows.length < MIN_SPLIT_PEOPLE) return fail("Add at least one more person to split with.");
  if (rows.length > MAX_SPLIT_PEOPLE) return fail(`A split can include at most ${MAX_SPLIT_PEOPLE} people.`);
  if (rows.some((r) => !r.employeeId)) return fail("Pick an employee for every person in the split.");
  if (new Set(rows.map((r) => r.employeeId)).size !== rows.length) {
    return fail("Each person can appear in the split only once.");
  }
  if (!rows.some((r) => r.employeeId === opts.requesterId)) {
    return fail("You must be one of the people in the split.");
  }
  for (const r of rows) {
    const issue = pctIssue(r.pct);
    if (issue) return fail(issue);
  }
  const totalIssue = splitTotalMessage(totalBp);
  if (totalIssue) return fail(totalIssue);

  return {
    ok: true,
    totalBp,
    shares: rows.map((r) => ({ employeeId: r.employeeId, pct: Math.round((r.pct as number) * 100) / 100 })),
  };
}
