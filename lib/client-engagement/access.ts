/**
 * CLIENT ENGAGEMENT — the shared, CLIENT-SAFE leftovers: the actor shape, and
 * the name managers are called by in copy ("Only Super Admins and HR can…").
 *
 * The actual RULES — who may manage, view any calendar, or edit an account —
 * moved to ./access-server on 2026-09-28 (replacing a hardcoded two-email
 * allowlist with real roles via `isHrStaff`, which needs a database
 * department lookup and therefore `server-only`). This file stays free of
 * that import so a CLIENT component can still pull `CE_MANAGER_NAMES` to word
 * an inline note without dragging a server-only module into its bundle.
 *
 * PURE + CLIENT-SAFE.
 */

export interface CeActor {
  id?: string | null;
  email?: string | null;
  name?: string | null;
  isAdmin?: boolean | null;
}

export const CE_MANAGER_NAMES = "Super Admins and HR";
