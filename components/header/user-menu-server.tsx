import { getCurrentEmployee } from "@/lib/auth/current";
import { getNavCounts } from "@/lib/queries/nav-counts";
import { UserMenu } from "./user-menu";

export async function UserMenuServer({ variant }: { variant?: "rail" } = {}) {
  const me = await getCurrentEmployee();
  if (!me) return null;
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
      avatarUrl={me.avatarUrl}
      inboxUnread={inboxUnread}
      archivedTasks={archivedTasks}
      variant={variant}
    />
  );
}
