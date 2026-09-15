import type { ReactNode } from "react";
import { requireUser, getSignedInEmployee, forbiddenError } from "@/lib/auth/current";
import { isMasterAdmin } from "@/lib/security/capabilities";

/**
 * MASTER ADMIN — the route gate.
 *
 * ── WHY THIS IS ITS OWN ROUTE GROUP AND NOT `/admin/...` ───────────────────
 * The `/admin` tree is gated on `isAdmin`, which is a dozen people. This module
 * is gated on `master_admin.manage`, which is two. Nesting it under `/admin`
 * would mean a permission surface whose parent layout admits far more people
 * than the child does — technically fine, but the kind of arrangement where a
 * later refactor of the parent quietly widens the child. A separate group makes
 * the narrower gate the only gate on the path.
 *
 * ── A 403, NOT A REDIRECT ──────────────────────────────────────────────────
 * The rest of the app bounces the unauthorised to `/hub`, because they are
 * usually somebody who followed a stale link. Here a request is either from one
 * of two people or it is somebody trying a URL, and the honest answer to the
 * second is a refusal. It also keeps the behaviour identical between a page load
 * and a POST to one of the actions, which throw the same 403.
 *
 * ── AND THE PAGE GATE IS NOT THE REAL GATE ─────────────────────────────────
 * Every server action in `./actions.ts` re-checks `isMasterAdmin` itself. This
 * layout stops the page rendering; that stops the endpoints running. Both are
 * needed, because a layout cannot gate a server action.
 */
export const dynamic = "force-dynamic";

export default async function MasterAdminLayout({ children }: { children: ReactNode }) {
  await requireUser();
  // The REAL signed-in person: a delegated session must not inherit the matrix
  // through a borrowed account. (Privileged accounts cannot be delegated at all,
  // so this is defence in depth.)
  const me = await getSignedInEmployee();
  if (!me || !isMasterAdmin(me.email)) throw forbiddenError();
  return <>{children}</>;
}
