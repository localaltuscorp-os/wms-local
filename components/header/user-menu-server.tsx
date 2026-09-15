import { getCurrentEmployee, getSignedInEmployee } from "@/lib/auth/current";
import { getNavCounts } from "@/lib/queries/nav-counts";
import { isMasterAdmin } from "@/lib/security/capabilities";
import { UserMenu } from "./user-menu";

export async function UserMenuServer({ variant }: { variant?: "rail" } = {}) {
  const me = await getCurrentEmployee();
  if (!me) return null;

  // ── THE MASTER ADMIN LINK IS DECIDED ON THE REAL SIGNED-IN PERSON ────────
  // Not the effective one. Under a temporary delegated session `me` is the
  // account being tested, and a delegate must never be offered the permission
  // matrix because the borrowed identity happens to hold the capability.
  // (A privileged account cannot be delegated at all, so in practice this
  // branch is unreachable — but the menu is the wrong place to rely on that.)
  const real = await getSignedInEmployee();
  const masterAdmin = isMasterAdmin(real?.email);
  // Inbox + Archived now live inside this menu, so it carries their counts —
  // the unread badge that used to sit on the nav pill moves here (plus a dot
  // on the avatar). Task totals are a shared cache hit; only the per-user
  // unread count actually queries.
  const { inboxUnread, archivedTasks } = await getNavCounts({
    userId: me.id,
    isAdmin: me.isAdmin,
    inboxSince: me.lastInboxVisitAt,
  });
  return (
    <UserMenu
      name={me.name}
      email={me.email}
      isAdmin={me.isAdmin}
      isMasterAdmin={masterAdmin}
      avatarUrl={me.avatarUrl}
      inboxUnread={inboxUnread}
      archivedTasks={archivedTasks}
      variant={variant}
    />
  );
}
