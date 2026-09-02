import { cookies } from "next/headers";
import { getNavCounts } from "@/lib/queries/nav-counts";
import { getCurrentEmployee } from "@/lib/auth/current";
import { goalsCanvasOn } from "@/lib/goals/flag";
import { goalsSpace } from "@/lib/goals/space";
import { directReportIds } from "@/lib/productivity/access";
import { ACTIVE_WORKSPACE_COOKIE, isWorkspaceId } from "@/lib/workspaces";
import { canAccessAdminPanel } from "@/lib/hh/access";
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

  // Which workspace the user entered via the hub (set by /ws/<id>). The client
  // nav still lets the current path override this, so it only matters for shared
  // surfaces (Inbox / Profile / Admin) that belong to no single room.
  const awRaw = (await cookies()).get(ACTIVE_WORKSPACE_COOKIE)?.value;
  const cookieWorkspace = isWorkspaceId(awRaw) ? awRaw : undefined;
  const space = await goalsSpace(Boolean(me?.isAdmin));

  // Manager status is DERIVED from the hierarchy (someone is a manager because
  // people report to them), resolved here for the same reason goalsCanvasEnabled
  // is: the client nav cannot query the org chart. It gates the Productivity
  // module's Team Performance entry, which §19 keeps away from employees.
  const isManager = me ? (await directReportIds(me.id).catch(() => [])).length > 0 : false;

  // Hand-holding's Admin Panel is Manan Vasa and the Accountant only, and that
  // rule reads the departments tables — so it is resolved here, like isManager,
  // rather than guessed at in the client nav. The page enforces it again server-side; this
  // only decides whether the rail entry is worth showing.
  const canSeeHhAccess = me ? await canAccessAdminPanel(me).catch(() => false) : false;

  return (
    <MainNav
      activeTasks={activeTasks}
      isAdmin={Boolean(me?.isAdmin)}
      variant={variant}
      cookieWorkspace={cookieWorkspace}
      // bug #11 — GOALS_CANVAS_ON is a server-only env var (not NEXT_PUBLIC),
      // so the client nav can't read it; resolve it HERE and thread it down so
      // the Goals level pills hide/repoint instead of silently bouncing.
      goalsCanvasEnabled={goalsCanvasOn()}
      goalsSpace={space}
      isManager={isManager}
      canSeeHhAccess={canSeeHhAccess}
    />
  );
}
