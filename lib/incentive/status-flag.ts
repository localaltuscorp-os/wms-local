import "server-only";

/**
 * WS-6 kill-switch. The Incentive three-status UI (Booked / Accrued / Paid
 * editor, the Status report tab, and the team-split editor) plus every money
 * mutation those surfaces perform stay INERT until this flag is flipped to
 * "true" in the environment. Default = OFF, so nothing changes for live users
 * until Sir verifies and enables it.
 *
 * Read on the server only. The page (a server component) resolves it once and
 * passes the resulting boolean down as a prop; each server action ALSO re-reads
 * it independently so a mutation can never fire while the flag is off, even if a
 * stale client somehow posts.
 */
export function incentiveStatusUiEnabled(): boolean {
  // Default ON (Sir 2026-07-09 — reveal the visible screens). Still killable in
  // prod by setting INCENTIVE_STATUS_UI=false. The actual employee PAYOUT
  // (money leaving the account) is a separate flow behind DISPATCH_V2 (off).
  return process.env.INCENTIVE_STATUS_UI !== "false";
}

/** The env var name, exported so callers/log lines never hard-code the string. */
export const INCENTIVE_STATUS_UI_FLAG = "INCENTIVE_STATUS_UI" as const;
