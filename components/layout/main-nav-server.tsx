import { cache } from "react";
import { cookies } from "next/headers";
import { getNavCounts } from "@/lib/queries/nav-counts";
import { getCurrentEmployee } from "@/lib/auth/current";
import { goalsCanvasOn } from "@/lib/goals/flag";
import { goalsSpace } from "@/lib/goals/space";
import { directReportIds } from "@/lib/productivity/access";
import { ACTIVE_WORKSPACE_COOKIE, isWorkspaceId } from "@/lib/workspaces";
import { canAccessAdminPanel } from "@/lib/hh/access";
import { hiddenModuleKeys } from "@/lib/permissions/resolve";
import { withTimeoutOr } from "@/lib/db/with-timeout";
import { MainNav } from "./main-nav";

const CHROME_QUERY_TIMEOUT_MS = 5_000;

/**
 * One request-scoped snapshot feeds every responsive navigation copy.
 * Desktop and mobile navigation coexist in the React tree. React cache keeps
 * their orchestration to one run for this server render only; identity and
 * permissions are never reused across requests or users.
 */
const loadMainNavSnapshot = cache(async () => {
  const me = await getCurrentEmployee();
  const cookieStore = await cookies();
  const awRaw = cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value;
  const cookieWorkspace = isWorkspaceId(awRaw) ? awRaw : undefined;
  const navArgs = me
    ? { userId: me.id, isAdmin: me.isAdmin, inboxSince: me.lastInboxVisitAt }
    : undefined;

  // These values only decorate navigation. Load them concurrently and bound
  // their wait so an optional badge or menu hint cannot hold every page open.
  // Route/page authorization still runs separately and remains fail-closed.
  const [counts, space, reports, canSeeHhAccess, hidden] = await Promise.all([
    withTimeoutOr(
      getNavCounts(navArgs),
      CHROME_QUERY_TIMEOUT_MS,
      { activeTasks: 0, archivedTasks: 0, inboxUnread: 0 },
      "main-nav counts",
    ),
    goalsSpace(Boolean(me?.isAdmin)),
    me
      ? withTimeoutOr(directReportIds(me.id), CHROME_QUERY_TIMEOUT_MS, [], "main-nav reports")
      : Promise.resolve([] as string[]),
    me
      ? withTimeoutOr(
          canAccessAdminPanel(me),
          CHROME_QUERY_TIMEOUT_MS,
          false,
          "main-nav admin hint",
        )
      : Promise.resolve(false),
    withTimeoutOr(
      hiddenModuleKeys(),
      CHROME_QUERY_TIMEOUT_MS,
      null,
      "main-nav hidden modules",
    ),
  ]);

  return {
    activeTasks: counts.activeTasks,
    canSeeHhAccess,
    cookieWorkspace,
    hidden,
    isAdmin: Boolean(me?.isAdmin),
    isManager: reports.length > 0,
    space,
  };
});

export async function MainNavServer({ variant }: { variant?: "drawer" } = {}) {
  const snapshot = await loadMainNavSnapshot();

  return (
    <MainNav
      hiddenNodeKeys={snapshot.hidden ? [...snapshot.hidden] : undefined}
      activeTasks={snapshot.activeTasks}
      isAdmin={snapshot.isAdmin}
      variant={variant}
      cookieWorkspace={snapshot.cookieWorkspace}
      goalsCanvasEnabled={goalsCanvasOn()}
      goalsSpace={snapshot.space}
      isManager={snapshot.isManager}
      canSeeHhAccess={snapshot.canSeeHhAccess}
    />
  );
}
