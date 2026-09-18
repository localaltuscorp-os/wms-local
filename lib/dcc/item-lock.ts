import { isProtectedDccKpiAuthor } from "@/lib/security/capabilities";

/**
 * WHO MAY DELETE A DCC KPI (account holder, 2026-09-15).
 *
 *   · Team Leads add KPIs for themselves and for everyone below them, and may
 *     delete the KPIs they or anyone else added — the reach itself is
 *     `canManageItemsFor` in lib/dcc/access.ts.
 *   · A KPI given by Manan Sir (holder of `dcc.protected_kpi_author`) can be
 *     deleted by him alone: not by the Team Lead, not by the owner, not by
 *     another super-admin.
 *
 * Decided from the KPI's recorded creator (`dcc_kpi_items.created_by_id`).
 * Pure: the delete action enforces it, and the /dcc page reads the same
 * function to hide the Delete button, so the two cannot disagree.
 */

export type DccItemDeleteCheck = { ok: true } | { ok: false; error: string };

export const DCC_GIVEN_KPI_LOCKED = "Manan Sir gave this KPI. Only he can delete it.";

export function checkDccItemDelete(args: {
  /** The person trying to delete. */
  actorEmail: string | null | undefined;
  /** Email of the employee who created the KPI; null when unrecorded. */
  creatorEmail: string | null | undefined;
}): DccItemDeleteCheck {
  if (!isProtectedDccKpiAuthor(args.creatorEmail)) return { ok: true };
  if (isProtectedDccKpiAuthor(args.actorEmail)) return { ok: true };
  return { ok: false, error: DCC_GIVEN_KPI_LOCKED };
}
