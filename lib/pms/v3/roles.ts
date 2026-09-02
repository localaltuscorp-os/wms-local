/**
 * PMS v3 (WS-2) — who may do what.
 *
 * "Manan" is the apex reviewer: he scores everyone, adds X-Factor points, and is
 * the ONLY person who may see the Q1/Q2 justifications. Operationally this maps to
 * the super-admin allow-list (SUPER_ADMIN_EMAILS already contains manan@unleashed.in
 * plus the owner who acts on his behalf).
 *
 * ⚠️ AMBIGUITY (see INTEGRATION NOTE): if "Manan-only" must mean literally the one
 * account manan@unleashed.in (excluding the owner), tighten `canActAsManan` to a
 * dedicated MANAN_EMAILS list. Kept as super-admin for now so the owner can operate
 * the surface during the dark rollout.
 */
import { isSuperAdmin } from "@/lib/auth/super-admin";

/** May score as Manan, add X-Factor, and see the Q1/Q2 justifications. */
export function canActAsManan(email: string | null | undefined): boolean {
  return isSuperAdmin(email);
}
