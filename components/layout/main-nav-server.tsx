import { getNavCounts } from "@/lib/queries/nav-counts";
import { getCurrentEmployee } from "@/lib/auth/current";
import { MainNav } from "./main-nav";

export async function MainNavServer({ variant }: { variant?: "drawer" } = {}) {
  const me = await getCurrentEmployee();
  // Only the active-tasks badge lives on the nav now; Inbox / Archived counts
  // moved into the user menu (see UserMenuServer). The task totals come from a
  // shared cache, so re-reading them there is a cache hit, not a second query.
  const { activeTasks } = await getNavCounts(
    me
      ? {
          userId: me.id,
          isAdmin: me.isAdmin,
          inboxSince: me.lastInboxVisitAt,
        }
      : undefined,
  );
  return (
    <MainNav
      activeTasks={activeTasks}
      isAdmin={Boolean(me?.isAdmin)}
      variant={variant}
    />
  );
}
