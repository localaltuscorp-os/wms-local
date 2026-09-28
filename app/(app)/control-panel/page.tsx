import { redirect } from "next/navigation";
import type { Route } from "next";
import { requireWorkspace } from "@/lib/auth/workspace-access";

// A forwarder, not a screen — see below. `force-dynamic` is what keeps Next
// 16.2.6 from treating the redirect as an MPA navigation and throwing before
// its last hooks, which is the failure that moved the other pure forwards into
// next.config.ts. This one cannot live there: it has to run the room's own
// access check first, and a routing-layer redirect has no request context.
export const dynamic = "force-dynamic";

/**
 * CONTROL PANEL front door — a FORWARDER, not a page.
 *
 * The room opens on Users, which is the screen it opened on when it was a group
 * inside the Admin Panel. A menu page here would repeat the rail in the middle
 * of the screen, which is the same call the Operations room made when it
 * dropped its area deck.
 *
 * ── WHY `/control-panel` IS A ROUTE AT ALL ────────────────────────────────
 * Three things name it and would break on a 404: `WORKSPACE_LANDING` (where the
 * hub card, the top bar's room list and the `aw` cookie send you), the
 * permission catalogue's `control-panel` module node — a node that must own a
 * route to be governable, and one which the module's own visibility check reads
 * by key — and whatever bookmarks exist. Forwarding keeps all three working and
 * leaves exactly one place that decides where the room opens: this file.
 *
 * ── THE GUARD IS EXPLICIT, NOT INHERITED ──────────────────────────────────
 * The (app) layout gates this path too, but a page that forwards never renders
 * anything, so the check is repeated here for the same reason every other
 * forwarder does it: the refusal should be legible at the route being asked
 * for, not one file away.
 */
export default async function ControlPanelPage() {
  await requireWorkspace("control-panel");
  redirect("/control-panel/roles" as Route);
}
