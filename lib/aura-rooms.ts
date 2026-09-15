import { MODULE_THEME, MODULE_ORDER, moduleShortcut } from "@/lib/module-theme";
import { WORKSPACE_LANDING, type WorkspaceId } from "@/lib/workspaces";

/**
 * The room list the Aura top bar renders — name, tagline, colour, landing route
 * and keyboard digit, for each workspace the signed-in user may enter.
 *
 * THIS LIVES IN ITS OWN MODULE, not beside the bar, because the bar is a client
 * component: a function exported from a `"use client"` file cannot be CALLED on
 * the server, only rendered. The `(app)` layout builds this list server-side
 * from the `access` it already resolved, so it has to come from a module with
 * no client boundary. (That mistake cost a server-side crash on every route the
 * first time the bar was wired up.)
 *
 * Everything here is a plain string, so the result crosses the server → client
 * boundary as-is. The lucide `Icon` component deliberately does NOT: the bar
 * reads it from `MODULE_THEME` on the client side instead, because a component
 * is not serialisable.
 */
export interface AuraRoom {
  id: WorkspaceId;
  label: string;
  tagline: string;
  href: string;
  /** Identity colour — the rail dot and the tab dot. */
  accent: string;
  /** Deeper step of the same hue, for a glyph that must stay readable. */
  accentDeep: string;
  /** 1–9/0, or null past the tenth room. */
  shortcut: string | null;
}

export function roomsFor(allowed: WorkspaceId[]): AuraRoom[] {
  return allowed.map((id) => {
    const m = MODULE_THEME[id];
    return {
      id,
      label: m.label,
      tagline: m.tagline,
      href: WORKSPACE_LANDING[id],
      accent: m.accent,
      accentDeep: m.accentDeep,
      shortcut: moduleShortcut(MODULE_ORDER.indexOf(id)),
    };
  });
}
