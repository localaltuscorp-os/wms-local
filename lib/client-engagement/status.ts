/**
 * CLIENT ENGAGEMENT — the two status axes, and which accounts count as inactive.
 *
 * LIFECYCLE (where the account is in its life): Active · Inactive · Churned ·
 * Completed.
 *
 * HAND-HOLDING STATUS (the colour band the team's sheet uses):
 *   Standard        plain row                     (white)
 *   Revenue Share   we share revenue              purple #B02A87, white text
 *   Fee Recovery    recovering fees via references red    #E53935, white text
 *   Not Started     hand-holding not started yet  cyan   #00BCD4, dark text
 *   On Hold         hand-holding paused           yellow #FDD835, dark text
 *
 * The hexes are the business's own colour code, given in the brief, so they are
 * used as given rather than mapped to the app's pastel families: the team reads
 * these colours off the sheet today, and a softened purple would be a different
 * signal.
 *
 * INACTIVE VIEW. An account shows on the Inactive side when its lifecycle is not
 * Active OR it is On Hold. Nothing is written when a client goes on hold — the
 * view is derived — so their coach (assigned_to) is preserved automatically and
 * taking them off hold brings them straight back to Active.
 *
 * PURE + CLIENT-SAFE.
 */

export const CE_LIFECYCLES = [
  { code: "active", label: "Active" },
  { code: "inactive", label: "Inactive" },
  { code: "churned", label: "Churned" },
  { code: "completed", label: "Completed" },
] as const;

export type CeLifecycle = (typeof CE_LIFECYCLES)[number]["code"];

export const CE_LIFECYCLE_CODES: readonly string[] = CE_LIFECYCLES.map((l) => l.code);

export function lifecycleLabel(code: string): string {
  return CE_LIFECYCLES.find((l) => l.code === code)?.label ?? code;
}

export interface CeHhStatusMeta {
  code: CeHhStatus;
  label: string;
  /** Fill and text for the pill; null for Standard, which is a plain row. */
  bg: string | null;
  fg: string | null;
}

export type CeHhStatus = "standard" | "revenue_share" | "fee_recovery" | "not_started" | "on_hold";

export const CE_HH_STATUSES: readonly CeHhStatusMeta[] = [
  { code: "standard", label: "Standard", bg: null, fg: null },
  { code: "revenue_share", label: "Revenue Share", bg: "#B02A87", fg: "#FFFFFF" },
  { code: "fee_recovery", label: "Fee Recovery", bg: "#E53935", fg: "#FFFFFF" },
  { code: "not_started", label: "HH Not Started", bg: "#00BCD4", fg: "#0B2E33" },
  { code: "on_hold", label: "HH On Hold", bg: "#FDD835", fg: "#3D3300" },
];

export const CE_HH_STATUS_CODES: readonly string[] = CE_HH_STATUSES.map((s) => s.code);

export function hhStatusMeta(code: string | null | undefined): CeHhStatusMeta {
  return CE_HH_STATUSES.find((s) => s.code === code) ?? CE_HH_STATUSES[0]!;
}

export interface CeStatusInput {
  lifecycleStatus: string;
  hhStatus: string;
}

/** True when the account belongs on the Inactive side of every view. */
export function isInactiveAccount(a: CeStatusInput): boolean {
  return a.lifecycleStatus !== "active" || a.hhStatus === "on_hold";
}
