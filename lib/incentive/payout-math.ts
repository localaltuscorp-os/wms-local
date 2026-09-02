/**
 * WS-6 — Incentive payout MATH (PURE, no I/O). The single source of truth for
 * "how much do we pay this person's incentive right now?", consumed by the
 * transactional `payIncentivesWithRun` action and unit-tested in isolation.
 *
 * Model (spec WS-6): Booked = client paid PARTIAL · Accrued = client paid in
 * FULL · Paid = we paid the EMPLOYEE. We pay the employee only what the client
 * has fully paid, so the payable CEILING defaults to ACCRUED. `payNow` is always
 * `max(0, ceiling − alreadyPaid)`, so re-running the plan after a full payout
 * yields 0 for every leg (idempotent — no double-pay). All money rounded to
 * paise.
 *
 * This file has NO `server-only` and NO runtime imports from the DB layer, so it
 * loads cleanly in the Vitest (node) environment.
 */

export type PayoutBasis = "accrued" | "approved";

/** Round to two decimal places (paise). */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** One payable leg of a person's incentive (an entry, a project leg, or a
 *  team-split participant), reduced to the numbers the planner needs. */
export interface IncentiveSource {
  /** Stable identity for the leg (`entry:<id>`, `project:<id>:sup`, `participant:<id>`…). */
  key: string;
  /** Approved (earned/owed) amount — the ceiling under the "approved" basis. */
  approved: number;
  /** Booked = client partial payment (display only; never a payout ceiling). */
  booked: number;
  /** Accrued = client paid in full — the ceiling under the default basis. */
  accrued: number;
  /** Amount already paid to the employee for this leg. */
  paid: number;
}

export interface SourcePayout {
  key: string;
  /** The payable ceiling for this leg under the chosen basis (≥ 0). */
  ceiling: number;
  /** Amount already paid before this run (≥ 0). */
  alreadyPaid: number;
  /** Amount to pay in THIS run — floored at 0 (idempotent, never negative). */
  payNow: number;
  /** What `paid` should become after the write (`alreadyPaid + payNow`). */
  newPaidTotal: number;
}

export interface PayoutPlan {
  basis: PayoutBasis;
  sources: SourcePayout[];
  /** Σ ceiling — the Amount Payable. */
  totalPayable: number;
  /** Σ alreadyPaid — the Amount Paid BEFORE this run. */
  totalAlreadyPaid: number;
  /** Σ payNow — what moves in this run. */
  totalPayNow: number;
  /** Amount Paid AFTER this run (`totalAlreadyPaid + totalPayNow`). */
  totalPaidAfter: number;
  /** `totalPayable − totalPaidAfter`; `≤ 0` ⇒ the account nils out. */
  remainderAfter: number;
  /** True when, after this run, `paid ≥ ceiling` for every leg. */
  nils: boolean;
}

function ceilingFor(s: IncentiveSource, basis: PayoutBasis): number {
  return basis === "approved" ? s.approved : s.accrued;
}

/**
 * Plan a person's incentive payout across all their legs for one run.
 *
 * IDEMPOTENCY: `payNow = max(0, ceiling − alreadyPaid)`. Feeding the plan's
 * `newPaidTotal` back as `paid` (i.e. re-running after the write) produces
 * `payNow === 0` everywhere — so a double-submit can never over-pay. Booked-only
 * legs (accrued 0) are payable 0 under the default basis: we do not pay money
 * the client has only partially paid.
 */
export function planIncentivePayout(
  sources: IncentiveSource[],
  basis: PayoutBasis = "accrued",
): PayoutPlan {
  const rows: SourcePayout[] = sources.map((s) => {
    const ceiling = round2(Math.max(0, ceilingFor(s, basis)));
    const alreadyPaid = round2(Math.max(0, s.paid));
    const payNow = round2(Math.max(0, ceiling - alreadyPaid));
    return {
      key: s.key,
      ceiling,
      alreadyPaid,
      payNow,
      newPaidTotal: round2(alreadyPaid + payNow),
    };
  });

  const totalPayable = round2(rows.reduce((a, r) => a + r.ceiling, 0));
  const totalAlreadyPaid = round2(rows.reduce((a, r) => a + r.alreadyPaid, 0));
  const totalPayNow = round2(rows.reduce((a, r) => a + r.payNow, 0));
  const totalPaidAfter = round2(totalAlreadyPaid + totalPayNow);
  const remainderAfter = round2(totalPayable - totalPaidAfter);

  return {
    basis,
    sources: rows,
    totalPayable,
    totalAlreadyPaid,
    totalPayNow,
    totalPaidAfter,
    remainderAfter,
    // A tiny epsilon guards against float dust on the "nils" verdict.
    nils: rows.every((r) => r.newPaidTotal + 1e-9 >= r.ceiling),
  };
}

/** Amount Payable vs Amount Paid summary for a display row (no write). */
export interface NilView {
  payable: number;
  paid: number;
  /** payable − paid; `≤ 0` ⇒ nil. */
  remainder: number;
  nils: boolean;
}

/** Bookkeeping "does the account nil out?" view for one person/row. */
export function nilView(payable: number, paid: number): NilView {
  const p = round2(Math.max(0, payable));
  const q = round2(Math.max(0, paid));
  const remainder = round2(p - q);
  return { payable: p, paid: q, remainder, nils: remainder <= 0 };
}
