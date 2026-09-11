import { getCurrentEmployee } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { canAccessAdminPanel } from "@/lib/hh/access";
import { OperationsQuickNav } from "./operations-quick-nav";

/**
 * Server wrapper for the Operations quick-access row.
 *
 * The row's two gates cannot be decided in the browser: `hhAccessOnly` reads the
 * HR tables behind lib/hh/access, and `adminOnly` should not depend on a flag
 * the client could be handed wrongly. Resolving both here means the layouts that
 * mount this stay plain, and a link is never rendered for a door that will not
 * open.
 *
 * MOUNTED IN THREE LAYOUTS, because the four Operations areas do not share a
 * route tree: /operations/* is its own, while Hand-holding lives at
 * /people-allocation and Monthly Events Master at /events — both kept at their
 * original paths when they moved into the room, so every existing link and
 * bookmark still resolves. One component in three layouts is the price of not
 * breaking those.
 *
 * `canAccessAdminPanel` is caught rather than allowed to throw: a slow or
 * failing HR read must not take down every page in the room, and the safe
 * failure is to hide one admin link.
 */
export async function OperationsQuickNavServer() {
  const me = await getCurrentEmployee().catch(() => null);
  if (!me) return null;

  const isAdmin = me.isAdmin || isSuperAdmin(me.email);
  const canSeeHhAccess = await canAccessAdminPanel(me).catch(() => false);

  return <OperationsQuickNav isAdmin={isAdmin} canSeeHhAccess={canSeeHhAccess} />;
}
