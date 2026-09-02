import "server-only";

/**
 * WS-6 kill-switch for the incentive PAYOUT — the ONE flow in this workstream
 * that MOVES MONEY records (writes an `incentive_payout_events` row + a
 * `salary_payments` row, marks the incentive paid, links it to a salary run).
 *
 * Because it moves money it is DEFAULT OFF and must be EXPLICITLY enabled by
 * setting `INCENTIVE_PAYOUT=true` in the environment (anything else = off).
 * The payout server action re-reads this INDEPENDENTLY — inside its DB
 * transaction — so a mutation can never fire while the flag is off, even if a
 * stale client somehow posts.
 *
 * This is SEPARATE from `INCENTIVE_STATUS_UI` (which only reveals the Booked /
 * Accrued / Paid *display + editor*, not the money-moving payout).
 */
export function incentivePayoutEnabled(): boolean {
  return process.env.INCENTIVE_PAYOUT === "true";
}

/** The env var name, exported so callers/log lines never hard-code the string. */
export const INCENTIVE_PAYOUT_FLAG = "INCENTIVE_PAYOUT" as const;
